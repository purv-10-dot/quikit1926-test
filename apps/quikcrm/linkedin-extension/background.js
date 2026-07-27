// No popup: icon click opens side panel directly (LinkedIn pages only)
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url) return;
  if (!tab.url.includes('linkedin.com')) {
    console.warn('LinkedIn CRM: Open a LinkedIn page first, then click the extension icon.');
    return;
  }
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.error('LinkedIn CRM: Failed to open side panel', err);
  }
});

// Listen for messages from the popup or side panel
chrome.runtime.onMessage.addListener(async message => {
  console.log("mesage",message)
  // Might not be as easy if there are multiple side panels open
  if (message === 'closeSidePanel') {
    // Close the side panel
    await chrome.sidePanel.setOptions({ enabled: false }, () => {
      console.log("Side panel closed.");
      // sendResponse({ status: "closed" });
    });
    await chrome.sidePanel.setOptions({ enabled: true });
    // Return true to indicate we will respond asynchronously.
    return true;
  }
})

// contact


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update_ui") {
    chrome.storage.local.set({ updated: true });
  }
});