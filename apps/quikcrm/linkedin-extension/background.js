// Shared with the side panel: the profile extractor injected into the page,
// and the prospect/activity sync helpers used by the "QuikCRM Connect" button.
// scrapeLinkedInProfile must load first — prospect-sync.js references it.
importScripts('linkedin-profile-scraper.js', 'prospect-sync.js');

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

/**
 * Open the side panel for `tabId` and ask it to extract the current profile.
 *
 * NO PERSISTENCE happens here. The panel extracts the profile and its posts
 * into its review form; the user saves from there.
 *
 * The panel is a separate document that has to boot before it can receive a
 * message, and when it is already open there is nothing to wait for. So we
 * open it (harmless if already open) and then retry the extract message until
 * a listener answers, rather than guessing a fixed delay.
 */
async function qcrmOpenPanelAndExtract(tabId) {
  try {
    // Must be called while the content-script click gesture is still active.
    await chrome.sidePanel.open({ tabId });
  } catch (err) {
    // Already open, or the gesture expired. Not fatal — if a panel is open the
    // message below still reaches it.
    console.log('[QuikCRM] sidePanel.open:', err && err.message);
  }

  const sendToPanel = () =>
    new Promise((resolve) => {
      try {
        // No tabId: the panel is an extension page, not a content script, so
        // this is a runtime-wide message.
        chrome.runtime.sendMessage({ action: 'quikcrm:runExtraction' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null); // no listener yet — the panel is still booting
            return;
          }
          resolve(response || null);
        });
      } catch (e) {
        resolve(null);
      }
    });

  // Retry for ~6s while the panel boots. Extraction itself can take much
  // longer (the posts pipeline opens a background tab); we only wait here for
  // the panel to ACCEPT the request, then report success.
  for (let i = 0; i < 30; i++) {
    const response = await sendToPanel();
    if (response) return response;
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    success: false,
    error: 'The QuikCRM panel did not respond. Open it from the extension icon and try again.',
  };
}

// ── "QuikCRM Connect" button bridge ──────────────────────────────────────────
// The content script cannot call chrome.scripting/chrome.tabs and must not hold
// the auth token, so it delegates both steps here.
//
// The handler is a non-async function that returns `true` and resolves the
// promise separately. An `async` listener returns a Promise, which Chrome reads
// as "not using sendResponse" — it closes the channel immediately and the
// caller gets undefined. (The legacy listener above has that bug; it is left
// alone because it never calls sendResponse.)
//
// Every path replies with { success: boolean, ... } so the content script's
// error handling always has a message to show.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return undefined;
  if (
    message.action !== 'quikcrm:ensureProspect' &&
    message.action !== 'quikcrm:logActivity' &&
    message.action !== 'quikcrm:openPanelAndExtract'
  ) {
    return undefined;
  }

  // Act only on the tab the message came from — never a tab looked up by
  // query. This is what guarantees we extract the profile the user actually
  // clicked on, even with several LinkedIn tabs open.
  const tabId = sender && sender.tab && sender.tab.id;
  if (!tabId) {
    sendResponse({ success: false, error: 'Could not identify the LinkedIn tab.' });
    return undefined;
  }

  (async () => {
    try {
      if (message.action === 'quikcrm:openPanelAndExtract') {
        const result = await qcrmOpenPanelAndExtract(tabId);
        sendResponse(result);
        return;
      }
      if (message.action === 'quikcrm:ensureProspect') {
        const prospectId = await qcrmEnsureProspect(tabId, message.profile);
        sendResponse({ success: true, prospectId });
        return;
      }
      const result = await qcrmLogLinkedInActivity(message.payload);
      sendResponse({ success: true, duplicate: result.duplicate });
    } catch (error) {
      console.error(`[QuikCRM] ${message.action} failed`, error);
      sendResponse({
        success: false,
        error: (error && error.message) || 'Unexpected error',
      });
    }
  })();

  return true; // keep the message channel open for the async reply
});

// ── Email discovery ──────────────────────────────────────────────────────────
//
// Separate listener from the one above because that one requires `sender.tab`:
// it acts on the LinkedIn tab a content script messaged from. This message
// comes from the SIDE PANEL, which has no `sender.tab`, and needs no tab
// anyway — the prospect is already saved and the work is entirely server-side.
//
// THE POINT OF ROUTING THIS THROUGH THE WORKER: the discovery cascade takes
// seconds, and the panel is usually closed the moment the user sees the save
// toast. A fetch started in the panel is cancelled when the panel unloads; one
// started here is not. The panel therefore fires and forgets, and this handler
// owns the request for its full lifetime.
//
// Replies { success } purely so a caller that chooses to wait can observe the
// outcome. Nothing in the save flow depends on it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'quikcrm:discoverEmail') return undefined;

  (async () => {
    const result = await qcrmDiscoverProspectEmail(message.prospectId);
    sendResponse({ success: result.ok, data: result.data || null });
  })();

  return true;
});