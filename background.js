let justRemoved = false, debug = false;

const wait = () =>
    new Promise(resolve =>
        setTimeout(() => resolve(true), 50)
    );

async function getCurrentTab() {
    let queryOptions = {active: true, currentWindow: true};
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

chrome.runtime.onInstalled.addListener(async () => {
    let tabsHistory = [];
    await getCurrentTab().then(tabInfo => tabsHistory.push(tabInfo.id));
    if (debug) {
        console.log(tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
});

chrome.tabs.onActivated.addListener(async function (tabInfo) {
    while (justRemoved) {
        await wait();
    }

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    const foundIndex = tabsHistory.indexOf(tabInfo.tabId);
    if (foundIndex !== -1) {
        tabsHistory.splice(foundIndex, 1);
    }

    tabsHistory.unshift(tabInfo.tabId);

    if (debug) {
        console.log(tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
});

chrome.tabs.onRemoved.addListener(async function (tabId) {
    justRemoved = true;

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    const foundIndex = tabsHistory.indexOf(tabId);
    if (foundIndex !== -1) {
        tabsHistory.splice(foundIndex, 1);
    }

    if (debug) {
        console.log(tabsHistory);
    }

    await chrome.storage.local.set({tabsHistory});
    justRemoved = false;
});

chrome.commands.onCommand.addListener(async () => {
    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    if (tabsHistory.length < 2) {
        return;
    }

    await chrome.tabs.update(tabsHistory[1], {highlighted: true, active: true});
});