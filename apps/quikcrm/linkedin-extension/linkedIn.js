

(function() {
  console.log("LinkedIn CRM Extension starting...");

  const STORAGE_KEY_TOKEN = 'authToken';
  const STORAGE_KEY_EMAIL = 'userEmail';
  const STORAGE_KEY_ORG = 'selectedOrganization';

  // The currently active organization ({ id, name }) for this session. Sourced
  // from chrome.storage.local so it survives side-panel reopen / browser
  // refresh; cleared only on logout.
  let currentOrg = null;

  // On load: check auth and show either login view or extractor view
  async function onPanelLoad() {
    const token = await getStoredAuthToken();
    if (token) {
      showExtractorView();
      setupLogoutButtons();
    } else {
      showLoginView();
      setupOAuthButtons();
      setupLogoutButtons(); // no-op until logged in; buttons are in extractorView
    }
  }

  function getStoredAuthToken() {
    return new Promise(function(resolve) {
      chrome.storage.local.get([STORAGE_KEY_TOKEN], function(result) {
        resolve(result[STORAGE_KEY_TOKEN] || null);
      });
    });
  }

  function showLoginView() {
    const loginView = document.getElementById('loginView');
    const extractorView = document.getElementById('extractorView');
    if (loginView) loginView.classList.remove('hidden');
    if (extractorView) extractorView.classList.add('hidden');
  }

  function showExtractorView() {
    const loginView = document.getElementById('loginView');
    const extractorView = document.getElementById('extractorView');
    if (loginView) loginView.classList.add('hidden');
    if (extractorView) extractorView.classList.remove('hidden');
    setupLogoutButtons();
    enterExtractor();
  }

  let oauthButtonsWired = false;
  function setupOAuthButtons() {
    // Buttons are static DOM; only wire once to avoid stacking duplicate
    // click handlers when the login view is shown again after logout.
    if (oauthButtonsWired) return;
    const googleBtn = document.getElementById('googleLoginBtn');
    const microsoftBtn = document.getElementById('microsoftLoginBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', function() { startOAuth('google'); });
    }
    if (microsoftBtn) {
      microsoftBtn.addEventListener('click', function() { startOAuth('microsoft'); });
    }
    if (googleBtn || microsoftBtn) oauthButtonsWired = true;
  }

  function setOAuthButtonsDisabled(disabled) {
    ['googleLoginBtn', 'microsoftLoginBtn'].forEach(function(id) {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = disabled;
    });
  }

  // Launch the provider OAuth flow via chrome.identity. The backend
  // (/api/extension-auth/*) runs the code exchange, enforces the
  // existing-QuikCRM-user gate, and redirects back to this extension's
  // chromiumapp.org URL with the token (or ?error) in the fragment.
  function startOAuth(provider) {
    hideLoginError();
    setOAuthButtonsDisabled(true);

    const baseUrl = (typeof window !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : 'http://localhost:3008';
    const returnUrl = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
    const authUrl = baseUrl + '/api/extension-auth/start'
      + '?provider=' + encodeURIComponent(provider)
      + '&return=' + encodeURIComponent(returnUrl);

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, function(redirectUrl) {
      setOAuthButtonsDisabled(false);

      if (chrome.runtime.lastError || !redirectUrl) {
        // User closed the window or the flow was interrupted.
        showLoginError('Login was cancelled. Please try again.');
        return;
      }

      let params;
      try {
        params = new URLSearchParams(new URL(redirectUrl).hash.slice(1));
      } catch (e) {
        showLoginError('Login failed. Please try again.');
        return;
      }

      const err = params.get('error');
      if (err === 'not_authorized') {
        showLoginError('You are not an authorized QuikCRM user. Please contact your administrator.');
        return;
      }
      if (err) {
        showLoginError('Login failed. Please try again.');
        return;
      }

      const token = params.get('token');
      if (!token) {
        showLoginError('Login failed. Please try again.');
        return;
      }

      chrome.storage.local.set({
        [STORAGE_KEY_TOKEN]: token,
        [STORAGE_KEY_EMAIL]: params.get('email') || ''
      }, function() {
        showExtractorView();
        setupLogoutButtons();
      });
    });
  }

  function showLoginError(message) {
    const el = document.getElementById('loginErrorMessage');
    if (el) {
      el.textContent = message;
      el.classList.add('show');
    }
  }

  function hideLoginError() {
    const el = document.getElementById('loginErrorMessage');
    if (el) el.classList.remove('show');
  }

  function setupLogoutButtons() {
    const ids = ['logoutBtnOrg', 'logoutBtnIndividual'];
    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.replaceWith(btn.cloneNode(true));
      const newBtn = document.getElementById(id);
      if (newBtn) newBtn.addEventListener('click', handleLogout);
    });
  }

  async function handleLogout() {
    try {
      await new Promise(function(resolve) {
        chrome.storage.local.remove(
          [STORAGE_KEY_TOKEN, STORAGE_KEY_EMAIL, STORAGE_KEY_ORG],
          resolve
        );
      });
      if (typeof window.clearAuthToken === 'function') {
        await window.clearAuthToken();
      }
      currentOrg = null;
      hideLoginError();
      showLoginView();
      setupOAuthButtons();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  function setPanelVisibility(id, visible) {
    const el = document.getElementById(id);
    if (!el) return;
    if (visible) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function setBodyModeClass(modeClass) {
    const body = document.body;
    if (!body) return;
    body.classList.remove('mode-select', 'mode-individual');
    body.classList.add(modeClass);
  }

  // ---- Organization flow ------------------------------------------------

  function getStoredOrg() {
    return new Promise(function(resolve) {
      chrome.storage.local.get([STORAGE_KEY_ORG], function(result) {
        resolve(result[STORAGE_KEY_ORG] || null);
      });
    });
  }

  function storeOrg(org) {
    currentOrg = org;
    return new Promise(function(resolve) {
      chrome.storage.local.set({ [STORAGE_KEY_ORG]: org }, resolve);
    });
  }

  // Entry point after authentication: resolve which organization to use, then
  // open the extractor. Shows the selector only when the user has >1 org and
  // hasn't already got a valid remembered selection.
  async function enterExtractor() {
    let organizations;
    try {
      organizations = await loadOrganizations();
    } catch (err) {
      console.error('Failed to load organizations:', err);
      showOrgSelection();
      showOrgError('Could not load your organizations. Please try again.');
      return;
    }

    if (!organizations || organizations.length === 0) {
      showOrgSelection();
      showOrgError('You do not have access to any organization. Please contact your administrator.');
      return;
    }

    if (organizations.length === 1) {
      await storeOrg(organizations[0]);
      showIndividualView();
      return;
    }

    // Multiple orgs — reuse a still-valid remembered selection if present.
    const stored = await getStoredOrg();
    const remembered = stored && organizations.find(function(o) { return o.id === stored.id; });
    if (remembered) {
      await storeOrg(remembered); // refresh name in case it changed
      showIndividualView();
      return;
    }

    renderOrgOptions(organizations);
    showOrgSelection();
  }

  async function loadOrganizations() {
    const response = await window.apiFetch('/api/extension-auth/organizations');
    const data = await response.json();
    if (!response.ok || !data || data.success === false) {
      throw new Error((data && data.error) || 'Failed to load organizations');
    }
    return (data.data && data.data.organizations) || [];
  }

  function showOrgSelection() {
    setBodyModeClass('mode-select');
    setPanelVisibility('orgSelection', true);
    setPanelVisibility('individualView', false);
  }

  function showOrgError(message) {
    const el = document.getElementById('orgError');
    if (el) {
      el.textContent = message;
      el.classList.add('show');
    }
  }

  function hideOrgError() {
    const el = document.getElementById('orgError');
    if (el) el.classList.remove('show');
  }

  // Holds the org list currently rendered in the selector so the (once-wired)
  // submit handler always resolves against the latest set.
  let renderedOrgs = [];

  function renderOrgOptions(organizations) {
    hideOrgError();
    renderedOrgs = organizations;
    const container = document.getElementById('orgOptions');
    const continueBtn = document.getElementById('orgContinueBtn');
    const form = document.getElementById('orgForm');
    if (!container || !form) return;

    container.innerHTML = '';
    organizations.forEach(function(org, index) {
      const id = 'org-opt-' + index;
      const label = document.createElement('label');
      label.className = 'org-option';
      label.htmlFor = id;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'organization';
      radio.id = id;
      radio.value = org.id;
      radio.addEventListener('change', function() {
        if (continueBtn) continueBtn.disabled = false;
      });

      const name = document.createElement('span');
      name.className = 'org-option-name';
      name.textContent = org.name || 'Unnamed organization';

      label.appendChild(radio);
      label.appendChild(name);
      container.appendChild(label);
    });

    if (continueBtn) continueBtn.disabled = true;

    // Wire submit once (form is static; guard against duplicate listeners).
    if (!form.dataset.wired) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const checked = form.querySelector('input[name="organization"]:checked');
        if (!checked) return;
        const org = renderedOrgs.find(function(o) { return o.id === checked.value; });
        if (!org) return;
        storeOrg(org).then(function() { showIndividualView(); });
      });
      form.dataset.wired = '1';
    }
  }

  function showIndividualView() {
    setBodyModeClass('mode-individual');
    setPanelVisibility('orgSelection', false);
    setPanelVisibility('individualView', true);
    renderOrgBadge();
    initIndividualExtractor();
  }

  // Show the active organization near the top of the extractor screen.
  function renderOrgBadge() {
    const badge = document.getElementById('orgBadge');
    const nameEl = document.getElementById('orgBadgeName');
    if (!badge || !nameEl) return;
    if (currentOrg && currentOrg.name) {
      nameEl.textContent = currentOrg.name;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Extractor initialization - only when authenticated
  async function initIndividualExtractor() {
    console.log("Initializing individual extractor...");
    try {
      const isLinkedIn = await checkLinkedInTab();
      if (!isLinkedIn) return;
      initializeFetchButton();
      enableSaveLinkedInData();
      initializeCollapsibles();
      console.log("Extension initialized successfully");
    } catch (error) {
      console.error("Error during initialization:", error);
    }
  }

  async function checkLinkedInTab() {
    try {
      const tab = await getActiveLinkedInTab();
      const linkedIndata = document.getElementById('linkedIndata');
      const warning = document.getElementById('notLinkedInWarning');
      if (!tab || !isLinkedInUrl(tab.url)) {
        if (linkedIndata) linkedIndata.classList.add('hidden');
        if (warning) warning.classList.remove('hidden');
        return false;
      }
      if (linkedIndata) linkedIndata.classList.remove('hidden');
      if (warning) warning.classList.add('hidden');
      return true;
    } catch (error) {
      console.error('Error checking LinkedIn tab:', error);
      return false;
    }
  }

  // Initialize when side panel loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { onPanelLoad(); });
  } else {
    onPanelLoad();
  }
})();

