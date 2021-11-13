let tabs = [];

async function getCurrentTab() {
    let queryOptions = {active: true, currentWindow: true};
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({color: tabs});
    getCurrentTab().then(tabInfo => tabs.push(tabInfo.id));
});

chrome.tabs.onActivated.addListener(function (tabInfo) {
    if (tabs[0] === tabInfo.tabId) {
        [tabs[0], tabs[1]] = [tabs[1], tabs[0]];
        return;
    }

    tabs.push(tabInfo.tabId);
    if (tabs.length > 2) {
        tabs.shift();
    }
});

chrome.commands.onCommand.addListener(() => {
    if (tabs.length < 2) {
        return;
    }

    chrome.tabs.update(tabs[0], {highlighted: true, active: true});
});