let removingTabInProgress = false, debug = false;

const wait = () =>
    new Promise(resolve =>
        setTimeout(() => resolve(true), 50)
    );

async function getCurrentTab() {
    let queryOptions = {active: true, currentWindow: true};
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

async function handleTabActivated(tabInfo) {
    if (debug) {
        console.log('Tab activated: ' + tabInfo.tabId);
    }

    while (removingTabInProgress) {
        await wait();
    }

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    const foundIndex = tabsHistory.findIndex(historyTabInfo => historyTabInfo.tabId === tabInfo.tabId);
    if (foundIndex !== -1) {
        tabsHistory.splice(foundIndex, 1);
    }

    tabsHistory.unshift(tabInfo);

    if (debug) {
        console.log('handleTabActivated', tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
}

chrome.runtime.onInstalled.addListener(async () => {
    if (debug) {
        console.log('Extension installed');
    }

    let tabsHistory = [];
    await getCurrentTab().then(tabInfo => tabsHistory.push({tabId: tabInfo.id, windowId: tabInfo.windowId}));
    if (debug) {
        console.log('onInstalled', tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
});

chrome.tabs.onActivated.addListener(async function (tabInfo) {
    await handleTabActivated(tabInfo);
});

chrome.tabs.onRemoved.addListener(async function (tabId) {
    if (debug) {
        console.log('Tab removed: ' + tabId);
    }

    while (removingTabInProgress) {
        await wait();
    }

    removingTabInProgress = true;
    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    tabsHistory = tabsHistory.filter(historyTabInfo => historyTabInfo.tabId !== tabId);

    if (debug) {
        console.log('tabs.onRemoved', tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
    removingTabInProgress = false;
});

chrome.commands.onCommand.addListener(async () => {
    if (debug) {
        console.log('Hotkey pressed');
    }

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    if (tabsHistory.length < 2) {
        return;
    }

    const currentWindow = await chrome.windows.getCurrent();
    if (tabsHistory[1].windowId !== currentWindow.id) {
        if (debug) {
            console.log('Switching window to ' + tabsHistory[1].windowId);
        }

        await chrome.windows.update(tabsHistory[1].windowId, {focused: true});
    }

    await chrome.tabs.update(tabsHistory[1].tabId, {highlighted: true, active: true});
});

chrome.windows.onFocusChanged.addListener(async function (windowId) {
    if (windowId === -1) {
        if (debug) {
            console.log('Window is -1, ignoring');
        }
        return;
    }

    if (debug) {
        console.log('Window focused: ' + windowId);
    }

    let tabInfo = await getCurrentTab();
    if (!tabInfo) {
        if (debug) {
            console.log('No tab found');
        }
        return;
    }

    await handleTabActivated({tabId: tabInfo.id, windowId: tabInfo.windowId});
}, {windowTypes: ['normal']});