// Store extracted posts data globally so it can be sent when saving
// Note: API_BASE_URL is defined in api.js (single source of truth)
let extractedPosts = [];
let extractedCompanyData = {};
let extractedExperiences = [];

// Read the persisted organization ({ id, name }) from chrome.storage.local.
// Exposed at module scope so any extension request can access the selected
// organization without depending on in-memory state.
function getSelectedOrganization() {
  return new Promise(function(resolve) {
    try {
      chrome.storage.local.get(['selectedOrganization'], function(result) {
        resolve(result.selectedOrganization || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function enableSaveLinkedInData() {
  const saveButton = document.getElementById('saveLinkedInData');
  const extractCompanyBtn = document.getElementById('extractCompanyDataBtn');
  
  if (extractCompanyBtn) {
    extractCompanyBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await extractCompanyDataFromPage();
    });
  }
  
  if (saveButton) {
    saveButton.addEventListener('click', async (event) => {
      event.preventDefault();
      
      // Check authentication first (using api.js functions)
      try {
        const token = await window.getAuthToken();
        if (!token) {
          showToast('Please sign in first', 'error');
          return;
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        showToast('Please sign in first', 'error');
        return;
      }
      
      // Get form data
      const firstName = document.getElementById('firstName')?.value || '';
      const lastName = document.getElementById('lastName')?.value || '';
      const email = document.getElementById('emailID')?.value || '';
      const shortSummary = document.getElementById('shortSummary')?.value || '';
      const headline = document.getElementById('headline')?.value || '';
      const company = document.getElementById('company')?.value || '';
      const profileURL = document.getElementById('profileURL')?.value || '';
      const mobileNumber = document.getElementById('mobileNumber')?.value || '';
      const about = document.getElementById('about')?.value || '';
      
      // Validate required fields
      let searchEmailEnabled = false;
      const searchEmailToggle = document.getElementById('searchEmailToggle');
      if (searchEmailToggle) {
        searchEmailEnabled = !!searchEmailToggle.checked;
      }
      if (!email) {
        if (searchEmailEnabled) {
          // Allow save, but warn user and trigger discovery after
          showToast('Email will be searched and filled automatically.', 'info');
        } else {
          // Block save and show warning
          showToast('Email address is required. If you don\'t have the email, turn on the toggle to search and save.', 'error');
          return;
        }
      }
      
      if (!headline) {
        showToast('Job Title is required', 'error');
        return;
      }
      
      if (!shortSummary) {
        showToast('Short Summary is required', 'error');
        return;
      }
      
      // Disable button and show loading
      saveButton.disabled = true;
      const originalText = saveButton.textContent;
      saveButton.textContent = '⏳ Saving...';
      
      try {
        // Prepare payload for backend (only required fields)
        const profilePictureUrl = document.getElementById('profile-picture')?.src || '';
        const selectedOrg = await getSelectedOrganization();
        const orgId = selectedOrg && selectedOrg.id ? selectedOrg.id : '';
        const payload = {
          name: `${firstName} ${lastName}`.trim(),
          email,
          linkedinUrl: profileURL,
          title: headline,
          company,
          shortSummary,
          about,
          phone: mobileNumber,
          profilePicture: profilePictureUrl,
          posts: extractedPosts,
          companyData: extractedCompanyData || {},
          experiences: extractedExperiences,
          searchEmailEnabled
        };
        if (orgId) payload.orgId = orgId;
        const response = await window.apiFetch('/api/leads/from-linkedin', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        // The backend returns { success, prospectId } (or a legacy { leadId }).
        // Treat an explicit success:false as a failure even on a 2xx.
        if (response.ok && result.success !== false) {
          showToast('Prospect saved to CRM!', 'success');
        } else {
          throw new Error(result.error || 'Failed to save prospect');
        }
      } catch (error) {
        console.error('Error saving prospect:', error);
        showToast(error.message || 'Failed to save prospect to CRM', 'error');
      }
      
      // Reset button
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    });
  }
}

function showToast(message, type = 'success') {
  const toast = type === 'success' ? 
    document.getElementById('sucesstoaster') : 
    document.getElementById('errortoaster');
  
  const messageEl = type === 'success' ? 
    document.getElementById('sucessmessage') : 
    document.getElementById('errormessage');
  
  if (toast && messageEl) {
    messageEl.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
}

function initializeFetchButton() {
  const fetchData = document.getElementById("fetchData");
  if (fetchData) {
    fetchData.addEventListener("click", async (event) => {
      event.preventDefault();
      
      const fetchDataText = document.getElementById("fetchDatatext");
      const fetchDataLoader = document.getElementById("fetchDataloader");
      
      // Show loading
      if (fetchDataText) fetchDataText.textContent = "Extracting...";
      if (fetchDataLoader) {
        fetchDataLoader.classList.remove("hidden");
        fetchDataLoader.classList.add("show");
      }
      fetchData.disabled = true;
      
      try {
        const profileData = await extractLinkedInData();
        // Log the exact object returned from scrapeLinkedInProfile() before it
        // is written into the form — makes it obvious whether the problem is
        // extraction (empty here) or form-population (populated here, blank in UI).
        if (profileData) {
          populateForm(profileData);
          showToast("Profile data extracted successfully!");
        } else {
          throw new Error("No data found");
        }
      } catch (error) {
        console.error("Error extracting data:", error);
        showToast("Error extracting profile data: " + error.message, 'error');
      }
      
      // Reset button
      if (fetchDataText) fetchDataText.textContent = "Extract Profile Data";
      if (fetchDataLoader) {
        fetchDataLoader.classList.add("hidden");
        fetchDataLoader.classList.remove("show");
      }
      fetchData.disabled = false;
    });
  }
}

function populateForm(data) {
  // Only fill required fields with correct data
  const setField = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = value || '';
    }
  };

  setField('firstName', data.firstName);
  setField('lastName', data.lastName);
  setField('emailID', data.email);
  // Robust short summary fill
  let shortSummaryValue = data.shortSummary || '';
  setField('shortSummary', shortSummaryValue);
  setField('headline', data.currentPosition);
  setField('company', data.company);
  setField('profileURL', data.linkedinUrl || window.location.href);
  setField('mobileNumber', data.phone);
  setField('about', data.about);

  // Update full name display
  const fullNameEl = document.getElementById('fullName');
  if (fullNameEl) {
    fullNameEl.textContent = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'No name';
  }

  // Profile picture
  const profilePic = document.getElementById('profile-picture');
  const noPic = document.getElementById('noprofile-picture');
  
  if (data.profilePicture) {
    if (profilePic) {
      profilePic.src = data.profilePicture;
      profilePic.classList.remove('hidden');
      profilePic.classList.add('show');
      
      // Add error handler to see if image fails to load
      profilePic.onerror = function() {
        console.error(`[POPULATE] Failed to load profile picture from: ${data.profilePicture}`);
      };
      profilePic.onload = function() {
      };
    }
    if (noPic) {
      noPic.classList.add('hidden');
      noPic.classList.remove('show');
    }
  } else {
    if (profilePic) {
      profilePic.classList.add('hidden');
      profilePic.classList.remove('show');
    }
    if (noPic) {
      noPic.classList.remove('hidden');
      noPic.classList.add('show');
    }
  }

  // Store extracted posts for later submission
  extractedPosts = Array.isArray(data.posts) ? data.posts : [];

  // Store extracted experiences for later submission
  extractedExperiences = Array.isArray(data.experiences) ? data.experiences : [];

  // Update posts count display with detailed information
  const postsCountEl = document.getElementById('postsCount');
  if (postsCountEl) {
    if (extractedPosts.length > 0) {
      const totalReactions = extractedPosts.reduce((sum, post) => sum + (post.engagement?.reactions || 0), 0);
      const totalComments = extractedPosts.reduce((sum, post) => sum + (post.engagement?.comments || 0), 0);
      const types = extractedPosts.reduce((acc, post) => {
        acc[post.type || 'unknown'] = (acc[post.type || 'unknown'] || 0) + 1;
        return acc;
      }, {});
      const typeSummary = Object.entries(types).map(([type, count]) => `${count} ${type}`).join(', ');

      postsCountEl.textContent = `${extractedPosts.length} posts found (${totalReactions} reactions, ${totalComments} comments) - ${typeSummary}`;
    } else {
      postsCountEl.textContent = 'No posts found';
    }
  }

  // Show the form
  document.getElementById('intialdata').style.display = 'block';
  
  // Show sticky action bar (Individual Mode Only)
  const actionBar = document.getElementById('individualActionBar');
  if (actionBar) {
    actionBar.style.display = 'block';
  }
  
  // Show company enrichment section
  const companyEnrichmentSection = document.getElementById('companyEnrichmentSection');
  if (companyEnrichmentSection) {
    companyEnrichmentSection.style.display = 'block';
  }
}

// Resolve the active LinkedIn browser tab.
//
// The panel runs in a side-panel context, where `chrome.tabs.query({ active,
// currentWindow })` can resolve to the panel's own window and return a tab with
// an empty/undefined `url` — which made the old `tab.url.includes('linkedin')`
// check throw "Please navigate to a LinkedIn profile page" even on a valid
// profile. Query the last-focused normal browser window instead, and fall back
// to scanning all windows for a LinkedIn tab.
async function getActiveLinkedInTab() {
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  } catch (e) {
  }
  if (!tab || !tab.url) {
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
    }
  }
  // Last resort: find any active LinkedIn tab across all normal windows.
  if (!tab || !tab.url || !isLinkedInUrl(tab.url)) {
    try {
      const all = await chrome.tabs.query({ url: ['*://*.linkedin.com/*'] });
      const active = all.find((t) => t.active) || all[0];
      if (active) tab = active;
    } catch (e) {
    }
  }
  return tab || null;
}

// Accept any LinkedIn host (www / m / linkedin.com and subdomains).
function isLinkedInUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return /(^|\.)linkedin\.com$/i.test(u.hostname);
  } catch {
    return /linkedin\.com/i.test(url);
  }
}

// A LinkedIn URL we can extract a profile from: member profiles (/in/...) and
// Sales Navigator lead/people pages. Kept permissive — query strings, trailing
// slashes, locale prefixes, and country subdomains all pass.
function isExtractableLinkedInProfileUrl(url) {
  if (!isLinkedInUrl(url)) return false;
  let pathname = '';
  try { pathname = new URL(url).pathname; } catch { pathname = url; }
  return (
    /\/in\//i.test(pathname) ||
    /\/sales\/(lead|people)\//i.test(pathname) ||
    /\/sales\/lead\//i.test(pathname)
  );
}

async function extractLinkedInData() {
  try {
    // Get current tab and inject content script
    const tab = await getActiveLinkedInTab();

    if (!tab || !tab.id) {
      throw new Error('Could not find the active browser tab. Click the LinkedIn page, then try again.');
    }
    if (!isLinkedInUrl(tab.url)) {
      throw new Error('Please navigate to a LinkedIn profile page');
    }

    // ── WORLD-COMPARISON PROBE ────────────────────────────────────────────
    // Answers: does the scraper (ISOLATED world) see a different DOM than the
    // page (MAIN world) / DevTools — and is any difference caused by the WORLD
    // or by TIMING? Runs the census in 3 ordered passes: ISOLATED, then MAIN,
    // then ISOLATED again. If MAIN has content but BOTH ISOLATED passes are
    // empty (including the later one, which had strictly more time), the cause
    // is the world, not timing. If the 2nd ISOLATED pass gains content, it was
    // timing. Temporary — removed after root cause is proven.
    try {
      const passes = [
        { label: 'ISOLATED#1', world: 'ISOLATED' },
        { label: 'MAIN', world: 'MAIN' },
        { label: 'ISOLATED#2', world: 'ISOLATED' }
      ];
      for (const pass of passes) {
        let census;
        try {
          census = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            world: pass.world,
            function: censusDom
          });
        } catch (e) {
          console.warn(`[WORLD] ${pass.label} injection failed:`, e && e.message);
          continue;
        }
        (census || []).forEach((c) => {
          console.log(`[WORLD] ${pass.label} frameId=${c.frameId}`, c.result);
        });
      }
    } catch (probeErr) {
      console.error('[WORLD] probe failed:', probeErr);
    }
    // ──────────────────────────────────────────────────────────────────────

    // Inject the extractor into ALL frames, then pick the frame whose result
    // actually contains profile data. This is robust regardless of which frame
    // holds the profile (top frame, or a nested app frame) — we never blindly
    // trust results[0]. The extractor itself (scrapeLinkedInProfile) traverses
    // shadow DOM and prefers LinkedIn's embedded hydration JSON over fragile
    // DOM selectors, so it works across LinkedIn's client-rendered layouts.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      function: scrapeLinkedInProfile
    });

    // Score each frame's result by how much real profile data it holds; keep
    // the richest. A subframe with nothing scores 0 and is discarded.
    function scoreResult(r) {
      if (!r || typeof r !== 'object') return -1;
      let s = 0;
      if (r.fullName) s += 3;
      if (r.shortSummary) s += 2;
      if (r.company) s += 2;
      if (r.currentPosition) s += 1;
      if (r.about) s += 2;
      if (r.profilePicture) s += 2;
      if (Array.isArray(r.experiences) && r.experiences.length) s += 2;
      return s;
    }

    let best = null;
    let bestScore = -1;
    (results || []).forEach((entry) => {
      const score = scoreResult(entry && entry.result);
      if (score > bestScore) { bestScore = score; best = entry ? entry.result : null; }
    });

    // TEMP VERIFICATION: compact per-profile report in the PANEL console.
    // Shows every required field's value + which source supplied it. Remove
    // once extraction is confirmed on real profiles.
    if (best) {
      const src = best.__sources || {};
      const rows = [
        ['First Name', best.firstName, src.name],
        ['Last Name', best.lastName, src.name],
        ['Full Name', best.fullName, src.name],
        ['Headline', best.shortSummary, src.headline],
        ['Company', best.company, src.company],
        ['Current Position', best.currentPosition, src.currentPosition],
        ['About', best.about, src.about],
        ['Experience', Array.isArray(best.experiences) ? best.experiences.length + ' item(s)' : '', src.experiences],
        ['Profile Picture', best.profilePicture, src.profilePicture],
        ['LinkedIn URL', best.linkedinUrl, src.linkedinUrl]
      ];
      console.log('[VERIFY] ===== Extraction report:', best.fullName || '(no name)', '=====');
      console.log('[VERIFY] frames returned:', (results || []).length, '| best score:', bestScore, '| page:', best.__diag && best.__diag.pageType, '| counts:', best.__diag && best.__diag.counts);
      rows.forEach(([label, val, source]) => {
        const has = val !== undefined && val !== null && String(val).trim() !== '' && val !== '0 item(s)';
        const shown = has ? String(val).slice(0, 80) : '(EMPTY)';
        console.log(`[VERIFY] ${has ? '✓' : '✗'} ${label}: ${shown}${has && source ? '   [' + source + ']' : ''}`);
      });
      const required = ['firstName','lastName','fullName','shortSummary','company','currentPosition','about','profilePicture','linkedinUrl'];
      const missing = required.filter((k) => !best[k] || !String(best[k]).trim())
        .concat((Array.isArray(best.experiences) && best.experiences.length) ? [] : ['experiences']);
      console.log(missing.length ? '[VERIFY] ✗ MISSING: ' + missing.join(', ') : '[VERIFY] ✓ ALL REQUIRED FIELDS POPULATED');
      console.log('[VERIFY] ================================================');
      // Don't hand the debug-only props to populateForm.
      delete best.__sources; delete best.__diag;
    }

    return best;
  } catch (error) {
    console.error('Extraction error:', error);
    throw error;
  }
}

