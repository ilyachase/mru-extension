let removingTabInProgress = false;

const wait = (): Promise<boolean> => new Promise((resolve) => setTimeout(() => resolve(true), 50));

async function getCurrentTab(): Promise<chrome.tabs.Tab> {
    const queryOptions = { active: true, currentWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

async function handleTabActivated(tabInfo: chrome.tabs.OnActivatedInfo): Promise<void> {
    while (removingTabInProgress) {
        await wait();
    }

    const result = await chrome.storage.local.get('tabsHistory');
    const tabsHistory: chrome.tabs.OnActivatedInfo[] = result.tabsHistory;

    const foundIndex = tabsHistory.findIndex(
        (historyTabInfo: chrome.tabs.OnActivatedInfo) => historyTabInfo.tabId === tabInfo.tabId
    );
    if (foundIndex !== -1) {
        tabsHistory.splice(foundIndex, 1);
    }

    tabsHistory.unshift(tabInfo);

    await chrome.storage.local.set({ tabsHistory });
}

chrome.runtime.onInstalled.addListener(async () => {
    const tabsHistory: chrome.tabs.OnActivatedInfo[] = [];
    const tabInfo = await getCurrentTab();
    if (tabInfo.id !== undefined && tabInfo.windowId !== undefined) {
        tabsHistory.push({ tabId: tabInfo.id, windowId: tabInfo.windowId });
    }

    await chrome.storage.local.set({ tabsHistory });
});

chrome.tabs.onActivated.addListener(async (tabInfo: chrome.tabs.OnActivatedInfo) => {
    await handleTabActivated(tabInfo);
});

chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    while (removingTabInProgress) {
        await wait();
    }

    removingTabInProgress = true;
    const result = await chrome.storage.local.get('tabsHistory');
    let tabsHistory: chrome.tabs.OnActivatedInfo[] = result.tabsHistory;

    tabsHistory = tabsHistory.filter((historyTabInfo: chrome.tabs.OnActivatedInfo) => historyTabInfo.tabId !== tabId);

    await chrome.storage.local.set({ tabsHistory });
    removingTabInProgress = false;
});

chrome.commands.onCommand.addListener(async () => {
    const result = await chrome.storage.local.get('tabsHistory');
    const tabsHistory: chrome.tabs.OnActivatedInfo[] = result.tabsHistory;

    if (tabsHistory.length < 2) {
        return;
    }

    const currentWindow = await chrome.windows.getCurrent();
    if (tabsHistory[1].windowId !== currentWindow.id) {
        await chrome.windows.update(tabsHistory[1].windowId, { focused: true });
    }

    await chrome.tabs.update(tabsHistory[1].tabId, { highlighted: true, active: true });
});

chrome.windows.onFocusChanged.addListener(
    async (windowId: number) => {
        if (windowId === -1) {
            return;
        }

        const tabInfo = await getCurrentTab();
        if (!tabInfo) {
            return;
        }

        if (tabInfo.id !== undefined && tabInfo.windowId !== undefined) {
            await handleTabActivated({ tabId: tabInfo.id, windowId: tabInfo.windowId });
        }
    },
    { windowTypes: ['normal'] }
);
