// Extension popup - launcher only. Opens side panel. No login UI.

document.addEventListener('DOMContentLoaded', function() {
  const openBtn = document.getElementById('openSidePanelBtn');
  if (openBtn) {
    openBtn.addEventListener('click', handleOpenSidePanel);
  }
});

async function handleOpenSidePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
    window.close();
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
}