// Initialize collapsible sections for Individual Mode
function initializeCollapsibles() {
  // Prospect profile collapsibles
  const toggleAbout = document.getElementById('toggleAbout');
  const aboutSection = document.getElementById('aboutSection');
  const aboutToggleIcon = document.getElementById('aboutToggleIcon');
  
  if (toggleAbout && aboutSection) {
    toggleAbout.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = aboutSection.style.display === 'none';
      aboutSection.style.display = isHidden ? 'block' : 'none';
      aboutToggleIcon.textContent = isHidden ? '▼' : '▶';
    });
  }

  const togglePosts = document.getElementById('togglePosts');
  const postsSection = document.getElementById('postsSection');
  const postsToggleIcon = document.getElementById('postsToggleIcon');
  
  if (togglePosts && postsSection) {
    togglePosts.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = postsSection.style.display === 'none';
      postsSection.style.display = isHidden ? 'block' : 'none';
      postsToggleIcon.textContent = isHidden ? '▼' : '▶';
    });
  }

  // Company details collapsibles
  const companyCollapsibles = document.querySelectorAll('.company-collapsible-btn');
  companyCollapsibles.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-target');
      const container = document.getElementById(`companyChallengesContainer_${target}`);
      const icon = btn.querySelector('.company-collapsible-icon');
      
      if (container) {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        icon.textContent = isHidden ? '▼' : '▶';
      }
    });
  });
}

