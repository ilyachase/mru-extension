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

    const result = await chrome.storage.local.get('windowTabHistories_v2');
    const windowTabHistories: { [windowId: number]: number[] } = result.windowTabHistories_v2 || {};

    if (!windowTabHistories[tabInfo.windowId]) {
        windowTabHistories[tabInfo.windowId] = [];
    }

    const windowHistory = windowTabHistories[tabInfo.windowId];
    const foundIndex = windowHistory.findIndex((tabId: number) => tabId === tabInfo.tabId);

    if (foundIndex !== -1) {
        windowHistory.splice(foundIndex, 1);
    }

    windowHistory.unshift(tabInfo.tabId);

    if (windowHistory.length > 100) {
        windowHistory.splice(100);
    }

    const trackedWindowCount = Object.keys(windowTabHistories).length;
    if (trackedWindowCount > 100) {
        const allWindows = await chrome.windows.getAll();
        const existingWindowIds = new Set(allWindows.map((window) => window.id).filter((id) => id !== undefined));

        for (const windowId in windowTabHistories) {
            const id = parseInt(windowId, 10);
            if (!existingWindowIds.has(id)) {
                delete windowTabHistories[id];
            }
        }
    }

    await chrome.storage.local.set({ windowTabHistories_v2: windowTabHistories });
}

chrome.runtime.onInstalled.addListener(async () => {
    const windowTabHistories: { [windowId: number]: number[] } = {};
    const tabInfo = await getCurrentTab();
    if (tabInfo.id !== undefined && tabInfo.windowId !== undefined) {
        windowTabHistories[tabInfo.windowId] = [tabInfo.id];
    }

    await chrome.storage.local.set({ windowTabHistories_v2: windowTabHistories });
});

chrome.tabs.onActivated.addListener(async (tabInfo: chrome.tabs.OnActivatedInfo) => {
    await handleTabActivated(tabInfo);
});

chrome.tabs.onRemoved.addListener(async (tabId: number, removeInfo: chrome.tabs.OnRemovedInfo) => {
    while (removingTabInProgress) {
        await wait();
    }

    removingTabInProgress = true;
    const result = await chrome.storage.local.get('windowTabHistories_v2');
    const windowTabHistories: { [windowId: number]: number[] } = result.windowTabHistories_v2 || {};

    const windowHistory = windowTabHistories[removeInfo.windowId];
    if (windowHistory) {
        windowTabHistories[removeInfo.windowId] = windowHistory.filter(
            (historyTabId: number) => historyTabId !== tabId
        );
    }

    await chrome.storage.local.set({ windowTabHistories_v2: windowTabHistories });
    removingTabInProgress = false;
});

chrome.commands.onCommand.addListener(async () => {
    const result = await chrome.storage.local.get('windowTabHistories_v2');
    const windowTabHistories: { [windowId: number]: number[] } = result.windowTabHistories_v2 || {};

    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id === undefined) {
        return;
    }

    const currentWindowHistory = windowTabHistories[currentWindow.id];

    if (!currentWindowHistory || currentWindowHistory.length < 2) {
        return;
    }

    const secondMostRecentTabId = currentWindowHistory[1];
    await chrome.tabs.update(secondMostRecentTabId, { highlighted: true, active: true });
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

chrome.windows.onRemoved.addListener(async (windowId: number) => {
    const result = await chrome.storage.local.get('windowTabHistories_v2');
    const windowTabHistories: { [windowId: number]: number[] } = result.windowTabHistories_v2 || {};

    if (windowTabHistories[windowId]) {
        delete windowTabHistories[windowId];
        await chrome.storage.local.set({ windowTabHistories_v2: windowTabHistories });
    }
});
