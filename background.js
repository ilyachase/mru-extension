let justRemoved = false;

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

    await chrome.storage.local.set({tabsHistory});
});

chrome.tabs.onActivated.addListener(async function (tabInfo) {
    while (justRemoved) {
        await wait();
    }

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    if (tabsHistory[0] === tabInfo.tabId) {
        return;
    }

    tabsHistory.unshift(tabInfo.tabId);
    if (tabsHistory.length > 100) {
        tabsHistory.pop();
    }

    await chrome.storage.local.set({tabsHistory});
});

chrome.tabs.onRemoved.addListener(async function () {
    justRemoved = true;

    let tabsHistory;
    await chrome.storage.local.get('tabsHistory').then(result => tabsHistory = result.tabsHistory);

    tabsHistory.shift();

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
    [tabsHistory[0], tabsHistory[1]] = [tabsHistory[1], tabsHistory[0]];

    await chrome.storage.local.set({tabsHistory});
});