// Extract experience history from LinkedIn Sales Navigator profile
function extractExperiences() {
  const experiences = [];

  try {

    const experienceSection = document.querySelector('[data-x--lead--experience-section]');
    if (!experienceSection) {
      return experiences;
    }

    const companiesList = experienceSection.querySelector('ul');
    if (!companiesList) {
      return experiences;
    }

    const companyItems = Array.from(companiesList.children).filter((el) => el.tagName === 'LI');

    const durationPattern = /\b\d+\s*(yr|yrs|mo|mos|year|years|month|months)\b/i;
    const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}|Present|Current)\b/i;

    const extractDuration = (container, excludedRoot) => {
      const spans = Array.from(container.querySelectorAll('span'));
      for (const span of spans) {
        if (excludedRoot && excludedRoot.contains(span)) continue;
        const text = (span.textContent || '').trim();
        if (durationPattern.test(text)) {
          return text;
        }
      }
      return '';
    };

    const extractDateText = (container, excludedRoot) => {
      const spans = Array.from(container.querySelectorAll('span'));
      for (const span of spans) {
        if (excludedRoot && excludedRoot.contains(span)) continue;
        const text = (span.textContent || '').trim();
        if (datePattern.test(text) && text.includes('–')) {
          return text;
        }
      }
      return '';
    };

    companyItems.forEach((companyLi, companyIdx) => {
      try {
        let companyName = '';
        const companyNameEl = companyLi.querySelector('[data-anonymize="company-name"]');
        if (companyNameEl && companyNameEl.textContent.trim()) {
          companyName = companyNameEl.textContent.trim();
        } else {
          const h2El = companyLi.querySelector('h2');
          if (h2El && h2El.textContent.trim()) {
            companyName = h2El.textContent.trim();
          }
        }

        let companyUrl = '';
        const companyLink = companyLi.querySelector('a[href*="/sales/company/"]');
        if (companyLink) {
          companyUrl = companyLink.href || '';
        }

        const rolesUl = companyLi.querySelector(':scope > ul');
        const companyDuration = extractDuration(companyLi, rolesUl);


        if (rolesUl) {
          const roleItems = Array.from(rolesUl.children).filter((el) => el.tagName === 'LI');

          roleItems.forEach((roleLi, roleIdx) => {
            try {
              const experience = {
                companyName,
                companyUrl,
                companyDuration,
                jobTitle: '',
                startDate: '',
                endDate: null,
                duration: '',
                location: '',
                description: ''
              };

              const jobTitleEl = roleLi.querySelector('h3[data-anonymize="job-title"]');
              if (jobTitleEl && jobTitleEl.textContent.trim()) {
                experience.jobTitle = jobTitleEl.textContent.trim();
              }

              const dateText = extractDateText(roleLi);
              if (dateText) {
                const dateParts = dateText.split(/–|to/i).map((d) => d.trim());
                experience.startDate = dateParts[0] || '';
                if (dateParts[1]) {
                  experience.endDate = /present|current/i.test(dateParts[1]) ? null : dateParts[1];
                }
              }

              const durationText = extractDuration(roleLi);
              if (durationText) {
                experience.duration = durationText;
              }

              const locationEl = roleLi.querySelector('[data-anonymize="location"]');
              if (locationEl && locationEl.textContent.trim()) {
                experience.location = locationEl.textContent.trim();
              }

              const descEl = roleLi.querySelector('[data-anonymize="person-blurb"]');
              if (descEl) {
                experience.description = descEl.getAttribute('title') || descEl.textContent.trim();
              }

              experiences.push(experience);
            } catch (roleError) {
              console.error(`[EXPERIENCE] Error parsing role ${roleIdx + 1}:`, roleError);
            }
          });
        } else {
          try {
            const experience = {
              companyName,
              companyUrl,
              companyDuration,
              jobTitle: '',
              startDate: '',
              endDate: null,
              duration: companyDuration,
              location: '',
              description: ''
            };

            const jobTitleEl = companyLi.querySelector('h3[data-anonymize="job-title"]');
            if (jobTitleEl && jobTitleEl.textContent.trim()) {
              experience.jobTitle = jobTitleEl.textContent.trim();
            }

            const dateText = extractDateText(companyLi);
            if (dateText) {
              const dateParts = dateText.split(/–|to/i).map((d) => d.trim());
              experience.startDate = dateParts[0] || '';
              if (dateParts[1]) {
                experience.endDate = /present|current/i.test(dateParts[1]) ? null : dateParts[1];
              }
            }

            const locationEl = companyLi.querySelector('[data-anonymize="location"]');
            if (locationEl && locationEl.textContent.trim()) {
              experience.location = locationEl.textContent.trim();
            }

            const descEl = companyLi.querySelector('[data-anonymize="person-blurb"]');
            if (descEl) {
              experience.description = descEl.getAttribute('title') || descEl.textContent.trim();
            }

            experiences.push(experience);
          } catch (singleError) {
            console.error(`[EXPERIENCE] Error parsing single role for company ${companyIdx + 1}:`, singleError);
          }
        }
      } catch (companyError) {
        console.error(`[EXPERIENCE] Error parsing company ${companyIdx + 1}:`, companyError);
      }
    });

    return experiences;
  } catch (error) {
    console.error('[EXPERIENCE] Error extracting experiences:', error);
    return experiences;
  }
}

