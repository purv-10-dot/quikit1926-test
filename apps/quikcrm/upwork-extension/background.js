// Extracted from QuikFetch background.js — only the parts upwork.js depends on.
// upwork.js sends the "closeSidePanel" message in 4 places; without this handler
// the side panel never closes after a save / invalid-page detection.

// Set the side panel behavior on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
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
