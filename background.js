let tabs = [];

async function getCurrentTab() {
    let queryOptions = {active: true, currentWindow: true};
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

chrome.runtime.onInstalled.addListener(() => {
    getCurrentTab().then(tabInfo => tabs.push(tabInfo.id));
});

chrome.tabs.onActivated.addListener(function (tabInfo) {
    if (tabs[0] === tabInfo.tabId) {
        return;
    }

    tabs.unshift(tabInfo.tabId);
    if (tabs.length > 100) {
        tabs.pop();
    }
});

chrome.tabs.onRemoved.addListener(function () {
    tabs.shift();
});

chrome.commands.onCommand.addListener(() => {
    if (tabs.length < 2) {
        return;
    }

    chrome.tabs.update(tabs[1], {highlighted: true, active: true});
    [tabs[0], tabs[1]] = [tabs[1], tabs[0]];
});