// WORLD-COMPARISON census (temporary). Runs in either ISOLATED or MAIN world
// and reports the same structural metrics so divergence is visible.
function censusDom() {
  try {
    function deepCount(sel) {
      let n = 0;
      const walk = (root, depth) => {
        if (depth > 12) return;
        try { n += root.querySelectorAll(sel).length; } catch (e) {}
        let all = [];
        try { all = root.querySelectorAll('*'); } catch (e) {}
        for (const el of all) if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      };
      walk(document, 0);
      return n;
    }
    const titleName = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*[|·].*$/, '').trim();
    const bodyText = (document.body && document.body.innerText) || '';
    return {
      isTop: window.top === window.self,
      url: location.href.slice(0, 80),
      title: document.title,
      readyState: document.readyState,
      totalEls: document.querySelectorAll('*').length,
      htmlLen: (document.documentElement && document.documentElement.outerHTML || '').length,
      lightH1: document.querySelectorAll('h1').length,
      deepH1: deepCount('h1'),
      sections: document.querySelectorAll('section').length,
      mainEls: document.querySelector('main') ? document.querySelector('main').querySelectorAll('*').length : 0,
      code: document.querySelectorAll('code').length,
      meta: document.querySelectorAll('meta').length,
      shadowHosts: Array.from(document.querySelectorAll('*')).filter((e) => e.shadowRoot).length,
      bodyHasName: !!(titleName && bodyText.includes(titleName)),
      bodyTextLen: bodyText.length
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// This function runs in the LinkedIn page context
async function scrapeLinkedInProfile() {

  // Wait for the SPA to render/hydrate before extracting (LinkedIn is
  // client-rendered; injecting too early sees an empty document). Poll up to
  // 10s for any real profile signal, including inside shadow roots and the
  // embedded hydration JSON.
  await (async function waitForProfileDom() {
    const READY_TIMEOUT_MS = 10000;
    const POLL_MS = 200;
    const start = Date.now();
    const ready = () =>
      !!document.querySelector('h1, main section, [class*="top-card"], code') ||
      (function () {
        const n = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*[|·].*$/, '').trim();
        return n && document.body && (document.body.innerText || '').includes(n);
      })();
    return new Promise((resolve) => {
      const tick = () => {
        if (ready() || Date.now() - start >= READY_TIMEOUT_MS) return resolve();
        setTimeout(tick, POLL_MS);
      };
      tick();
    });
  })();

  // LinkedIn lazy-renders the About / Experience / Education sections only when
  // they scroll into view — so at initial load they are absent from the DOM
  // (this is why Experience came back empty). Scroll through the page in steps
  // to force those sections to render, then return to the top. Bounded and
  // best-effort (wrapped so a failure never blocks extraction).
  await (async function forceLazySections() {
    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const originalY = window.scrollY;
      const total = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0);
      const step = Math.max(400, Math.floor(window.innerHeight * 0.9));
      for (let y = 0; y <= total; y += step) {
        window.scrollTo(0, y);
        await sleep(120);
        // Stop early once both About and Experience anchors exist.
        if (document.getElementById('experience') && document.getElementById('about')) break;
      }
      // One more nudge to the very bottom for good measure, then settle.
      window.scrollTo(0, (document.body && document.body.scrollHeight) || total);
      await sleep(250);
      window.scrollTo(0, originalY);
      await sleep(80);
    } catch (e) { /* best-effort; never block extraction */ }
  })();

  try {
    // =====================================================================
    // PRODUCTION EXTRACTION ENGINE — strict semantic-section isolation.
    //
    // Principle: never search the whole page. Locate each section once
    // (Top Card, About, Experience, Education, Activity, …) and extract each
    // field ONLY from inside its own section. Values that originate in
    // Activity / Featured / Sidebar / Recommendations are structurally
    // impossible because we never read from those containers.
    // =====================================================================

    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const href = window.location.href;

    // Per-field source tracking (surfaced in the [VERIFY] diagnostic).
    const fieldSources = {};
    function markSource(field, source) { if (!fieldSources[field]) fieldSources[field] = source; }

    // ---- Vocabulary --------------------------------------------------------
    const GENERIC_IMG_ALT = /^(cover photo|profile photo|background photo|background image|photo|banner|logo)$/i;
    const BADGE_RE = /^(1st|2nd|3rd|\d+(?:st|nd|rd|th))$|^(following|pending|premium|influencer|open to work|hiring|promoted)$/i;
    // Pronoun lines LinkedIn renders between the name and the headline. These
    // are NEVER a headline or a position and must be skipped entirely.
    const PRONOUN_RE = /^\s*(he|she|they|him|her|them|his|hers|theirs|ze|zie|xe)(\s*\/\s*(he|she|they|him|her|them|his|hers|theirs|ze|zie|xe))+\s*$/i;
    // Activity/engagement noise that must never be a headline/position/company.
    const ACTIVITY_RE = /\b(comment|comments|like|likes|repost|reposts|reaction|reactions|follower|followers|connection|connections|view|views|impression|impressions)\b/i;
    const CTA_RE = /\b(view|follow|following|visit|open|see all|see more|show|message|connect|save|website|contact info)\b/i;
    const EMPLOYMENT_RE = /\b(Full-time|Part-time|Self-employed|Freelance|Contract|Internship|Apprenticeship|Seasonal|Permanent)\b/i;
    const ROLE_KEYWORDS = /\b(CEO|COO|CTO|CFO|CMO|VP|Head|Manager|Engineer|Developer|Lead|Director|Officer|Consultant|Analyst|Founder|Co-?founder|President|Owner|Partner|Expert|Specialist|Architect|Designer|Intern|Student|Professional|Management|Marketing|Sales|Product|Data|Scientist|Author|Speaker|Coach|Advisor|Administrator|Executive|Associate|Assistant|Recruiter|Accountant|Teacher|Professor|Researcher|Nurse|Doctor|Attorney|Lawyer|Strategist|Programmer|Technician|Full[- ]?Stack|Front[- ]?End|Back[- ]?End|Software|DevOps|QA|Freelanc|Entrepreneur)\b/i;

    // ---- Small DOM helpers -------------------------------------------------
    function deepQueryAll(selector, root, acc, depth) {
      acc = acc || []; root = root || document; depth = depth || 0;
      if (depth > 12) return acc;
      try { root.querySelectorAll(selector).forEach((el) => acc.push(el)); } catch (e) {}
      let hosts = [];
      try { hosts = root.querySelectorAll('*'); } catch (e) { hosts = []; }
      for (const el of hosts) { if (el.shadowRoot) deepQueryAll(selector, el.shadowRoot, acc, depth + 1); }
      return acc;
    }
    // Ordered, de-duplicated visible text lines (aria-hidden visual copy
    // preferred; else leaf text). Skips empty and consecutive duplicates.
    function textLines(el) {
      if (!el) return [];
      let nodes = Array.from(el.querySelectorAll('span[aria-hidden="true"]'));
      if (!nodes.length) nodes = Array.from(el.querySelectorAll('span, div, p')).filter((n) => !n.children || n.children.length === 0);
      const out = [];
      nodes.forEach((n) => { const t = norm(n.textContent); if (t && t !== out[out.length - 1]) out.push(t); });
      return out;
    }
    function linkText(a) {
      if (!a) return '';
      const vis = a.querySelector('span[aria-hidden="true"]');
      let t = norm(vis ? vis.textContent : a.textContent);
      if (!t) { const im = a.querySelector('img[alt]'); if (im) t = norm(im.getAttribute('alt')); }
      return t;
    }

    // ---- Image validation --------------------------------------------------
    function isValidProfileImageUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const u = url.trim();
      if (u.length < 20) return false;
      if (/^data:/i.test(u)) return false;
      if (/px\.ads\.linkedin\.com/i.test(u) || /\/collect(\/|\?)/i.test(u)) return false;
      if (/ghost[-_]person|ghost-|default-|blank/i.test(u)) return false;
      if (/\.gif(\?|$)/i.test(u)) return false;
      return true;
    }
    function imageElementLooksReal(img) {
      if (!img) return false;
      try {
        const st = img.ownerDocument.defaultView.getComputedStyle(img);
        if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) return false;
      } catch (e) {}
      const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width') || '0', 10);
      const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height') || '0', 10);
      if (w > 0 && w <= 2) return false;
      if (h > 0 && h <= 2) return false;
      return true;
    }

    // ---- Validators --------------------------------------------------------
    function isValidName(t) {
      t = norm(t);
      if (!t || t.length < 2 || t.length > 80) return false;
      if (GENERIC_IMG_ALT.test(t) || BADGE_RE.test(t)) return false;
      if (!/[a-z]/i.test(t)) return false;
      if (ACTIVITY_RE.test(t) || /linkedin|contact info/i.test(t)) return false;
      return true;
    }
    function isValidHeadline(t) {
      t = norm(t);
      if (!t || t.length < 3 || t.length > 320) return false;
      if (t === data.fullName || t === data.company) return false;
      if (PRONOUN_RE.test(t)) return false;                  // "He/Him", "She/Her", "They/Them"
      if (BADGE_RE.test(t) || GENERIC_IMG_ALT.test(t)) return false;
      if (ACTIVITY_RE.test(t)) return false;                 // "41 · 8 comments", "500+ connections"
      if (/^\d[\d,\.\s+·•]*$/.test(t)) return false;          // pure numbers / counters
      if (/^\d/.test(t) && t.length < 20) return false;       // "41 · 8 comments" style
      // Bare location "City, Region, Country" with no role words / separators.
      if (/,/.test(t) && !/[|/&()@]/.test(t) && t.split(',').length <= 3 && t.length < 60 && !ROLE_KEYWORDS.test(t)) return false;
      return true;
    }
    function isValidCompany(t) {
      t = norm(t);
      if (!t || t.length < 2 || t.length > 80) return false;
      if (GENERIC_IMG_ALT.test(t) || BADGE_RE.test(t)) return false;
      if (ACTIVITY_RE.test(t) || CTA_RE.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (t === data.fullName || t === data.shortSummary) return false;
      if (/,/.test(t) && t.split(',').length >= 3) return false;   // location
      // Reject lone lowercase buzzwords ("scale", "growth", "frontend") — a
      // real org name is capitalized or multi-word or has a corp suffix.
      const buzz = /^(scale|scaling|building|growth|performance|frontend|front-end|backend|back-end|clean ui|innovation|design|leadership|strategy|engineering|development|technology|solutions?)$/i;
      if (buzz.test(t)) return false;
      const looksOrg = /[A-Z]/.test(t) || /\s/.test(t) || /\b(inc|llc|ltd|corp|gmbh|pvt|technologies|systems|labs|group|solutions|software|services|consulting|university|institute|college|school)\b/i.test(t);
      if (!looksOrg) return false;
      return true;
    }
    function isValidPosition(t) {
      t = norm(t);
      if (!t || t.length < 2 || t.length > 120) return false;
      if (PRONOUN_RE.test(t)) return false;                  // never a pronoun line
      if (BADGE_RE.test(t) || GENERIC_IMG_ALT.test(t)) return false;
      if (ACTIVITY_RE.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (t === data.fullName || t === data.company) return false;
      return true;
    }
    function cleanCompany(t) {
      t = norm(t).split(/\s*[·•|]\s*/)[0].trim();
      t = t.replace(new RegExp('\\s+' + EMPLOYMENT_RE.source + '\\s*$', 'i'), '').trim();
      t = t.replace(/\s*logo$/i, '').trim();
      return t;
    }
    // Split full name → first/last (drop honorific + trailing badge).
    function assignName(fullName, source) {
      let clean = norm(fullName).replace(/\s*[·•]\s*(1st|2nd|3rd|\d+(?:st|nd|rd|th)).*$/i, '').trim();
      if (!isValidName(clean)) return false;
      data.fullName = clean;
      const noTitle = clean.replace(/^(dr|mr|mrs|ms|miss|prof|professor|sir|rev|fr|capt|lt|col|gen|hon)\.?\s+/i, '');
      const parts = (noTitle || clean).split(/\s+/);
      data.firstName = parts[0] || '';
      data.lastName = (parts.slice(1).join(' ') || '').replace(/\s*\([^)]*\)/g, '').trim();
      markSource('name', source);
      return true;
    }

    // =====================================================================
    // STEP 1 — Locate semantic sections (each exactly once).
    // Profile detail sections are anchored by <div id="about|experience|…">
    // inside their <section>; the top card is the intro <section> holding the
    // self /in/ link. Activity/Featured/etc. are identified so we can EXCLUDE
    // them, never read from them.
    // =====================================================================
    const slugMatch = href.match(/\/in\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : '';

    function sectionByAnchor(id, headingWord) {
      const anchor = document.getElementById(id);
      if (anchor) { const s = anchor.closest('section'); if (s) return s; }
      if (headingWord) {
        return Array.from(document.querySelectorAll('main section')).find((sec) => {
          const h = sec.querySelector('h2, h3, [role="heading"]');
          return h && new RegExp('^' + headingWord + '$', 'i').test(norm(h.textContent));
        }) || null;
      }
      return null;
    }

    const sections = {
      about: sectionByAnchor('about', 'about'),
      experience: sectionByAnchor('experience', 'experience'),
      education: sectionByAnchor('education', 'education'),
      activity: sectionByAnchor('content_collections', 'activity') ||
                Array.from(document.querySelectorAll('main section')).find((sec) => {
                  const h = sec.querySelector('h2, [role="heading"]');
                  return h && /^activity$/i.test(norm(h.textContent));
                }) || document.querySelector('section[class*="recent-activity"]') || null,
      featured: sectionByAnchor('featured', 'featured')
    };

    // Top card = the <section> that contains the self /in/ link AND is not one
    // of the detail sections above. Fall back to the first <main> section.
    let topCard = null;
    if (slug) {
      const selfLinks = deepQueryAll('a[href*="/in/' + slug + '"]');
      for (const link of selfLinks) {
        const sec = link.closest('section');
        if (sec && sec !== sections.about && sec !== sections.experience &&
            sec !== sections.education && sec !== sections.activity && sec !== sections.featured) {
          topCard = sec; break;
        }
      }
    }
    if (!topCard) topCard = document.querySelector('main > section') || document.querySelector('main section');

    // Guard: is a node inside a container we must never read from?
    function inExcludedArea(el) {
      if (!el) return true;
      const bad = [sections.activity, sections.featured];
      for (const b of bad) if (b && b.contains(el)) return true;
      // Right rail / "People also viewed" / ads live in <aside> outside <main>.
      if (el.closest('aside')) {
        // …but the current-company chip is sometimes in an aside adjacent to
        // the top card. Allow asides that sit before the About section.
        const aside = el.closest('aside');
        if (sections.about && (aside.compareDocumentPosition(sections.about) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return true;
      }
      return false;
    }

    // =====================================================================
    // Build the result object.
    // =====================================================================
    const data = {
      firstName: '', lastName: '', fullName: '', email: '', shortSummary: '',
      currentPosition: '', company: '', phone: '', about: '', profilePicture: '',
      linkedinUrl: window.location.href, posts: [], experiences: []
    };

    // =====================================================================
    // STEP 2 — EXPERIENCE (rewritten). One entry per top-level item; supports
    // <ul>/<li>, div rows, nested sub-roles (multiple titles under one company),
    // plain-text and collapsed layouts.
    // =====================================================================
    function parseExperience() {
      const section = sections.experience;
      if (!section) return [];
      const out = [];

      // Candidate top-level entries.
      let items = Array.from(section.querySelectorAll('li')).filter((li) => !li.parentElement.closest('li'));
      if (!items.length) {
        const list = section.querySelector('ul, [class*="pvs-list"], [class*="list"]');
        if (list) items = Array.from(list.children).filter((c) => c.querySelector && norm(c.textContent));
      }

      const looksLikeCount = (t) => ACTIVITY_RE.test(t) || /^\d[\d,\.]*$/.test(t);
      const looksLikeDate = (t) => /\b(19|20)\d{2}\b|present|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b\d+\s*(yr|yrs|mo|mos)\b/i.test(t);

      items.forEach((item) => {
        // Nested sub-roles: one company, multiple <li> roles beneath it.
        const nested = Array.from(item.querySelectorAll('li')).filter((li) => li !== item && li.parentElement.closest('li') === item);
        const companyHint = (item.querySelector('a[href*="/company/"]') && linkText(item.querySelector('a[href*="/company/"]'))) || '';

        if (nested.length) {
          const compName = cleanCompany(companyHint || (textLines(item)[0] || ''));
          nested.forEach((sub) => {
            const lines = textLines(sub).filter((t) => !looksLikeCount(t));
            if (!lines.length) return;
            out.push(buildExp(lines, compName, sub));
          });
          return;
        }

        const lines = textLines(item).filter((t) => !looksLikeCount(t));
        if (!lines.length) return;
        out.push(buildExp(lines, cleanCompany(companyHint), item));
      });

      function buildExp(lines, companyHint, node) {
        // lines order on /in/: [0]=title, [1]=company·type, [2]=dates, [3]=loc
        const title = lines[0] || '';
        let company = companyHint || cleanCompany(lines[1] || '');
        let dates = '', location = '', description = '';
        for (let i = 1; i < lines.length; i++) {
          if (!dates && looksLikeDate(lines[i])) { dates = lines[i]; continue; }
          if (dates && !location && !looksLikeDate(lines[i]) && lines[i].length < 60 && !description) { location = lines[i]; continue; }
        }
        const link = node.querySelector('a[href*="/company/"]');
        return {
          companyName: company, companyUrl: link ? link.href : '', companyDuration: '',
          jobTitle: title, startDate: '', endDate: null, duration: dates,
          location: location, description: description,
          current: /present/i.test(dates)
        };
      }

      return out.filter((e) => e.jobTitle || e.companyName);
    }

    // =====================================================================
    // STEP 3 — extraction, section by section.
    // =====================================================================
    // --- Embedded Voyager JSON (most authoritative when present) ----------
    (function fromVoyager() {
      const included = [];
      const nodes = [].concat(deepQueryAll('code'), deepQueryAll('script[type="application/json"]'));
      for (const node of nodes) {
        const raw = norm(node.textContent);
        if (!raw || (raw[0] !== '{' && raw[0] !== '[')) continue;
        if (raw.indexOf('com.linkedin') === -1 && raw.indexOf('"included"') === -1) continue;
        let parsed; try { parsed = JSON.parse(node.textContent); } catch (e) { continue; }
        if (Array.isArray(parsed && parsed.included)) included.push(...parsed.included);
      }
      if (!included.length) return;
      const typeIs = (e, sfx) => e && typeof e.$type === 'string' && e.$type.endsWith(sfx);
      const profile = included.find((e) => typeIs(e, '.identity.profile.Profile') && typeof e.firstName === 'string');
      if (profile) {
        if (!data.fullName) { if (assignName([profile.firstName, profile.lastName].filter(Boolean).join(' '), 'Voyager')) { if (profile.firstName) data.firstName = norm(profile.firstName); if (profile.lastName) data.lastName = norm(profile.lastName).replace(/\s*\([^)]*\)/g, '').trim(); } }
        if (!data.shortSummary && profile.headline && isValidHeadline(profile.headline)) { data.shortSummary = norm(profile.headline); markSource('headline', 'Voyager'); }
        if (!data.profilePicture) {
          const pic = profile.profilePicture && (profile.profilePicture.displayImageReference || profile.profilePicture);
          const vec = pic && (pic.vectorImage || (pic.image && pic.image.vectorImage));
          if (vec && vec.rootUrl && Array.isArray(vec.artifacts) && vec.artifacts.length) {
            const url = vec.rootUrl + (vec.artifacts[vec.artifacts.length - 1].fileIdentifyingUrlPathSegment || '');
            if (isValidProfileImageUrl(url)) { data.profilePicture = url; markSource('profilePicture', 'Voyager'); }
          }
        }
      }
      const positions = included.filter((e) => typeIs(e, '.identity.profile.Position'));
      if (positions.length) {
        const companies = {}; included.forEach((e) => { if (typeIs(e, '.organization.Company') && e.entityUrn && e.name) companies[e.entityUrn] = e.name; });
        const resolve = (p) => cleanCompany(p.companyName || (p.company && (p.company.name || companies[p.company] || companies[p['*company']])) || '');
        if (!data.experiences.length) {
          data.experiences = positions.map((p) => ({
            companyName: resolve(p), companyUrl: '', companyDuration: '', jobTitle: norm(p.title),
            startDate: p.dateRange && p.dateRange.start ? [p.dateRange.start.month, p.dateRange.start.year].filter(Boolean).join('/') : '',
            endDate: p.dateRange && p.dateRange.end ? [p.dateRange.end.month, p.dateRange.end.year].filter(Boolean).join('/') : null,
            duration: '', location: norm(p.locationName), description: norm(p.description), current: !(p.dateRange && p.dateRange.end)
          })).filter((e) => e.jobTitle || e.companyName);
          if (data.experiences.length) markSource('experiences', 'Voyager');
        }
      }
    })();

    // --- JSON-LD ----------------------------------------------------------
    (function fromJsonLd() {
      document.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => {
        let parsed; try { parsed = JSON.parse(sc.textContent); } catch (e) { return; }
        const graph = Array.isArray(parsed) ? parsed : (Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
        const typeOf = (n) => { const t = n && n['@type']; return Array.isArray(t) ? t.map(String) : (t ? [String(t)] : []); };
        const person = graph.find((n) => typeOf(n).includes('Person'));
        if (!person) return;
        if (!data.fullName) { const gf = [person.givenName, person.familyName].filter(Boolean).join(' ').trim(); if (assignName(person.name || gf, 'JSON-LD')) { if (person.givenName) data.firstName = norm(person.givenName); if (person.familyName) data.lastName = norm(person.familyName).replace(/\s*\([^)]*\)/g, '').trim(); } }
        if (!data.shortSummary) { const jt = Array.isArray(person.jobTitle) ? person.jobTitle.filter(Boolean).join(', ') : person.jobTitle; const hl = norm(jt || person.description); if (isValidHeadline(hl)) { data.shortSummary = hl; markSource('headline', 'JSON-LD'); } }
        if (!data.company && person.worksFor) { let w = person.worksFor; if (Array.isArray(w)) w = w[0]; let nm = ''; if (w && typeof w === 'object') { if (w.name) nm = w.name; else if (w['@id']) { const o = graph.find((n) => n['@id'] === w['@id']); if (o && o.name) nm = o.name; } } else if (typeof w === 'string') nm = w; nm = cleanCompany(nm); if (isValidCompany(nm)) { data.company = nm; markSource('company', 'JSON-LD'); } }
        if (person.url && /linkedin\.com\/in\//i.test(person.url)) data.linkedinUrl = person.url;
        if (!data.profilePicture && person.image) { let im = person.image; if (Array.isArray(im)) im = im[0]; const u = (im && typeof im === 'object') ? (im.contentUrl || im.url || '') : (typeof im === 'string' ? im : ''); if (isValidProfileImageUrl(u)) { data.profilePicture = norm(u); markSource('profilePicture', 'JSON-LD'); } }
      });
    })();

    // --- Experience (DOM) — the authority for currentPosition + company ----
    if (!data.experiences.length) { data.experiences = parseExperience(); if (data.experiences.length) markSource('experiences', 'DOM(#experience)'); }
    if (data.experiences.length) {
      const first = data.experiences.find((e) => e.current) || data.experiences[0];
      if (first) {
        if (!data.currentPosition && isValidPosition(first.jobTitle)) { data.currentPosition = first.jobTitle; markSource('currentPosition', 'DOM(#experience)'); }
        const c = cleanCompany(first.companyName);
        if (!data.company && isValidCompany(c)) { data.company = c; markSource('company', 'DOM(#experience)'); }
      }
    }

    // --- TOP CARD — name, headline, company/school preview, picture --------
    (function fromTopCard() {
      if (!topCard) return;

      // NAME: self-link text, else tab title.
      if (!data.fullName && slug) {
        for (const link of Array.from(topCard.querySelectorAll('a[href*="/in/' + slug + '"]'))) {
          const t = linkText(link);
          if (isValidName(t)) { assignName(t, 'TopCard(self-link)'); break; }
        }
      }
      if (!data.fullName) {
        const tn = norm((document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*[|·]\s*LinkedIn.*$/i, '').replace(/\s*[|·].*$/, ''));
        if (isValidName(tn)) assignName(tn, 'TopCard(title)');
      }

      // COMPANY preview: first /company/ link INSIDE the top card region.
      if (!data.company) {
        for (const link of Array.from(topCard.querySelectorAll('a[href*="/company/"]'))) {
          if (inExcludedArea(link)) continue;
          const c = cleanCompany(linkText(link));
          if (isValidCompany(c)) { data.company = c; markSource('company', 'TopCard(company-link)'); break; }
        }
        // Adjacent current-company aside (before About), if any.
        if (!data.company) {
          const main = document.querySelector('main') || document;
          for (const link of Array.from(main.querySelectorAll('a[href*="/company/"]'))) {
            if (sections.about && (link.compareDocumentPosition(sections.about) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue;
            if (inExcludedArea(link)) continue;
            const c = cleanCompany(linkText(link));
            if (isValidCompany(c)) { data.company = c; markSource('company', 'TopCard(company-aside)'); break; }
          }
        }
      }

      // HEADLINE: the professional line directly under the name, read ONLY
      // from the top card. Strip a leading name+badge; reject activity/badges.
      if (!data.shortSummary) {
        const orgTexts = new Set();
        topCard.querySelectorAll('a[href*="/company/"], a[href*="/school/"]').forEach((a) => { const t = linkText(a); if (t) orgTexts.add(t); });
        const stripNameBadge = (t) => {
          let s = t;
          if (data.fullName) s = s.replace(new RegExp('^' + data.fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '');
          return s.replace(/^[\s·•]*(1st|2nd|3rd|\d+(?:st|nd|rd|th))\b/i, '')
                  .replace(/[·•]\s*(1st|2nd|3rd|\d+(?:st|nd|rd|th))\b.*$/i, '')
                  .replace(/^[\s·•]+/, '').trim();
        };
        for (const line of textLines(topCard)) {
          if (orgTexts.has(line)) continue;
          const t = stripNameBadge(line);
          if (t && t !== data.company && isValidHeadline(t)) { data.shortSummary = t; markSource('headline', 'TopCard'); break; }
        }
      }

      // PICTURE: alt≈name, else the largest valid image in the top card.
      if (!data.profilePicture) {
        const urlOf = (img) => img ? (img.currentSrc || img.src || img.getAttribute('data-delayed-url') || img.getAttribute('data-ghost-url') || '') : '';
        const take = (img, src) => { if (img && imageElementLooksReal(img)) { const u = urlOf(img); if (isValidProfileImageUrl(u)) { data.profilePicture = u.trim(); markSource('profilePicture', src); return true; } } return false; };
        if (data.fullName) {
          const byAlt = topCard.querySelectorAll ? Array.from(topCard.querySelectorAll('img')).find((img) => { const a = norm(img.getAttribute('alt')); return a && !GENERIC_IMG_ALT.test(a) && a.indexOf(data.fullName) !== -1; }) : null;
          if (byAlt) take(byAlt, 'TopCard(img alt=name)');
        }
        if (!data.profilePicture) {
          let best = null, area = 0;
          topCard.querySelectorAll('img').forEach((img) => { const w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0; if (w * h > area && isValidProfileImageUrl(urlOf(img))) { area = w * h; best = img; } });
          if (best) take(best, 'TopCard(largest img)');
        }
      }
    })();

    // --- ABOUT — only the About section body ------------------------------
    if (!data.about && sections.about) {
      let best = '';
      const consider = (t) => { t = norm(t); if (!t || /^about$/i.test(t)) return; if (/^(…|\.\.\.)?\s*(see|show) (more|less)$/i.test(t)) return; if (t.length > best.length) best = t; };
      sections.about.querySelectorAll('span[aria-hidden="true"]').forEach((el) => consider(el.textContent));
      if (best.length <= 10) sections.about.querySelectorAll('span, div, p').forEach((el) => { if (!el.children || el.children.length <= 1) consider(el.textContent); });
      best = best.replace(/^About(?=[A-Z"'’])/, '').replace(/^About\s+/i, '').replace(/\s*…?\s*(see|show) more\s*$/i, '').trim();
      if (best.length > 10) { data.about = best; markSource('about', 'AboutSection'); }
    }

    // --- Company / position last-resort from headline "at/@ Company" -------
    if (!data.company && data.shortSummary) {
      const mm = data.shortSummary.match(/(?:\bat\s+|@)\s*([A-Z][^,.|@\n]*?)(?:\s*[,.|]|\s+(?:and|where|dedicated|focused|working|building)\b|$)/);
      const c = mm ? cleanCompany(mm[1]) : '';
      if (isValidCompany(c)) { data.company = c; markSource('company', 'headline(at)'); }
    }
    if (!data.currentPosition && data.shortSummary) {
      const at = data.shortSummary.search(/\s+at\s+|@/i);
      const cp = at !== -1 ? data.shortSummary.slice(0, at).trim() : data.shortSummary.split(/\s*[|·•]\s*/)[0].trim();
      if (isValidPosition(cp)) { data.currentPosition = cp; markSource('currentPosition', 'headline'); }
    }

    // =====================================================================
    // STEP 4 — final validation (never emit an obviously-wrong value).
    // =====================================================================
    if (data.fullName && (GENERIC_IMG_ALT.test(data.fullName) || BADGE_RE.test(data.fullName) || ACTIVITY_RE.test(data.fullName))) { data.fullName = data.firstName = data.lastName = ''; }
    if (data.shortSummary && !isValidHeadline(data.shortSummary)) data.shortSummary = '';
    if (data.company && !isValidCompany(cleanCompany(data.company))) data.company = ''; else if (data.company) data.company = cleanCompany(data.company);
    if (data.currentPosition && !isValidPosition(data.currentPosition)) data.currentPosition = '';
    if (data.about) { data.about = data.about.replace(/^About\s*/i, '').trim(); if (data.about.length < 3) data.about = ''; }
    // --- Extract Contact Info (Email & Phone) ---
    // First try the phone attribute at index 2
    const phoneElements = document.querySelectorAll('[phone]');
    if (phoneElements.length > 2) {
      const phoneEl = phoneElements[2]; // Index 2 = 3rd element
      const phoneValue = phoneEl.getAttribute('phone') || phoneEl.textContent.trim();
      if (phoneValue) {
        data.phone = phoneValue;
      }
    }

    // Fallback: check for other contact info
    const contactSelectors = [
      'a[href^="mailto:"]',
      'a[href^="tel:"]',
      '.contact-info span[aria-hidden="true"]'
    ];

    for (const contactSel of contactSelectors) {
      const contactEls = document.querySelectorAll(contactSel);
      contactEls.forEach(el => {
        const href = el.href || '';
        const text = el.textContent.trim();
        if (href.startsWith('mailto:')) {
          data.email = href.replace('mailto:', '');
        } else if (href.startsWith('tel:')) {
          data.phone = href.replace('tel:', '');
        } else if (/\d{3}/.test(text) && text.length > 7) {
          data.phone = text;
        }
      });
    }

    // --- Extract Recent Posts ---
    // Find the recent activity section and extract post objects
    const activitySection = document.querySelector('section[class*="_recent-activity-v2__section"]');
    data.posts = [];

    if (activitySection) {

      // Generic article selector - try multiple approaches
      let postArticles = activitySection.querySelectorAll('article');
      
      // If no articles found, try other selectors
      if (postArticles.length === 0) {
        const fallbackSelectors = [
          'li[class*="_listItem"] article',
          'ul[class*="_list"] article',
          'article[class*="feed-shared"]',
          '[data-urn*="activity"] article',
          '.activity-item',
          '.post-item'
        ];

        for (const selector of fallbackSelectors) {
          postArticles = activitySection.querySelectorAll(selector);
          if (postArticles.length > 0) {
            break;
          }
        }
      }


      // Limit to first 15 posts (reasonable amount without being overwhelming)
      const maxPosts = Math.min(postArticles.length, 15);

      for (let i = 0; i < maxPosts; i++) {
        const article = postArticles[i];
        const postData = {};

        try {
          // Extract post type from header
          const header = article.querySelector('header h4');
          if (header) {
            const headerText = header.textContent.trim();
            // Extract type: "shared a post", "reshared a post", etc.
            const typeMatch = headerText.match(/(shared|reshared|commented on|posted|published|liked|celebrated)\s+(a\s+)?(.*)/i);
            postData.type = typeMatch ? typeMatch[1].toLowerCase() : 'post';
          }

          // Extract date from time element
          const timeEl = article.querySelector('time[datetime]');
          if (timeEl) {
            postData.date = timeEl.getAttribute('datetime');
            postData.relativeTime = timeEl.textContent.trim();
          }

          // Extract full post text (handle truncation like about section)
          let fullText = '';

          // Try multiple selectors for post text - prioritize title attribute for full text
          const textSelectors = [
            'span[class*="_article-text"]',
            'span[title][class*="_text"]',
            'span[class*="article-text"]',
            'span[dir="ltr"]',
            '.feed-shared-text span',
            '.break-words',
            '[data-test-id="feed-shared-text"] span'
          ];

          for (const textSel of textSelectors) {
            const textSpan = article.querySelector(textSel);
            if (textSpan) {
              // Check if text is truncated (has title attribute with full text)
              const titleAttr = textSpan.getAttribute('title');
              if (titleAttr && titleAttr.trim().length > textSpan.textContent.trim().length) {
                fullText = titleAttr.trim();
                break;
              } else if (textSpan.textContent.trim().length > fullText.length) {
                fullText = textSpan.textContent.trim();
              }
            }
          }

          // If still no text, try getting from any text content in the article
          if (!fullText || fullText.length < 20) {
            const allTextSpans = article.querySelectorAll('span, p, div');
            for (const span of allTextSpans) {
              const spanText = span.textContent.trim();
              if (spanText.length > fullText.length && spanText.length > 50 && spanText.length < 5000) {
                fullText = spanText;
                break;
              }
            }
          }

          // Clean up any truncation indicators
          fullText = fullText
            .replace(/\s*…\s*$/, '')
            .replace(/\s*Show more\s*$/i, '')
            .replace(/\s*See more\s*$/i, '')
            .trim();

          postData.text = fullText;

          // Check for image
          const imageSelectors = [
            'img[class*="_article-image"]',
            'img[class*="article-image"]',
            'div[class*="_image"] img',
            'img[alt*="Thumbnail"]',
            '.feed-shared-image img',
            'img[data-delayed-url]'
          ];

          for (const imgSel of imageSelectors) {
            const imageEl = article.querySelector(imgSel);
            if (imageEl) {
              postData.hasImage = true;
              postData.imageUrl = imageEl.src || imageEl.getAttribute('data-delayed-url');
              postData.imageAlt = imageEl.alt || '';
              break;
            }
          }

          if (!postData.hasImage) {
            postData.hasImage = false;
          }

          // Extract engagement metrics
          postData.engagement = { reactions: 0, comments: 0 };

          // Find reactions count - try multiple selectors
          const reactionSelectors = [
            'span[aria-hidden="true"][class*="ml2"]',
            'span[aria-hidden="true"].ml2',
            'span.ml2',
            'span[data-test-id*="reaction"]',
            '.social-counts-reactions span',
            'button[data-test-id*="reaction"] span'
          ];

          for (const reactSel of reactionSelectors) {
            const reactionsSpan = article.querySelector(reactSel);
            if (reactionsSpan) {
              const reactionsText = reactionsSpan.textContent.trim();
              const reactionsNum = parseInt(reactionsText.replace(/[^\d]/g, ''));
              if (!isNaN(reactionsNum)) {
                postData.engagement.reactions = reactionsNum;
                break;
              }
            }
          }

          // Find comments count - try multiple selectors
          const commentSelectors = [
            'span[class*="mlA"]',
            'span.mlA',
            'span[data-test-id*="comment"]',
            '.social-counts-comments span',
            'button[data-test-id*="comment"] span',
            'div[class*="mt2"] span:last-child'
          ];

          for (const commentSel of commentSelectors) {
            const commentsSpan = article.querySelector(commentSel);
            if (commentsSpan) {
              const commentsText = commentsSpan.textContent.trim();
              const commentsNum = parseInt(commentsText.replace(/[^\d]/g, ''));
              if (!isNaN(commentsNum)) {
                postData.engagement.comments = commentsNum;
                break;
              }
            }
          }


          // Only add post if it has meaningful content
          if (postData.text && postData.text.length > 10) {
            data.posts.push(postData);
          }

        } catch (error) {
          console.error(`[SCRAPE] Error extracting post ${i+1}:`, error);
        }
      }

    } else {

      // Try to find posts in other locations on the page
      const fallbackPostSelectors = [
        '.feed-shared-update-v2',
        '.profile-creator-shared-feed-update__container',
        '[data-urn*="activity"]',
        '.pv-recent-activity-section__feed-item',
        '.pv-recent-activity-section-v2__entity-container',
        '.profile-creator-shared-content-with-text',
        '.activity-item',
        '.post-item'
      ];

      for (const selector of fallbackPostSelectors) {
        const posts = document.querySelectorAll(selector);
        if (posts.length > 0) {

          // Extract basic text from fallback posts
          const maxFallbackPosts = Math.min(posts.length, 10);
          for (let i = 0; i < maxFallbackPosts; i++) {
            const postEl = posts[i];
            const postText = postEl.textContent.trim();
            if (postText && postText.length > 20) {
              data.posts.push({
                text: postText,
                type: 'post',
                date: null,
                relativeTime: null,
                engagement: { reactions: 0, comments: 0 },
                hasImage: false
              });
            }
          }
          break;
        }
      }

    }

    // TEMP VERIFICATION: attach per-field source map + page structure so the
    // panel can print a compact per-profile report. Remove once verified.
    data.__sources = fieldSources;
    data.__diag = {
      pageType: 'linkedin',
      counts: {
        h1: deepQueryAll('h1').length,
        code: deepQueryAll('code').length,
        jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
        ogTitle: document.querySelectorAll('meta[property="og:title"]').length
      }
    };
    return data;
  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
}

async function extractCompanyDataFromPage() {
  const extractBtn = document.getElementById('extractCompanyDataBtn');
  const statusEl = document.getElementById('companyExtractionStatus');
  
  if (!extractBtn) return;
  
  extractBtn.disabled = true;
  const originalText = extractBtn.textContent;
  extractBtn.textContent = '⏳ Extracting...';
  if (statusEl) statusEl.textContent = 'Extracting company details from current page...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com/sales/company/')) {
      throw new Error('Please navigate to a LinkedIn company profile page');
    }
    
    console.log('[COMPANY] Starting extraction on tab:', tab.url);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: scrapeLinkedInCompany
    });
    
    const companyData = results[0].result;
    if (!companyData) {
      throw new Error('Failed to extract company data');
    }
    
    extractedCompanyData = companyData;
    displayCompanyData(companyData);
    
    if (statusEl) statusEl.innerHTML = '<span style="color: #10b981;">✓ Company details extracted successfully!</span>';
    showToast('Company details extracted successfully!', 'success');
  } catch (error) {
    console.error('Company extraction error:', error);
    if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">✗ ${error.message}</span>`;
    showToast(error.message || 'Error extracting company data', 'error');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = originalText;
  }
}

function displayCompanyData(companyData) {
  const displayEl = document.getElementById('companyDataDisplay');
  if (!displayEl) return;
  
  document.getElementById('companyName').textContent = companyData.name || '-';
  document.getElementById('companyIndustry').textContent = companyData.industry || '-';
  document.getElementById('companySize').textContent = companyData.companySize || '-';
  document.getElementById('companyLocation').textContent = companyData.location || '-';
  document.getElementById('companyWebsite').textContent = companyData.website || '-';
  
  // Display revenue sources
  const revenueEl = document.getElementById('companyRevenueSources');
  if (revenueEl) {
    revenueEl.textContent = companyData.revenueSources || '-';
  }
  
  // Display challenges
  const challengesEl = document.getElementById('companyChallenges');
  if (challengesEl) {
    if (companyData.challenges && companyData.challenges.length > 0) {
      challengesEl.innerHTML = companyData.challenges
        .map((challenge, idx) => `<div style="padding: 6px 0; border-bottom: 1px solid #e5e7eb;">• ${challenge}</div>`)
        .join('');
    } else {
      challengesEl.textContent = '-';
    }
  }
  
  // Display competitive landscape
  const competitiveEl = document.getElementById('companyCompetitiveLandscape');
  if (competitiveEl) {
    competitiveEl.textContent = companyData.competitiveLandscape || '-';
  }
  
  displayEl.style.display = 'block';
  console.log('[COMPANY] Company data displayed:', companyData);
}

// Scrape company data from LinkedIn company profile
function scrapeLinkedInCompany() {
  console.log("[COMPANY] scrapeLinkedInCompany function started.");
  try {
    const data = {
      name: '',
      industry: '',
      companySize: '',
      location: '',
      website: '',
      revenueSources: '',
      challenges: [],
      competitiveLandscape: ''
    };

    // 1. Extract company name
    const nameEl = document.querySelector('[data-x--account--name]');
    if (nameEl && nameEl.textContent.trim()) {
      data.name = nameEl.textContent.trim();
      console.log(`[COMPANY] Name: '${data.name}'`);
    }

    // 2. Extract industry
    const industryEl = document.querySelector('[data-anonymize="industry"]');
    if (industryEl && industryEl.textContent.trim()) {
      data.industry = industryEl.textContent.trim();
      console.log(`[COMPANY] Industry: '${data.industry}'`);
    }

    // 3. Extract location
    const locationEl = document.querySelector('[data-anonymize="location"]');
    if (locationEl && locationEl.textContent.trim()) {
      data.location = locationEl.textContent.trim();
      console.log(`[COMPANY] Location: '${data.location}'`);
    }

    // 4. Extract employee count/company size
    const companySizeEl = document.querySelector('[data-anonymize="company-size"]');
    if (companySizeEl && companySizeEl.textContent.trim()) {
      data.companySize = companySizeEl.textContent.trim();
      console.log(`[COMPANY] Company Size: '${data.companySize}'`);
    }

    // 5. Extract company website
    const websiteEl = document.querySelector('[data-control-name="visit_company_website"]');
    if (websiteEl) {
      data.website = websiteEl.href || websiteEl.textContent.trim();
      console.log(`[COMPANY] Website: '${data.website}'`);
    }

    // 6. Extract revenue sources text (p sibling of h3 that contains data-section-name="revenue_sources")
    const revenueSectionEl = document.querySelector('[data-section-name="revenue_sources"]');
    if (revenueSectionEl) {
      const h3 = revenueSectionEl.closest('h3');
      const revenuePEl = h3?.nextElementSibling;
      if (revenuePEl && revenuePEl.textContent.trim()) {
        data.revenueSources = revenuePEl.textContent.trim();
        console.log(`[COMPANY] Revenue Sources: '${data.revenueSources.substring(0, 100)}...'`);
      } else {
        console.log('[COMPANY] Revenue Sources p element not found');
      }
    }

    // 7. Extract challenges (ul > li > strong title + p description, 3 items)
    const challengesSectionEl = document.querySelector('[data-section-name="challenges_and_pain_points"]');
    if (challengesSectionEl) {
      const h3 = challengesSectionEl.closest('h3');
      const ulEl = h3?.nextElementSibling;
      if (ulEl && ulEl.tagName === 'UL') {
        const challengeItems = ulEl.querySelectorAll('li');
        console.log(`[COMPANY] Found ${challengeItems.length} challenge items`);
        
        challengeItems.forEach((li, index) => {
          const strongEl = li.querySelector('strong');
          const pEl = li.querySelector('p');
          
          const title = strongEl?.textContent?.trim() || '';
          const description = pEl?.textContent?.trim() || '';
          
          // Combine title and description
          const fullChallenge = description ? `${title}: ${description}` : title;
          
          if (fullChallenge) {
            data.challenges.push(fullChallenge);
            console.log(`[COMPANY] Challenge ${index + 1}: '${fullChallenge.substring(0, 100)}...'`);
          }
        });
      } else {
        console.log('[COMPANY] Challenges ul element not found');
      }
    }

    // 8. Extract competitive landscape text (p sibling of h3 that contains data-section-name="competitive_landscape")
    const competitiveLandscapeContainer = document.querySelector('[data-section-name="competitive_landscape"]');
    if (competitiveLandscapeContainer) {
      const h3 = competitiveLandscapeContainer.closest('h3');
      const competitivePEl = h3?.nextElementSibling;
      if (competitivePEl && competitivePEl.textContent.trim()) {
        data.competitiveLandscape = competitivePEl.textContent.trim();
        console.log(`[COMPANY] Competitive Landscape: '${data.competitiveLandscape.substring(0, 100)}...'`);
      } else {
        console.log('[COMPANY] Competitive Landscape p element not found');
      }
    }

    console.log('[COMPANY] Final extracted data:', data);
    return data;
  } catch (error) {
    console.error('[COMPANY] Scraping error:', error);
    return null;
  }
}
