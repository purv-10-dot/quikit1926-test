

(function() {
  console.log("LinkedIn CRM Extension starting...");

  const STORAGE_KEY_TOKEN = 'authToken';
  const STORAGE_KEY_EMAIL = 'userEmail';
  const STORAGE_KEY_ORG = 'selectedOrganization';

  // The currently active organization ({ id, name }) for this session. Sourced
  // from chrome.storage.local so it survives side-panel reopen / browser
  // refresh; cleared only on logout.
  let currentOrg = null;

  // Every org the signed-in user can act in, as returned by
  // /api/extension-auth/organizations. Cached here so the extractor screen's
  // switcher can list them without a second request; the full-screen picker
  // still resolves its own submit against `renderedOrgs` exactly as before.
  let availableOrgs = [];

  // On load: check auth and show either login view or extractor view
  /**
   * Ask the active LinkedIn tab's content script to inject the QuikCRM Connect
   * button, so it appears as soon as the panel opens rather than waiting for
   * the user to click "Extract Profile Data".
   *
   * Fire-and-forget: this is a convenience nudge, and the content script also
   * injects on its own via its MutationObserver. Every failure path here is
   * therefore logged and swallowed — it must never block the panel from
   * loading.
   */
  async function requestConnectButtonInjection() {
    try {
      const tab = await getActiveLinkedInTab();
      if (!tab || !tab.id || !isLinkedInUrl(tab.url)) return;

      // Profile pages only — never the feed, search, jobs, messaging or
      // company pages. The content script re-checks this itself; this just
      // avoids a pointless round trip.
      let pathname = '';
      try { pathname = new URL(tab.url).pathname; } catch (e) { pathname = ''; }
      if (!/^\/in\/[^/]+\/?$/i.test(pathname)) {
        console.log('[QCRM][panel] not a profile page — no injection requested', pathname);
        return;
      }

      console.log('[QCRM][panel] side panel opened — requesting button injection');
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'quikcrm:injectConnectButton' },
        (response) => {
          // The content script is absent on a tab that was already open when
          // the extension was installed/reloaded. Chrome reports that through
          // lastError, which must be read to avoid an unchecked-error warning.
          if (chrome.runtime.lastError) {
            console.log(
              '[QCRM][panel] content script not reachable (reload the LinkedIn tab):',
              chrome.runtime.lastError.message,
            );
            return;
          }
          if (response && response.success) {
            console.log(
              response.alreadyPresent
                ? '[QCRM][panel] button already exists'
                : '[QCRM][panel] injection completed',
            );
          } else {
            console.log(
              '[QCRM][panel] injection pending:',
              (response && response.reason) || 'no response',
            );
          }
        },
      );
    } catch (error) {
      console.log('[QCRM][panel] injection request failed', error);
    }
  }

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
    // Independent of auth state: the button injects regardless, and the click
    // handler surfaces a login prompt if the user is not signed in.
    void requestConnectButtonInjection();
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
      availableOrgs = [];
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
    availableOrgs = (data.data && data.data.organizations) || [];
    return availableOrgs;
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
    renderOrgSwitcher();
    initIndividualExtractor();
  }

  // Show the active organization near the top of the extractor screen, as a
  // dropdown when the user belongs to more than one org.
  //
  // Replaces the previous read-only badge. Switching persists through the SAME
  // storeOrg() the full-screen picker uses, so there is exactly one way the
  // selected org is written; every request keeps reading it from
  // chrome.storage.local as before.
  //
  // With a single org there is nothing to switch, so the whole block stays
  // hidden — single-org users see the same screen they always did.
  function renderOrgSwitcher() {
    const wrap = document.getElementById('orgSwitcher');
    const select = document.getElementById('orgSelect');
    if (!wrap || !select) return;

    const orgs = availableOrgs || [];
    if (!currentOrg || !currentOrg.id || orgs.length < 2) {
      wrap.classList.add('hidden');
      return;
    }

    select.innerHTML = '';
    orgs.forEach(function(org) {
      const opt = document.createElement('option');
      opt.value = org.id;
      opt.textContent = org.name || 'Unnamed organization';
      if (org.id === currentOrg.id) opt.selected = true;
      select.appendChild(opt);
    });
    wrap.classList.remove('hidden');

    // Wire once — the select is static markup, so a re-render must not stack
    // duplicate listeners (same guard the org form uses).
    if (select.dataset.wired === '1') return;
    select.dataset.wired = '1';
    select.addEventListener('change', function() {
      const org = orgs.find(function(o) { return o.id === select.value; });
      if (!org || (currentOrg && org.id === currentOrg.id)) return;
      storeOrg(org).then(function() {
        // ICPs are per-org: drop the cached list and the current selection so
        // the picker cannot keep offering (or holding) another org's ICP, then
        // reload for the org just chosen.
        resetIcpPicker();
        void loadIcpOptions();
        // Prospects are org-scoped too: drop the cached list and any selection
        // so the dropdown cannot keep offering another org's prospects.
        resetProspectSelector();
        void loadProspectOptions();
      });
    });
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
      // Prospect dropdown for the existing-prospect flow. Wired and populated
      // at panel load so the selector is usable before any extraction.
      // Fire-and-forget: a failed prospect load must never block the original
      // New-Prospect flow, which is what the default selection uses.
      wireProspectSelector();
      void loadProspectOptions();
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

// ── ICP picker ───────────────────────────────────────────────────────────────
// Searchable single-select over the org's ACTIVE ICPs. Options come from
// /api/extension-auth/icp (Bearer-authed, same as the org list); the search
// filters the already-loaded list client-side so typing never waits on a
// request. Selection is REQUIRED — the save handler blocks without one.
let icpOptionsCache = [];
let icpLoadedForOrgId = null;

/**
 * Drop the cached ICP list and any current selection.
 *
 * Called when the active organization changes: ICPs are org-scoped, so a stale
 * cache would offer another org's ICPs, and a stale hidden id would post one
 * the backend then rejects (it validates icpId against the resolved org).
 */
function resetIcpPicker() {
  icpOptionsCache = [];
  icpLoadedForOrgId = null;
  clearIcpSelection();
  const searchEl = document.getElementById('icpSearch');
  if (searchEl) {
    searchEl.value = '';
    searchEl.disabled = false;
  }
  closeIcpOptions();
}

/** Fetch the active ICP list once per org and cache it for the session. */
async function loadIcpOptions() {
  const hintEl = document.getElementById('icpHint');
  const searchEl = document.getElementById('icpSearch');
  if (!searchEl) return;

  const selectedOrg = await getSelectedOrganization();
  const orgId = selectedOrg && selectedOrg.id ? selectedOrg.id : '';

  // Already loaded for this org — nothing to do.
  if (icpLoadedForOrgId === (orgId || '__default__') && icpOptionsCache.length > 0) return;

  try {
    if (hintEl) hintEl.textContent = 'Loading ICPs…';
    const endpoint = orgId
      ? `/api/extension-auth/icp?orgId=${encodeURIComponent(orgId)}`
      : '/api/extension-auth/icp';
    const response = await window.apiFetch(endpoint);
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || 'Failed to load ICPs');
    }
    icpOptionsCache = Array.isArray(result.data && result.data.icps) ? result.data.icps : [];
    icpLoadedForOrgId = orgId || '__default__';
    if (hintEl) {
      hintEl.textContent = icpOptionsCache.length === 0
        ? 'No active ICPs in this organization.'
        : 'Required — select the ICP this prospect matches.';
    }
    if (icpOptionsCache.length === 0) {
      searchEl.disabled = true;
      searchEl.placeholder = 'No active ICPs';
    } else {
      searchEl.disabled = false;
      searchEl.placeholder = 'Search ICPs…';
    }
  } catch (error) {
    console.error('Error loading ICPs:', error);
    // The list is required for saving now, so surface the failure as blocking
    // rather than the previous "you can still save without one".
    icpOptionsCache = [];
    if (hintEl) hintEl.textContent = 'Could not load ICPs — reopen the panel and try again.';
  }
}

function renderIcpOptions(filter) {
  const listEl = document.getElementById('icpOptions');
  if (!listEl) return;
  const q = (filter || '').trim().toLowerCase();
  const matches = q
    ? icpOptionsCache.filter((icp) => (icp.name || '').toLowerCase().includes(q))
    : icpOptionsCache;

  listEl.innerHTML = '';
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'icp-empty';
    empty.textContent = icpOptionsCache.length === 0 ? 'No active ICPs.' : 'No matches.';
    listEl.appendChild(empty);
    return;
  }

  matches.forEach(function (icp) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icp-option';
    btn.setAttribute('role', 'option');
    btn.dataset.icpId = icp.id;

    const name = document.createElement('span');
    name.textContent = icp.name;
    btn.appendChild(name);

    if (icp.segment) {
      const seg = document.createElement('span');
      seg.className = 'icp-option-segment';
      // MidMarket -> "Mid-Market", matching the app's ICP labels.
      seg.textContent = icp.segment === 'MidMarket' ? 'Mid-Market' : icp.segment;
      btn.appendChild(seg);
    }

    btn.addEventListener('click', function () {
      selectIcp(icp);
    });
    listEl.appendChild(btn);
  });
}

function openIcpOptions() {
  const listEl = document.getElementById('icpOptions');
  const searchEl = document.getElementById('icpSearch');
  if (!listEl || !searchEl || searchEl.disabled) return;
  renderIcpOptions(searchEl.value);
  listEl.classList.remove('hidden');
  searchEl.setAttribute('aria-expanded', 'true');
}

function closeIcpOptions() {
  const listEl = document.getElementById('icpOptions');
  const searchEl = document.getElementById('icpSearch');
  if (listEl) listEl.classList.add('hidden');
  if (searchEl) searchEl.setAttribute('aria-expanded', 'false');
}

function selectIcp(icp) {
  const hiddenEl = document.getElementById('icpId');
  const searchEl = document.getElementById('icpSearch');
  const chipEl = document.getElementById('icpSelected');
  const chipNameEl = document.getElementById('icpSelectedName');
  if (hiddenEl) hiddenEl.value = icp.id;
  if (searchEl) searchEl.value = '';
  if (chipNameEl) chipNameEl.textContent = icp.name;
  if (chipEl) chipEl.classList.remove('hidden');
  closeIcpOptions();
}

function clearIcpSelection() {
  const hiddenEl = document.getElementById('icpId');
  const chipEl = document.getElementById('icpSelected');
  if (hiddenEl) hiddenEl.value = '';
  if (chipEl) chipEl.classList.add('hidden');
}

/** Wire the picker once; safe to call again (guards on a data flag). */
function setupIcpPicker() {
  const searchEl = document.getElementById('icpSearch');
  const clearEl = document.getElementById('icpClear');
  const pickerEl = document.getElementById('icpPicker');
  if (!searchEl || searchEl.dataset.wired === '1') return;
  searchEl.dataset.wired = '1';

  searchEl.addEventListener('focus', openIcpOptions);
  searchEl.addEventListener('input', function () {
    // Typing after a selection replaces it — the hidden id is only meaningful
    // while the chip is shown.
    renderIcpOptions(searchEl.value);
    openIcpOptions();
  });
  searchEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeIcpOptions();
  });
  if (clearEl) clearEl.addEventListener('click', clearIcpSelection);

  // Close on outside click.
  document.addEventListener('click', function (e) {
    if (pickerEl && !pickerEl.contains(e.target)) closeIcpOptions();
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

  // Conversation extraction is user-initiated ONLY — it is deliberately not
  // called from extractLinkedInData(), so profile/company scraping never pays
  // the scroll cost and never fails because of a messaging DOM change.
  const extractConversationBtn = document.getElementById('extractConversationBtn');
  if (extractConversationBtn) {
    extractConversationBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await extractConversationFromPage();
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
      // Read the ICP with the other form fields. Same hidden input the picker
      // has always written to — only the requiredness below is new.
      const selectedIcpId = (document.getElementById('icpId')?.value || '').trim();

      // Validate required fields
      let searchEmailEnabled = false;
      const searchEmailToggle = document.getElementById('searchEmailToggle');
      if (searchEmailToggle) {
        searchEmailEnabled = !!searchEmailToggle.checked;
      }
      if (!email && searchEmailEnabled) {
        // Email is optional; if the toggle is on, discovery runs after save
        showToast('Email will be searched and filled automatically.', 'info');
      }
      
      if (!headline) {
        showToast('Job Title is required', 'error');
        return;
      }
      
      if (!shortSummary) {
        showToast('Short Summary is required', 'error');
        return;
      }

      if (!selectedIcpId) {
        showToast('ICP is required', 'error');
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

        // EXISTING-PROSPECT SAVE. Sending the real prospect id switches the
        // backend from upsert-by-URL to update-by-id, so the selected prospect
        // is updated and never duplicated.
        //
        // Blocked entirely when the open LinkedIn profile is a different person
        // — writing profile B's data onto prospect A is the data-integrity
        // hazard the mismatch guard exists to prevent.
        if (selectedProspect && selectedProspect.id) {
          const matches = await refreshProspectMismatchState();
          if (!matches) {
            showToast('This LinkedIn profile does not match the selected Prospect.', 'error');
            return;
          }
          payload.prospectId = selectedProspect.id;
        }
        // Full chat thread, only when the user ran "Extract Conversation" first.
        // Omitted entirely otherwise, so the backend's "only write what was
        // sent" rule leaves any previously saved conversation untouched and the
        // existing save flow is byte-for-byte unchanged.
        // Read-only use of the extractor's output — no scraping logic here.
        if (extractedConversationData &&
            Array.isArray(extractedConversationData.messages) &&
            extractedConversationData.messages.length) {
          payload.linkedinConversation = extractedConversationData;
          console.log('[CONVO] attaching', extractedConversationData.messages.length,
            'message(s) to the Save to CRM payload');
        }
        // Validated as required above, so this is always a non-empty id by the
        // time we get here. Payload shape is unchanged — the backend still
        // receives `icpId` only when set, and never an empty string.
        if (selectedIcpId) payload.icpId = selectedIcpId;
        const response = await window.apiFetch('/api/leads/from-linkedin', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        // The backend returns { success, prospectId } (or a legacy { leadId }).
        // Treat an explicit success:false as a failure even on a 2xx.
        if (response.ok && result.success !== false) {
          // Report the INCREMENTAL merge outcome rather than the fetched count:
          // the server appends only messages after the last already-saved one,
          // so "5 new messages saved" is what actually happened.
          const conv = result.conversation;
          const sentConversation = Boolean(payload.linkedinConversation);
          if (sentConversation && conv && typeof conv.appended === 'number') {
            showToast(
              conv.appended === 0
                ? 'Prospect saved — no new messages to save'
                : `Prospect saved — ${conv.appended} new message` +
                  `${conv.appended === 1 ? '' : 's'} saved (${conv.total} total)`,
              'success',
            );
            // Keep the panel's saved-count in step with what the server stored.
            if (selectedProspect) {
              selectedProspect.__savedMessageCount = conv.total;
              renderSelectedProspect();
            }
          } else {
            showToast('Prospect saved to CRM!', 'success');
          }
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

/**
 * Extract the current LinkedIn profile and populate the panel form.
 *
 * EXTRACTION AND PREVIEW ONLY — this never calls a CRM save API. Persistence
 * happens exclusively in the "Save to CRM" handler, after the user has
 * reviewed what was extracted.
 *
 * Shared by the panel's "Extract Profile Data" button and by the injected
 * "QuikCRM Connect" button (via the quikcrm:runExtraction message), so both
 * entry points run identical logic including the posts pipeline.
 *
 * Returns true when data was extracted and populated.
 */
async function runProfileExtraction() {
  const fetchData = document.getElementById("fetchData");
  const fetchDataText = document.getElementById("fetchDatatext");
  const fetchDataLoader = document.getElementById("fetchDataloader");

  // Show loading
  if (fetchDataText) fetchDataText.textContent = "Extracting...";
  if (fetchDataLoader) {
    fetchDataLoader.classList.remove("hidden");
    fetchDataLoader.classList.add("show");
  }
  if (fetchData) fetchData.disabled = true;

  let ok = false;
  try {
    // extractLinkedInData() also runs the authored-posts pipeline, so posts
    // are captured into the preview here — still without saving anything.
    const profileData = await extractLinkedInData();
    if (profileData) {
      populateForm(profileData);
      showToast("Profile data extracted successfully!");
      ok = true;
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
  if (fetchData) fetchData.disabled = false;
  return ok;
}

function initializeFetchButton() {
  const fetchData = document.getElementById("fetchData");
  if (fetchData) {
    fetchData.addEventListener("click", async (event) => {
      event.preventDefault();
      await runProfileExtraction();
    });
  }
}

// ── Extraction requested by the injected "QuikCRM Connect" button ────────────
// The button opens this panel and then asks it to extract. Nothing is saved:
// the profile and its posts are populated into the form for review, and the
// user persists them by clicking "Save to CRM".
//
// Guarded and de-duplicated: the panel may still be mid-extraction when a
// second request arrives (double click, or the button retrying after the panel
// opened), and running two extractions concurrently would fight over the form.
let extractionInFlight = null;
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== 'quikcrm:runExtraction') return undefined;

    console.log('[QCRM][panel] extraction requested by QuikCRM Connect');
    if (extractionInFlight) {
      console.log(
        '[QCRM][panel] alreadyRunning — a previous extraction has not settled yet;',
        'the lock is held by the in-flight run and will release in its finally block',
      );
      sendResponse({ success: true, alreadyRunning: true });
      return undefined;
    }

    // Acknowledge IMMEDIATELY and run the extraction detached.
    //
    // Extraction is slow — the authored-posts pipeline opens a background tab
    // and can take tens of seconds. Holding the message channel open for that
    // long would stall the caller (which is only waiting to learn that the
    // panel is alive) and would eventually be torn down anyway. Progress and
    // errors surface in the panel UI via showToast, which is where the user is
    // looking.
    sendResponse({ success: true, started: true });

    console.log('[QCRM][panel] lock acquired — extraction started');
    extractionInFlight = (async () => {
      try {
        const ok = await runProfileExtraction();
        console.log(`[QCRM][panel] extraction completed (populated=${!!ok})`);
      } catch (error) {
        // runProfileExtraction handles its own errors, so reaching here means
        // something unexpected escaped. Logged, never swallowed silently.
        console.error('[QCRM][panel] extraction failed', error);
      } finally {
        // Sole owner of the lock. Runs on success, throw, and any early return
        // inside runProfileExtraction — so the lock cannot leak.
        extractionInFlight = null;
        console.log('[QCRM][panel] lock released — next request will start fresh');
      }
    })();

    return undefined; // responded synchronously; nothing to keep open
  });
}

/**
 * Render the extracted work experience into the panel's Experience section.
 *
 * The extractor already captures this (and "Save to CRM" already sends it as
 * `experiences`); this only surfaces it for review.
 *
 * Built with createElement/textContent rather than innerHTML: every value here
 * is scraped from a page we do not control, so string-concatenating it into
 * markup would be an injection vector.
 */
function renderExperiences(experiences) {
  const listEl = document.getElementById('experienceList');
  const countEl = document.getElementById('experienceCount');
  if (!listEl) return;

  const items = Array.isArray(experiences) ? experiences : [];
  listEl.textContent = '';

  if (countEl) {
    countEl.textContent = items.length
      ? `(${items.length} position${items.length === 1 ? '' : 's'})`
      : '';
  }

  // Auto-expand once there is something to show. The section is authored
  // collapsed (display:none) and only the toggle button ever opened it, so
  // extracted experience stayed invisible behind a ▶ — indistinguishable from
  // "nothing was extracted". Expanding on data (never on empty) means clicking
  // "Extract Profile Data" always SHOWS the experience it just captured, while
  // the user can still collapse it manually afterwards.
  const sectionEl = document.getElementById('experienceSection');
  const iconEl = document.getElementById('experienceToggleIcon');
  if (sectionEl && items.length) {
    sectionEl.style.display = 'block';
    if (iconEl) iconEl.textContent = '▼';
  }

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 13px; color: #6b7280;';
    empty.textContent = 'No experience extracted';
    listEl.appendChild(empty);
    return;
  }

  const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();

  items.forEach((raw) => {
    const exp = raw && typeof raw === 'object' ? raw : {};
    const title = text(exp.jobTitle);
    const company = text(exp.companyName);
    // Prefer LinkedIn's own duration string; otherwise compose the date range.
    const range = text(exp.duration) ||
      [text(exp.startDate), exp.current ? 'Present' : text(exp.endDate)]
        .filter(Boolean).join(' – ');
    const location = text(exp.location);
    const description = text(exp.description);

    const card = document.createElement('div');
    card.style.cssText =
      'padding: 12px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #4f46e5;';

    // Title + "Current" badge
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;';
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size: 14px; font-weight: 600; color: #111827;';
    titleEl.textContent = title || '(no title)';
    titleRow.appendChild(titleEl);
    if (exp.current) {
      const badge = document.createElement('span');
      badge.style.cssText =
        'font-size: 11px; font-weight: 600; color: #065f46; background: #d1fae5; ' +
        'border-radius: 10px; padding: 2px 8px;';
      badge.textContent = 'Current';
      titleRow.appendChild(badge);
    }
    card.appendChild(titleRow);

    // Company — linked when the scraper captured a URL.
    if (company) {
      const companyEl = document.createElement('div');
      companyEl.style.cssText = 'font-size: 13px; color: #374151; margin-top: 2px;';
      const href = text(exp.companyUrl);
      // Only http(s): the URL comes from scraped markup, so javascript:/data:
      // must never reach an anchor.
      if (/^https?:\/\//i.test(href)) {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.cssText = 'color: #4f46e5; text-decoration: none;';
        a.textContent = company;
        companyEl.appendChild(a);
      } else {
        companyEl.textContent = company;
      }
      card.appendChild(companyEl);
    }

    // Duration · location
    const meta = [range, location].filter(Boolean).join(' · ');
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 2px;';
      metaEl.textContent = meta;
      card.appendChild(metaEl);
    }

    if (description) {
      const descEl = document.createElement('div');
      descEl.style.cssText =
        'font-size: 12px; color: #4b5563; margin-top: 6px; white-space: pre-line; ' +
        'max-height: 96px; overflow-y: auto;';
      descEl.textContent = description;
      card.appendChild(descEl);
    }

    listEl.appendChild(card);
  });
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
  renderExperiences(extractedExperiences);

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

  // Wire + populate the ICP dropdown now that the form is visible. Fire-and-
  // forget: a failed ICP load must never block the extracted profile from being
  // reviewed and saved.
  setupIcpPicker();
  void loadIcpOptions();
  
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

  // Reveal the conversation action below company details. Only the BUTTON is
  // shown here — nothing is scraped until the user clicks it.
  const conversationSection = document.getElementById('conversationSection');
  if (conversationSection) {
    conversationSection.style.display = 'block';
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

// Build the public "all activity" URL for a /in/ profile. Returns '' for any
// URL that isn't a public member profile (Sales Navigator has no equivalent
// public feed page, so it keeps the on-profile preview only).
function buildRecentActivityUrl(profileUrl) {
  try {
    const u = new URL(profileUrl);
    const m = u.pathname.match(/\/in\/([^/?#]+)/i);
    if (!m) return '';
    return `${u.origin}/in/${m[1]}/recent-activity/all/`;
  } catch {
    return '';
  }
}

// Injected into the /recent-activity/all/ tab ONE BATCH AT A TIME.
//
// Why batched: a single long-running injection is killed by Chrome when the
// background tab is throttled/frozen/discarded, and executeScript then resolves
// with `result: null` — losing everything collected. Each call here does a small
// unit of work (a couple of scroll rounds, ~2s) and returns immediately, so no
// single injection is ever long enough to be killed.
//
// State lives on `window.__qcrmPostScrape` (the page persists between calls;
// closures do not, because every executeScript re-injects a fresh function).
//
// ALWAYS returns a structured object — never null/undefined:
//   { ok: true,  done, posts, debug }
//   { ok: false, error, stack, debug }
//
// Selector, classification and scroll semantics are unchanged from the previous
// single-shot implementation; only the execution boundary is different.
async function scrapeActivityBatch(ownerName, ownerSlug, batchConfig) {
  const CFG = batchConfig || {};
  const TARGET = CFG.target || 20;
  const MAX_SCAN = CFG.maxScan || 400;
  const MAX_ROUNDS = CFG.maxRounds || 40;
  const ROUNDS_PER_BATCH = CFG.roundsPerBatch || 2;
  const BATCH_BUDGET_MS = CFG.batchBudgetMs || 4000;

  const batchStart = Date.now();
  const RETURN = { path: null };

  try {
    // ---- Persistent cross-batch state --------------------------------------
    const S = (window.__qcrmPostScrape = window.__qcrmPostScrape || {
      posts: [],
      seenKeys: [],           // array (JSON-serialisable); Set rebuilt per batch
      rounds: 0,
      scanned: 0,
      reobserved: 0,
      lastCandidateCount: -1,
      // Unique cards seen at the end of the previous round. Stagnation is
      // measured against THIS, not the wrapper count, so a virtualised feed
      // that keeps adding placeholders cannot mask the end of the list.
      lastSeenCount: -1,
      stagnantRounds: 0,
      // Consecutive scrolls that produced no movement at all. Tracked
      // separately from stagnation: a failed scroll is a bug to retry, not
      // evidence that the feed ended.
      failedScrolls: 0,
      // NOTE: scrollerCache holds a DOM node, so it is deliberately NOT part of
      // the JSON-serialisable debug payload (see mkDebug).
      scrollerCache: null,
      firstPaintDone: false,
      done: false,
      stopReason: null,
      skipped: {
        like: 0, reaction: 0, follow: 0, comment: 0,
        reshareNoCommentary: 0, sponsored: 0, empty: 0, otherAuthor: 0,
        connection: 0, suggested: 0
      },
      startedAt: Date.now(),
      batches: 0
    });
    S.batches++;
    const seenKeys = new Set(S.seenKeys);


    // Already finished on an earlier batch — return the accumulated result.
    if (S.done) {
      RETURN.path = 'already-done';
      const result = { ok: true, done: true, posts: S.posts.slice(0, TARGET), debug: mkDebug() };
      console.log('[SCRAPER] returning (already done)', result);
      return result;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const lower = (t) => norm(t).toLowerCase();

    // Class-based selectors, newest LinkedIn layouts first. These are HINTS —
    // the current UI ships hashed class names, so a structural fallback runs
    // whenever none of these match (see collect()).
    const SELECTORS = [
      'div.feed-shared-update-v2',
      'li.profile-creator-shared-feed-update__container',
      'div.occludable-update',
      'div[data-urn*="activity"]',
      'div[data-id*="activity"]',
      '[data-view-name="feed-full-update"]',
      '[data-view-name*="update"]',
      '[data-testid="mainFeed"] [role="listitem"]',
      'main [role="listitem"]'
    ];

    /**
     * Structural fallback: find activity cards without any class name.
     *
     * An activity card is the container that owns a post permalink
     * (/feed/update/urn:li:activity:...) — that link is the one element every
     * card type has, on every layout. We walk up from each permalink to the
     * outermost ancestor that still holds exactly that one permalink, which is
     * the card boundary.
     */
    function collectStructural() {
      const main = document.querySelector('main') || document.body;
      if (!main) return [];
      const anchors = Array.from(
        main.querySelectorAll('a[href*="/feed/update/"], a[href*="activity-"], [data-urn*="activity"]')
      );
      const cards = [];
      const seen = new Set();
      for (const a of anchors) {
        let node = a;
        let best = null;
        // Climb while the subtree still represents a SINGLE post.
        for (let i = 0; i < 12 && node && node !== main; i++) {
          const permalinks = node.querySelectorAll
            ? node.querySelectorAll('a[href*="/feed/update/"], a[href*="activity-"]').length
            : 0;
          if (permalinks > 1) break;   // we have merged two cards — stop below this
          // A card must have real content, not just the link itself.
          if (node !== a && norm(node.textContent || '').length > 20) best = node;
          node = node.parentElement;
        }
        if (best && !seen.has(best) && !cards.some((c) => c.contains(best) || best.contains(c))) {
          seen.add(best);
          cards.push(best);
        }
      }
      return cards;
    };

    // ---- Candidate collection (document order = newest first) ------------
    // ---- Stable identity for de-duplication ------------------------------
    /**
     * Stable identity for an activity card.
     *
     * MUST resolve to the activity URN wherever one exists. The current SDUI
     * layout wraps a single post in several nested `div.occludable-update`
     * elements and stores the URN only inside `data-view-tracking-scope`
     * (a JSON blob). Without reading that, every wrapper fell through to the
     * `text::` fallback, produced near-identical keys, and the dedupe counted
     * hundreds of "re-observed" duplicates — the live logs showed
     * cards found=500 against re-observed=5994.
     */
    const URN_RE = /urn:li:(?:activity|ugcPost|share):\d+/i;

    function entryKey(el) {
      // 1 — explicit urn attributes on the element itself.
      for (const attr of ['data-urn', 'data-id', 'data-activity-urn']) {
        const v = el.getAttribute && el.getAttribute(attr);
        if (v && /activity|urn:li:/i.test(v)) {
          const m = v.match(URN_RE);
          return m ? m[0] : v;
        }
      }

      // 2 — SDUI tracking payload, on the element or the nearest ancestor that
      // carries one. This is where the current layout keeps the URN.
      let scopeHost = el;
      for (let i = 0; i < 4 && scopeHost; i++) {
        const scope = scopeHost.getAttribute && scopeHost.getAttribute('data-view-tracking-scope');
        if (scope) {
          const m = scope.match(URN_RE);
          if (m) return m[0];
        }
        scopeHost = scopeHost.parentElement;
      }

      // 3 — a descendant carrying the urn.
      const inner = el.querySelector('[data-urn*="activity"], [data-id*="activity"], [data-view-tracking-scope*="urn:li:activity"]');
      if (inner) {
        for (const attr of ['data-urn', 'data-id', 'data-view-tracking-scope']) {
          const v = inner.getAttribute(attr);
          if (v) {
            const m = v.match(URN_RE);
            if (m) return m[0];
            if (/activity|urn:li:/i.test(v)) return v;
          }
        }
      }

      // 4 — the post permalink.
      const link = el.querySelector('a[href*="/feed/update/"], a[href*="activity-"]');
      if (link && link.href) {
        const m = link.href.match(URN_RE);
        return m ? m[0] : link.href.split('?')[0];
      }

      return 'text::' + norm(el.textContent || '').slice(0, 200);
    }

    // ---- Candidate collection (document order = newest first) ------------
    function collect() {
      const seen = new Set();
      const els = [];
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(SELECTORS.join(', '))); } catch (e) { nodes = []; }
      for (const el of nodes) {
        let postEl = el;
        try { postEl = el.closest(SELECTORS.join(', ')) || el; } catch (e) { /* keep el */ }
        if (seen.has(postEl)) continue;
        if (els.some((prev) => prev.contains(postEl))) continue;
        seen.add(postEl);
        els.push(postEl);
      }
      // No class selector matched — LinkedIn changed its markup again. Fall
      // back to structure so the scrape still returns posts.
      if (!els.length) {
        try { return collectStructural(); } catch (e) { return []; }
      }

      // Collapse nested wrappers to ONE element per activity.
      //
      // The SDUI layout nests several `div.occludable-update` elements around a
      // single post, so the raw match list contained ~10x more entries than
      // there were posts (live logs: div.occludable-update=455 vs
      // feed-full-update=5). Keeping the OUTERMOST element per URN gives the
      // classifier a complete card — an inner wrapper can miss the actor block
      // or the social counts and then be rejected as "empty".
      const byKey = new Map();
      const keyless = [];
      for (const el of els) {
        let k = '';
        try { k = entryKey(el); } catch (e) { k = ''; }
        if (!k || k.indexOf('text::') === 0) { keyless.push(el); continue; }
        const prev = byKey.get(k);
        // Prefer the outermost element carrying this URN.
        if (!prev || (prev !== el && el.contains(prev))) byKey.set(k, el);
      }
      const merged = Array.from(byKey.values());
      // Keyless elements are kept only when they are not inside a kept card.
      for (const el of keyless) {
        if (!merged.some((m) => m.contains(el) || el.contains(m))) merged.push(el);
      }

      // Drop virtualiser placeholders before they reach the classifier.
      //
      // LinkedIn emits empty `occludable-update-hint` shells (and comment-only
      // stubs) as scroll spacers. They carry no URN and no content, so every
      // batch re-rejected the same one as "empty" — visible in the live logs as
      // a permanent `empty=1`. They are not cards and must not be scanned.
      const real = merged.filter((el) => {
        try {
          const cls = (el.className || '').toString();
          if (/occludable-update-hint/.test(cls)) return false;
          // No text and no media at all → a spacer, not a post.
          if (norm(el.textContent || '').length === 0 && !el.querySelector('img, video, iframe')) {
            return false;
          }
          return true;
        } catch (e) { return true; }
      });

      return real.length ? real : (merged.length ? merged : els);
    };

    // Per-selector candidate counts, so a zero-candidate batch names the
    // selector that failed instead of just reporting "0".
    function selectorCensus() {
      const out = {};
      SELECTORS.forEach((sel) => {
        try { out[sel] = document.querySelectorAll(sel).length; } catch (e) { out[sel] = 'ERR'; }
      });
      return out;
    };

    /**
     * When no candidate matches any known selector, describe what IS in <main>
     * so the next selector can be written from evidence rather than guesswork.
     */
    function dumpUnmatchedContainers() {
      const main = document.querySelector('main') || document.body;
      if (!main) return [];
      const rows = [];
      // Any element that plausibly wraps a post: carries an activity urn, a
      // permalink, or a social-counts bar.
      const probes = [
        '[data-urn]', '[data-id]', '[data-view-name]', '[role="listitem"]',
        'a[href*="/feed/update/"]', '.social-details-social-counts', 'article',
      ];
      probes.forEach((sel) => {
        let nodes = [];
        try { nodes = Array.from(main.querySelectorAll(sel)).slice(0, 5); } catch (e) { return; }
        nodes.forEach((n) => {
          rows.push({
            probe: sel,
            tag: n.tagName.toLowerCase(),
            cls: (n.className || '').toString().slice(0, 80),
            urn: n.getAttribute('data-urn') || n.getAttribute('data-id') || '',
            viewName: n.getAttribute('data-view-name') || '',
            html: (n.outerHTML || '').slice(0, 500),
          });
        });
      });
      return rows;
    };

    const mkDebug = (extra) => Object.assign({
      url: window.location.href,
      ownerName: ownerName || '(unknown)',
      batches: S.batches,
      rounds: S.rounds,
      scanned: S.scanned,
      authored: S.posts.length,
      reobserved: S.reobserved,
      skipped: S.skipped,
      stopReason: S.stopReason,
      firstPaintDone: S.firstPaintDone,
      totalElapsedMs: Date.now() - S.startedAt,
      batchElapsedMs: Date.now() - batchStart,
      returnPath: RETURN.path,
      // ── Candidate diagnostics (surfaced in the PANEL console) ──
      candidateCount: (function () { try { return collect().length; } catch (e) { return -1; } })(),
      selectorCensus: selectorCensus(),
      // Only populated when nothing matched — it is expensive and noisy.
      unmatchedContainers: (function () {
        try { return collect().length === 0 ? dumpUnmatchedContainers() : []; } catch (e) { return []; }
      })(),
      // Per-scroll diagnostics. Written by scrollForMore(), which runs in the
      // background tab where console output is unreachable — so it must travel
      // in the payload to be seen at all.
      scrollLog: (S.scrollLog || []).slice(-12),
      // Every element whose scrollTop provably moved when written, deepest
      // first. If the scroll is not advancing the feed, this names the
      // candidates that DO scroll so the right one can be identified.
      // Full ancestor chain of the first feed card, with geometry, overflow and
      // the empirical "did scrolling this load more cards" verdict.
      ancestorProbe: (S.ancestorProbe || []).slice(0, 30),
      scrollerVerified: !!S.scrollerVerified,
      feedCardCount: feedCardCount(),
      // Phase timings, so the slow step is identifiable without guesswork.
      timing: S.timing || { collectMs: 0, classifyMs: 0, scrollMs: 0 },
      // outerHTML of the first rejected cards, for offline inspection.
      rejectedSamples: (S.audit || [])
        .filter((r) => r.decision === 'REJECTED')
        .slice(0, 5)
        .map((r) => ({ i: r.i, reason: r.reason, author: r.author, html: r.html || '(not captured)' })),
    }, extra || {});

    // ---- Owner-name matching --------------------------------------------
    const canon = (t) => lower(t).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const ownerCanon = canon(ownerName || '');
    const ownerFirst = ownerCanon.split(' ')[0] || '';

    const HEADER_SELECTORS = [
      '.update-components-header',
      '.update-components-header__text-view',
      '.feed-shared-header',
      '.update-components-actor__sub-description-link'
    ];

    const readHeader = (el) => {
      for (const sel of HEADER_SELECTORS) {
        const h = el.querySelector(sel);
        if (h) {
          const t = norm(h.textContent || '');
          if (t) return t;
        }
      }
      // Structural fallback for hashed-class layouts.
      //
      // Matches the ACTIVITY-HEADER GRAMMAR only: "<verb> this", "commented on",
      // "follows <something>". Bare verbs are excluded because every card
      // renders Follow/Like/Comment BUTTONS whose labels sit in this same text
      // range — matching those made the classifier reject a profile's own posts
      // as follow/like activity.
      // Note: no trailing \b or context after the verb phrase. LinkedIn emits
      // adjacent elements without whitespace, so textContent can read
      // "likes thisSomeone Else" — a trailing word-boundary requirement failed
      // to match there and let a "likes this" card through as an authored post.
      const head = norm(el.textContent || '').slice(0, 200);
      const m = head.match(
        /^(.{0,80}?(?:reposted\s+this|reposted|likes\s+this|liked\s+this|reacted\s+to\s+this|commented\s+on|celebrates\s+this|celebrated\s+this|loves\s+this|supports\s+this|follows\s+\S+|is\s+following\s+\S+))/i
      );
      return m ? norm(m[1]) : '';
    };

    const readCommentary = (el) => {
      const nested = el.querySelector(
        '.feed-shared-update-v2__update-content-wrapper, .update-components-mini-update-v2, .feed-shared-mini-update-v2, .update-components-linkedin-video, .feed-shared-reshared-update'
      );
      const TEXT_SELECTORS = [
        '.update-components-text',
        '.feed-shared-update-v2__description',
        '.feed-shared-inline-show-more-text',
        '.update-components-update-v2__commentary'
      ];
      let best = '';
      for (const sel of TEXT_SELECTORS) {
        const nodes = el.querySelectorAll(sel);
        for (const n of nodes) {
          if (nested && nested.contains(n)) continue;
          const t = norm(n.innerText || n.textContent || '');
          if (t.length > best.length) best = t;
        }
        if (best.length > 20) break;
      }

      // Structural fallback for hashed-class layouts. Find the deepest
      // elements that hold substantive text and are not chrome (actor name,
      // engagement counts, buttons, timestamps), then take the longest.
      if (best.length <= 20) {
        const CHROME_RE =
          /^(like|comment|repost|send|share|follow|following|connect|message|more|see more|show more|\d[\d,.\s]*(likes?|comments?|reposts?|reactions?)?)$/i;
        let candidates = [];
        try { candidates = Array.from(el.querySelectorAll('span, p, div')); } catch (e) { candidates = []; }
        for (const n of candidates) {
          if (nested && nested.contains(n)) continue;
          // Deepest-only: skip wrappers that contain another candidate, so we
          // do not concatenate the whole card into one blob.
          if (n.querySelector && n.querySelector('span, p, div')) continue;
          if (n.closest && n.closest('button, a[role="button"], time')) continue;
          const t = norm(n.innerText || n.textContent || '');
          if (t.length < 20 || CHROME_RE.test(t)) continue;
          if (t.length > best.length) best = t;
        }
      }

      return best
        .replace(/\s*…\s*$/, '')
        .replace(/\s*(see|show) more\s*$/i, '')
        .trim();
    };

    /**
     * The actor (author) named on a card. Class-based first, then structural:
     * on hashed-class layouts the actor is the text of the first /in/ profile
     * link, or the first substantive line of the card.
     */
    const readActor = (el) => {
      const cls = el.querySelector(
        '.update-components-actor__title, .update-components-actor__name, .feed-shared-actor__name'
      );
      const fromCls = norm(cls ? (cls.innerText || cls.textContent) : '');
      if (fromCls) return fromCls.split('\n')[0];
      const link = el.querySelector('a[href*="/in/"]');
      const fromLink = norm(link ? (link.innerText || link.textContent) : '');
      if (fromLink) return fromLink.split('\n')[0];
      // First line of the card, minus a trailing "reposted this" style suffix.
      const first = norm(el.textContent || '').slice(0, 120);
      const m = first.match(/^(.{1,60}?)(?:\s+(?:reposted|likes|liked|commented|shared)\b|$)/i);
      return m ? norm(m[1]) : '';
    };

    /**
     * True only for a genuine promoted/sponsored ad card.
     *
     * Requires BOTH:
     *   1. a short, standalone label element whose ENTIRE text is
     *      "Promoted" / "Sponsored" (LinkedIn renders the ad marker in its own
     *      node — a post that merely mentions the word has it inside a long
     *      paragraph, which fails the length test), and
     *   2. no member-activity permalink on the card.
     *
     * Requirement 2 is the decisive one: every real member post links to
     * /feed/update/urn:li:activity:..., and ads do not. So even if a stray
     * label matches, an owner post is still kept.
     */
    const isSponsoredCard = (el) => {
      // A standalone ad label is the primary signal. LinkedIn renders the
      // marker in its own node, so a post that merely mentions the word has it
      // inside a long paragraph and fails the length test.
      const isAdLabel = (t) => t.length <= 30 && /^(promoted|sponsored)\b/i.test(t);

      let hasAdLabel = false;
      try {
        // (a) a standalone label element.
        hasAdLabel = Array.from(el.querySelectorAll('span, div, p, small')).some((n) => {
          // Deepest nodes only, so a wrapper's concatenated text cannot match.
          if (n.querySelector && n.querySelector('span, div, p, small')) return false;
          return isAdLabel(norm(n.textContent || ''));
        });

        // (b) a bare text node directly on the card. LinkedIn also renders the
        // marker as loose text ahead of the actor block, where no element
        // wraps it — so a querySelectorAll scan alone misses it.
        if (!hasAdLabel) {
          hasAdLabel = Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && isAdLabel(norm(n.textContent || '')),
          );
        }
      } catch (e) { return false; }
      if (!hasAdLabel) return false;

      // The label alone is not conclusive: LinkedIn nests "Promoted"
      // recommendation modules inside genuine member cards. A real post is
      // distinguished by having its OWN permalink outside any such ad module,
      // so only treat the card as an ad when the label is not confined to a
      // nested advert slot.
      const adSlot = el.querySelector(
        'aside, [class*="ad-banner"], [class*="adSlot"], [class*="ad-slot"], [data-ad-banner]'
      );
      if (adSlot) {
        // The label lives inside a nested ad module — the surrounding card is
        // still the member's post.
        const labelInSlot = Array.from(adSlot.querySelectorAll('span, div, p, small')).some((n) => {
          const t = norm(n.textContent || '');
          return t.length <= 30 && /^(promoted|sponsored)\b/i.test(t);
        });
        if (labelInSlot) return false;
      }

      return true;
    };

    const classify = (el) => {
      const whole = norm(el.textContent || '');
      if (!whole) return { authored: false, skip: 'empty' };

      // Sponsored detection is STRUCTURAL, not a text search.
      //
      // The previous rule tested /promoted|sponsored/ against the first 400
      // characters of textContent. That window spans the actor block, the
      // headline, the timestamp AND the start of the post body, so it rejected
      // the owner's own posts whenever those words appeared in their copy — or
      // whenever LinkedIn nested a "Promoted" recommendation module inside the
      // card wrapper. On the live page this rejected 5 of 6 scanned cards, all
      // authored by the profile owner.
      //
      // A genuine ad marks itself in a dedicated label element that sits in the
      // card's header, and it never carries a member activity permalink. Both
      // signals must agree before we discard the card.
      if (isSponsoredCard(el)) {
        return { authored: false, skip: 'sponsored' };
      }

      const header = readHeader(el);
      const h = lower(header);

      // Activity-header rules.
      //
      // These MUST match the header's grammar, not bare keywords. Every card
      // renders a "Follow" BUTTON in its header area, and a bare /\bfollows?\b/
      // test matched that button — rejecting four of Phil Spencer's own posts as
      // "follow activity". A real activity header always reads
      // "<name> <verb> this" or "<verb> a post", so the verb must be followed by
      // "this"/"a post"/"on this" to count.
      if (h) {
        // No trailing \b on these: adjacent elements render without whitespace,
        // so the header text can read "likes thisSomeone Else".
        if (/\b(likes|liked|reacted\s+to)\s+this/.test(h) && !/\breposted\b/.test(h)) {
          return { authored: false, skip: 'like' };
        }
        if (/\b(celebrates|celebrated|loves|supports)\s+this|\bfinds\s+this\s+insightful/.test(h)) {
          return { authored: false, skip: 'reaction' };
        }
        // "follows X" / "is following X" — never the standalone Follow button.
        if (/\b(follows|followed|is\s+following)\s+\S/.test(h) && !/\breposted\b/.test(h)) {
          return { authored: false, skip: 'follow' };
        }
        if (/\bcommented\s+on/.test(h)) return { authored: false, skip: 'comment' };
        // Connection / network activity and LinkedIn's own suggested content —
        // not posts, so they never belong in the payload.
        if (/\b(is now connected|connected with|joined linkedin|is celebrating|new connection)\b/.test(h)) {
          return { authored: false, skip: 'connection' };
        }
        if (/\b(suggested|recommended for you|people you may know|promoted by)\b/.test(h)) {
          return { authored: false, skip: 'suggested' };
        }
      }

      const commentary = readCommentary(el);

      const isRepost = /\breposted\b/.test(h) ||
        // Text signal, for hashed-class layouts where the header element and
        // the inner-card class are both unrecognisable.
        /\breposted this\b/i.test(norm(el.textContent || '').slice(0, 160)) ||
        !!el.querySelector('.update-components-mini-update-v2, .feed-shared-mini-update-v2, .feed-shared-reshared-update');

      // Reposts are KEPT, with or without the owner's own commentary. A bare
      // reshare is still a real activity item on the Posts tab, and dropping
      // it under-reports what the prospect actually shares.
      if (isRepost) {
        return { authored: true, text: commentary || '', isRepost: true };
      }

      // NOTE: there is deliberately NO author filter here.
      //
      // This scraper returns every valid POST CARD on the Activity feed, not
      // only the ones the profile owner authored. Shared and reposted content
      // legitimately carries another person's name as the actor, and the old
      // `otherAuthor` rejection discarded exactly those cards. Cards that are
      // not posts at all (likes, reactions, follows, comments on others'
      // posts, sponsored) are already rejected by the header rules above,
      // which is the correct place for that distinction.

      // A card qualifies as a post when it has text, media, or an article/link
      // preview. Only a card with none of those is an empty placeholder.
      if (!commentary || commentary.length <= 10) {
        if (hasMediaContent(el) || hasArticleContent(el)) {
          return { authored: true, text: commentary || '', isRepost: false };
        }
        return { authored: false, skip: 'empty' };
      }

      return { authored: true, text: commentary, isRepost };
    };

    /**
     * An article / external-link share. Its "content" is the link preview
     * rather than body text or an inline image, so it needs its own check —
     * otherwise a caption-less article share looks like an empty card.
     */
    const hasArticleContent = (el) => {
      if (el.querySelector(
        '.update-components-article, .feed-shared-article, ' +
        '.update-components-entity, .feed-shared-external-video, ' +
        '[class*="article"], [data-test-app-aware-link]'
      )) return true;
      // Structural: an outbound link (not a LinkedIn profile/company/permalink)
      // accompanied by a preview title.
      try {
        return Array.from(el.querySelectorAll('a[href]')).some((a) => {
          const href = a.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(href)) return false;
          if (/linkedin\.com\/(in|company|feed|posts)\//i.test(href)) return false;
          return norm(a.textContent || '').length > 10;
        });
      } catch (e) { return false; }
    };

    // True when the card carries non-text content, so a caption-less post is
    // not mistaken for an empty card.
    const hasMediaContent = (el) => {
      return !!el.querySelector(
        '.update-components-image img, .feed-shared-image img, img[data-delayed-url], ' +
        'video, .update-components-linkedin-video, .feed-shared-linkedin-video, ' +
        '.update-components-document, .feed-shared-document, [data-test-document-entity], ' +
        '.update-components-poll, .feed-shared-poll, ' +
        '.update-components-article, .feed-shared-article, ' +
        '.update-components-celebration, .feed-shared-celebration'
      ) || (function () {
        // Structural fallback: a content image/video/embed that is neither an
        // actor avatar nor a tracking pixel/icon.
        try {
          return Array.from(el.querySelectorAll('img, video, iframe')).some((n) => {
            if (n.tagName !== 'IMG') return true;
            if (n.closest('a[href*="/in/"]')) return false; // actor avatar
            const w = n.width || parseInt(n.getAttribute('width') || '0', 10);
            const h2 = n.height || parseInt(n.getAttribute('height') || '0', 10);
            if (w && h2 && (w < 60 || h2 < 60)) return false; // icon / pixel
            return true;
          });
        } catch (e) { return false; }
      })();
    };

    // The inner card of a repost — the original post being shared. Null for
    // original authored posts.
    const innerCard = (el) => {
      const cls = el.querySelector(
        '.update-components-mini-update-v2, .feed-shared-mini-update-v2, .feed-shared-reshared-update'
      );
      if (cls) return cls;

      // Structural fallback for hashed-class layouts: the shared post is a
      // descendant block that names a DIFFERENT person than the card's own
      // actor. Take the outermost such block.
      const outerActor = norm(readActor(el)).toLowerCase();
      let best = null;
      let nodes = [];
      try { nodes = Array.from(el.querySelectorAll('div, section, article')); } catch (e) { return null; }
      for (const n of nodes) {
        const link = n.querySelector && n.querySelector('a[href*="/in/"]');
        if (!link) continue;
        const who = norm(link.innerText || link.textContent).toLowerCase();
        if (!who || (outerActor && who === outerActor)) continue;
        // Must be a real content block, not just the name link itself.
        if (norm(n.textContent || '').length < 20) continue;
        if (!best || best.contains(n)) best = n;   // prefer the outermost
      }
      return best;
    };

    // Every media URL on the card: images, video posters/sources, and document
    // previews. De-duplicated, and blob:/data: placeholders are dropped.
    const collectMediaUrls = (el) => {
      const urls = [];
      const push = (u) => {
        if (!u) return;
        const s = String(u).trim();
        if (!s || /^(blob:|data:)/i.test(s)) return;
        if (!urls.includes(s)) urls.push(s);
      };

      el.querySelectorAll(
        '.update-components-image img, .feed-shared-image img, img[data-delayed-url], ' +
        '.update-components-article img, .feed-shared-article img, ' +
        '.update-components-document img, .feed-shared-document img'
      ).forEach((img) => push(img.src || img.getAttribute('data-delayed-url')));

      // Structural fallback for hashed-class layouts: any content image that
      // is neither the actor avatar nor an icon/tracking pixel. Runs whenever
      // the class-based pass found no images (video/document URLs are
      // collected separately below and must not suppress this).
      const hadClassImages = urls.length > 0;
      if (!hadClassImages) {
        el.querySelectorAll('img').forEach((img) => {
          if (img.closest('a[href*="/in/"]')) return;   // actor avatar
          const w = img.width || parseInt(img.getAttribute('width') || '0', 10);
          const h = img.height || parseInt(img.getAttribute('height') || '0', 10);
          if (w && h && (w < 60 || h < 60)) return;     // icon / pixel
          push(img.src || img.getAttribute('data-delayed-url'));
        });
      }

      el.querySelectorAll('video').forEach((v) => {
        push(v.getAttribute('poster'));
        push(v.currentSrc || v.src);
        v.querySelectorAll('source').forEach((s) => push(s.src || s.getAttribute('src')));
      });

      // LinkedIn stores the playable stream on a data attribute for lazy video.
      el.querySelectorAll('[data-sources], [data-video-url]').forEach((n) => {
        push(n.getAttribute('data-video-url'));
        const raw = n.getAttribute('data-sources');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            (Array.isArray(parsed) ? parsed : []).forEach((s) => push(s && s.src));
          } catch (e) { /* not JSON — ignore */ }
        }
      });

      el.querySelectorAll('a[href*="/document/"], iframe[src]').forEach((n) =>
        push(n.getAttribute('href') || n.getAttribute('src'))
      );

      return urls;
    };

    /** Media kind, for downstream consumers that care about the shape. */
    const detectMediaType = (el) => {
      if (el.querySelector('.update-components-poll, .feed-shared-poll')) return 'poll';
      if (el.querySelector('video, .update-components-linkedin-video, .feed-shared-linkedin-video')) return 'video';
      if (el.querySelector('.update-components-document, .feed-shared-document, [data-test-document-entity]')) return 'document';
      if (el.querySelector('.update-components-image img, .feed-shared-image img, img[data-delayed-url]')) return 'image';
      if (el.querySelector('.update-components-article, .feed-shared-article')) return 'article';
      return 'text';
    };

    const buildPost = (el, text, isRepost) => {
      const inner = isRepost ? innerCard(el) : null;
      // Prefer the inner card for a repost's media/time — the outer wrapper is
      // the owner's commentary, the inner one is the shared content.
      const mediaScope = inner || el;

      const timeEl = el.querySelector('time[datetime]');
      const relEl = el.querySelector('.update-components-actor__sub-description span[aria-hidden="true"], .update-components-actor__sub-description');
      const linkEl = el.querySelector('a[href*="/feed/update/"], a[href*="activity-"]');

      // Engagement counts belong to the OUTER card (the owner's share), which
      // is what LinkedIn displays and what reflects their reach.
      const reactionEl = el.querySelector('.social-details-social-counts__reactions-count, button[aria-label*="reaction"]');
      const commentEl = el.querySelector('.social-details-social-counts__comments, button[aria-label*="comment"]');
      const repostEl = el.querySelector(
        'button[aria-label*="repost"], a[aria-label*="repost"], ' +
        '.social-details-social-counts__item--right-aligned'
      );
      const num = (n) => {
        if (!n) return 0;
        const v = parseInt(norm(n.getAttribute('aria-label') || n.textContent).replace(/[^\d]/g, ''), 10);
        return isNaN(v) ? 0 : v;
      };

      /**
       * Structural fallback for engagement counts on hashed-class layouts.
       * Scans the card's short leaf nodes for "<n> comments" / "<n> reposts";
       * a bare number is the reactions tally, which is how LinkedIn renders it.
       * Handles "1.2K"/"3M" shorthand.
       */
      const countFromText = (kind) => {
        let nodes = [];
        try { nodes = Array.from(el.querySelectorAll('span, button, a')); } catch (e) { return 0; }
        const re = kind === 'reactions'
          ? /^([\d,.]+[KkMm]?)$/
          : new RegExp('([\\d,.]+[KkMm]?)\\s*' + kind.replace(/s$/, ''), 'i');
        for (const n of nodes) {
          if (n.querySelector && n.querySelector('span, button, a')) continue; // deepest only
          const t = norm(n.getAttribute('aria-label') || n.innerText || n.textContent);
          if (!t || t.length > 30) continue;
          const m = t.match(re);
          if (!m) continue;
          const raw = m[1].replace(/,/g, '');
          let v = parseFloat(raw);
          if (isNaN(v)) continue;
          if (/k$/i.test(raw)) v *= 1000;
          if (/m$/i.test(raw)) v *= 1000000;
          return Math.round(v);
        }
        return 0;
      };

      const reactionCount = num(reactionEl) || countFromText('reactions');
      const commentCount = num(commentEl) || countFromText('comments');
      const repostCount = num(repostEl) || countFromText('reposts');

      // For a repost, the original author is the actor named on the INNER
      // card; for an original post it is the profile owner.
      // readActor falls back to structure, so this works on hashed-class
      // layouts where the actor element has no recognisable class.
      const originalAuthor = readActor(inner || el) || (isRepost ? '' : ownerName || '');

      const mediaUrls = collectMediaUrls(mediaScope);
      const imgEl = mediaScope.querySelector(
        '.update-components-image img, .feed-shared-image img, img[data-delayed-url]'
      );

      return {
        // ── Requested schema ──
        type: isRepost ? 'repost' : 'post',
        originalAuthor,
        postText: text || '',
        mediaUrls,
        postUrl: linkEl && linkEl.href ? linkEl.href.split('?')[0] : '',
        publishedAt: timeEl ? timeEl.getAttribute('datetime') : null,
        reactionCount,
        commentCount,
        repostCount,

        // ── Retained for backward compatibility ──
        // The panel form, the preview renderer and the stored prospect JSON
        // read these; removing them would silently blank existing UI.
        text: text || '',
        date: timeEl ? timeEl.getAttribute('datetime') : null,
        relativeTime: relEl ? ((norm(relEl.textContent).split('•')[0] || '').trim() || null) : null,
        engagement: { reactions: reactionCount, comments: commentCount },
        hasImage: !!imgEl,
        imageUrl: imgEl ? (imgEl.src || imgEl.getAttribute('data-delayed-url') || '') : undefined,
        imageAlt: imgEl ? (imgEl.alt || '') : undefined,
        mediaType: detectMediaType(mediaScope)
      };
    };

    const finish = (reason) => {
      S.done = true;
      S.stopReason = reason;
    };

    // ---- First paint (only on the first batch) ---------------------------
    const EMPTY_RE = /(hasn'?t posted( lately| yet)?|has not posted|no posts yet|nothing to see here)/i;
    if (!S.firstPaintDone) {
      const readyStart = Date.now();
      while (Date.now() - readyStart < 3000) {
        if (collect().length > 0) break;
        if (EMPTY_RE.test(norm(document.body ? document.body.textContent : ''))) {
          finish('activity feed shows an explicit empty state (no public posts)');
          break;
        }
        await sleep(300);
      }
      S.firstPaintDone = true;
      console.log(`[SCRAPER] first paint — candidates=${collect().length}`);
    }

    /**
     * Advance the feed so LinkedIn renders more cards.
     *
     * `window.scrollTo` alone is not enough: the Activity feed is virtualised
     * and, depending on layout, the scrolling element is documentElement, body,
     * or an inner overflow container. The live logs proved nothing new loaded —
     * `feed-full-update` stayed at 5 for 15 consecutive batches while wrapper
     * placeholders multiplied.
     *
     * So we drive every plausible scroller, then anchor-scroll the LAST real
     * card into view (which is what actually triggers the virtualiser), and
     * finally click any "Show more results" button.
     */
    /**
     * Raw wrapper count, including virtualiser placeholders. Used ONLY as a
     * "did the page respond at all" signal — never to decide how many cards
     * exist, which is what the earlier wrapper-count bug did.
     */
    function totalWrapperCount() {
      try { return document.querySelectorAll(SELECTORS.join(', ')).length; } catch (e) { return 0; }
    }

    /**
     * LinkedIn's "Show more results" pagination button.
     *
     * The Activity feed is a `scaffold-finite-scroll--infinite` component (seen
     * at depth 5 of the live ancestor probe). On this page NOTHING scrolls —
     * every ancestor reported clientHeight === scrollHeight — so this button is
     * the ONLY way to load more cards.
     *
     * Matched by the scaffold's own class first (stable across label changes and
     * locales), then by button text, then by any button inside the scaffold
     * container. Disabled/hidden buttons are rejected.
     */
    function findLoadMoreButton() {
      const usable = (b) => {
        if (!b || b.disabled) return false;
        if (b.getAttribute('aria-disabled') === 'true') return false;
        try {
          const s = window.getComputedStyle(b);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
        } catch (e) { /* keep */ }
        return true;
      };

      // 1 — the scaffold's own load button.
      let b = document.querySelector(
        '.scaffold-finite-scroll__load-button, button.scaffold-finite-scroll__load-button'
      );
      if (usable(b)) return b;

      // 2 — by visible label (covers layouts without the scaffold class).
      const byText = Array.from(document.querySelectorAll('button')).find((n) => {
        const t = norm(n.innerText || n.textContent || '');
        return /^(show more results|show more|load more|see more results|see more)$/i.test(t) && usable(n);
      });
      if (byText) return byText;

      // 3 — any button inside the finite-scroll container that is not a post
      //     action (like/comment/repost/send live on the cards themselves).
      const scaffold = document.querySelector('.scaffold-finite-scroll, [class*="scaffold-finite-scroll"]');
      if (scaffold) {
        const inScaffold = Array.from(scaffold.querySelectorAll('button')).find((n) => {
          if (!usable(n)) return false;
          if (n.closest('[data-view-name="feed-full-update"], div.feed-shared-update-v2')) return false;
          const t = norm(n.innerText || n.textContent || '');
          return /more|load/i.test(t);
        });
        if (inScaffold) return inScaffold;
      }
      return null;
    }

    /**
     * Wait until new activity cards are inserted, or `timeoutMs` elapses.
     *
     * MutationObserver-driven: resolves the instant LinkedIn appends a card,
     * instead of sleeping a fixed interval and re-querying. Replaces the
     * 250ms-poll loops that made each scroll round cost up to 6.5s even when
     * the DOM had already settled.
     *
     * Resolves with the number of new URNs (0 on timeout).
     */
    function waitForNewCards(baselineUrns, timeoutMs) {
      return new Promise((resolve) => {
        let done = false;
        let observer = null;
        let timer = null;

        const finishWait = (n) => {
          if (done) return;
          done = true;
          try { if (observer) observer.disconnect(); } catch (e) { /* ignore */ }
          if (timer) clearTimeout(timer);
          resolve(n);
        };

        const check = () => {
          // Cheap guard first: only recompute URNs when the card count changed.
          const now = renderedUrns();
          let fresh = 0;
          now.forEach((u) => { if (!baselineUrns.has(u)) fresh++; });
          if (fresh > 0) finishWait(fresh);
        };

        try {
          observer = new MutationObserver((muts) => {
            // Only react to actual element insertions.
            for (const m of muts) {
              if (m.addedNodes && m.addedNodes.length) { check(); return; }
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) { observer = null; }

        timer = setTimeout(() => finishWait(0), timeoutMs);
        check();   // maybe they are already there
      });
    }

    /** Every URN currently rendered — the only reliable "new cards" measure. */
    function renderedUrns() {
      const out = new Set();
      try {
        collect().forEach((el) => {
          const k = entryKey(el);
          if (k && k.indexOf('text::') !== 0) out.add(k);
        });
      } catch (e) { /* best effort */ }
      return out;
    }

    /**
     * Identify the element that ACTUALLY scrolls, once, and remember it.
     *
     * Checked against real geometry (scrollHeight > clientHeight) rather than
     * assumed, because the live page proved `window.scrollTo` is inert here.
     */
    /**
     * Find the container that ACTUALLY loads more feed cards.
     *
     * Selection is by outcome, not by attributes. The document element scrolls
     * fine — scrollTop, scrollHeight and mutations all changed on the live page
     * — yet the feed-card count never moved, proving attribute-based selection
     * is insufficient. So each candidate is scrolled and KEPT ONLY IF the
     * feed-card count grows.
     *
     * Ancestors of a real card are tried first (deepest first, since a
     * virtualiser listens on its own viewport), and the document scroller is
     * tried last as a fallback rather than first.
     */
    async function findScrollContainer() {
      if (S.scrollerCache && document.contains(S.scrollerCache)) return S.scrollerCache;

      const ancestors = probeCardAncestors();
      // Report the full ancestor chain — this is the evidence for which element
      // owns the feed scroll.
      S.ancestorProbe = ancestors.map((r) => ({
        depth: r.depth, path: r.path, tag: r.tag, cls: r.cls, overflowY: r.overflowY,
        clientHeight: r.clientHeight, scrollHeight: r.scrollHeight, scrollTop: r.scrollTop,
        scrollable: r.scrollable, canSetScrollTop: r.canSetScrollTop,
        loadsMoreCards: null,   // filled in below for the ones we test
      }));

      // Candidates: scrollable ancestors that accept a scrollTop write, deepest
      // first. Document-level scrollers are appended last.
      const candidates = ancestors
        .filter((r) => r.scrollable && r.canSetScrollTop && r.tag !== 'html' && r.tag !== 'body')
        .map((r) => r.node);
      [document.scrollingElement, document.documentElement, document.body].forEach((n) => {
        if (n && !candidates.includes(n)) candidates.push(n);
      });

      // A load-more button is the dominant pagination mechanism on this feed
      // (proved by the live ancestor probe: nothing scrolls). When one exists,
      // skip the whole outcome-testing loop — it costs seconds per candidate
      // and cannot help.
      if (findLoadMoreButton()) {
        S.scrollerVerified = false;
        S.scrollerCache = candidates[0] || document.scrollingElement || document.documentElement;
        return S.scrollerCache;
      }

      // Decide by OUTCOME: does scrolling this element render another card?
      // Each candidate is tested ONCE, with an observer-bounded wait, and the
      // verdict is cached on S.scrollTested so later rounds never retest.
      S.scrollTested = S.scrollTested || {};
      for (let i = 0; i < candidates.length; i++) {
        const n = candidates[i];
        const path = nodePath(n);
        if (S.scrollTested[path]) continue;      // already ruled out
        const baseline = renderedUrns();
        try {
          const orig = n.scrollTop;
          n.scrollTop = n.scrollHeight;
          const grew = (await waitForNewCards(baseline, 1200)) > 0;
          S.scrollTested[path] = true;
          const idx = S.ancestorProbe.findIndex((r) => r.path === path);
          if (idx >= 0) S.ancestorProbe[idx].loadsMoreCards = grew;
          if (grew) {
            S.scrollerCache = n;
            S.scrollerVerified = true;
            return n;
          }
          n.scrollTop = orig;   // restore before trying the next candidate
        } catch (e) { S.scrollTested[path] = true; }
      }

      // Nothing proved itself. Fall back to the deepest scrollable ancestor so
      // the scrape still makes an attempt, and flag it as unverified so the
      // diagnostics say so plainly.
      S.scrollerVerified = false;
      S.scrollerCache = candidates[0] || document.scrollingElement || document.documentElement;
      return S.scrollerCache;
    }

    /**
     * Advance the virtualised feed and REPORT WHAT HAPPENED.
     *
     * Returns { moved, newCards, ... }. `moved` means the scroll position or
     * scrollHeight actually changed — the caller uses that to distinguish
     * "the feed ended" from "the scroll did nothing", which the previous
     * version conflated and which caused a premature end-of-feed at 5 cards.
     */
    async function scrollForMore() {
      const scroller = await findScrollContainer();
      const beforeUrns = renderedUrns();
      const beforeH = scroller ? scroller.scrollHeight : 0;
      const beforeTop = scroller ? scroller.scrollTop : 0;
      const beforeCards = collect().length;
      const wrappersBefore = totalWrapperCount();
      const feedBefore = feedCardCount();

      // Observe real DOM insertions, so "did the page respond?" is answered by
      // evidence rather than inference.
      let mutationCount = 0;
      let observer = null;
      try {
        observer = new MutationObserver((muts) => {
          muts.forEach((m) => { mutationCount += (m.addedNodes ? m.addedNodes.length : 0); });
        });
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) { observer = null; }

      // 1 — drive the identified container, plus the window as a belt-and-braces.
      try {
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        window.scrollTo(0, document.body ? document.body.scrollHeight : 1e6);
      } catch (e) { /* non-fatal */ }

      // 2 — anchor scroll: a virtualiser reacts to the LAST card entering view
      // far more reliably than to a raw scrollTop write.
      try {
        const cards = collect();
        const last = cards[cards.length - 1];
        if (last && typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'end' });
      } catch (e) { /* non-fatal */ }

      // 3 — wait for NEW CARDS via MutationObserver. Resolves the moment a card
      // is appended rather than sleeping a fixed window, which is what made
      // every round cost seconds even when the DOM had already settled.
      let afterUrns = beforeUrns;
      if (await waitForNewCards(beforeUrns, 1500)) {
        afterUrns = renderedUrns();
      }

      // 4 — the LOAD-MORE BUTTON: LinkedIn's primary pagination mechanism here.
      //
      // The live ancestor probe proved NO element on this page scrolls
      // (clientHeight === scrollHeight at every depth, and body's scrollTop
      // could not be set). The feed is a `scaffold-finite-scroll--infinite`
      // component, which paginates by clicking its own load button — not by
      // scrolling. So this is tried on every round, not just as an afterthought
      // once scrolling failed.
      let clickedMore = false;
      try {
        const btn = findLoadMoreButton();
        if (btn) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          clickedMore = true;
          // Observer-driven: returns as soon as the fetched page renders.
          if (await waitForNewCards(beforeUrns, 3000)) {
            afterUrns = renderedUrns();
          }
        }
      } catch (e) { /* non-fatal */ }

      try { if (observer) observer.disconnect(); } catch (e) { /* non-fatal */ }

      const afterH = scroller ? scroller.scrollHeight : 0;
      const afterTop = scroller ? scroller.scrollTop : 0;
      const afterCards = collect().length;
      const newUrns = [...afterUrns].filter((u) => !beforeUrns.has(u));

      // "moved" means the SCROLL ITSELF took effect — the position or the
      // scrollable extent changed, or a pagination control was clicked. Wrapper
      // placeholders are deliberately EXCLUDED: on the live page they climbed
      // 35 → 510 while no real card ever rendered, so counting them as progress
      // is what let the scraper claim "end of feed" at 5 cards.
      const moved =
        afterTop !== beforeTop ||
        afterH !== beforeH ||
        clickedMore;

      // Record the scroll in STATE, not console.log.
      //
      // This function is serialised into the background tab by executeScript,
      // so anything it console.logs lands in that tab's devtools and is never
      // seen. Every scroll diagnostic added previously was silently discarded
      // for exactly this reason. Returning the record in the payload is the
      // only way it reaches the panel.
      const record = {
        round: S.rounds,
        container: describeNode(scroller),
        containerPath: nodePath(scroller),
        clientHeight: scroller ? scroller.clientHeight : 0,
        scrollTopBefore: beforeTop,
        scrollTopAfter: afterTop,
        scrollHeightBefore: beforeH,
        scrollHeightAfter: afterH,
        urnsBefore: beforeUrns.size,
        urnsAfter: afterUrns.size,
        newUrns: newUrns.length,
        feedFullUpdateBefore: feedCardCount(feedBefore),
        feedFullUpdateAfter: feedCardCount(),
        wrappersBefore,
        wrappersAfter: totalWrapperCount(),
        cardsBefore: beforeCards,
        cardsAfter: afterCards,
        mutationsObserved: mutationCount,
        clickedShowMore: clickedMore,
        loadMoreButton: (function () {
          try {
            const b = findLoadMoreButton();
            return b ? `${b.tagName.toLowerCase()}.${(b.className || '').toString().slice(0, 40)}` : 'NOT FOUND';
          } catch (e) { return 'ERR'; }
        })(),
        moved,
      };
      S.scrollLog = S.scrollLog || [];
      S.scrollLog.push(record);

      return { moved, newCards: newUrns.length, beforeH, afterH, clickedMore, record };
    }

    /** Short description of a node, for the scroll diagnostics. */
    function describeNode(n) {
      if (!n) return '(none)';
      const cls = (n.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.');
      return `${n.tagName ? n.tagName.toLowerCase() : '?'}${n.id ? '#' + n.id : ''}${cls ? '.' + cls : ''}`;
    }

    /** Full DOM path from <body>, so the real scroll owner can be identified. */
    function nodePath(n) {
      if (!n) return '(none)';
      const parts = [];
      for (let e = n; e && e.tagName; e = e.parentElement) {
        const tag = e.tagName.toLowerCase();
        if (tag === 'html') break;
        let idx = '';
        const parent = e.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter((c) => c.tagName === e.tagName);
          if (sibs.length > 1) idx = `:nth-of-type(${sibs.indexOf(e) + 1})`;
        }
        const cls = (e.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        parts.unshift(`${tag}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''}${idx}`);
        if (tag === 'body') break;
      }
      return parts.join(' > ');
    }

    /**
     * Count of REAL feed cards (`feed-full-update`), which is the number that
     * matters. The live logs showed this pinned at 5 while wrapper counts ran to
     * 510 — so this, not the wrapper count, decides whether the feed advanced.
     */
    function feedCardCount(cached) {
      if (typeof cached === 'number') return cached;
      try {
        // DEDUPLICATED. The two selectors match the SAME elements (a card is
        // both a feed-full-update and a feed-shared-update-v2), so a plain
        // querySelectorAll double-counted: the live logs reported feedCards=10
        // when the page held 5 cards. Count outermost matches only.
        const nodes = Array.from(document.querySelectorAll(
          '[data-view-name="feed-full-update"], div.feed-shared-update-v2'
        ));
        return nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n))).length;
      } catch (e) { return 0; }
    }

    /**
     * ANCESTOR PROBE — empirically find the element that loads more cards.
     *
     * Walks up from a real feed card and, for each ancestor, records its
     * geometry/overflow AND actually writes to scrollTop to see whether the
     * write takes. The caller then tests the surviving candidates for whether
     * scrolling them increases the feed-card count, which is the only proof
     * that matters.
     */
    function probeCardAncestors() {
      const rows = [];
      let card = null;
      try {
        const all = Array.from(document.querySelectorAll(
          '[data-view-name="feed-full-update"], div.feed-shared-update-v2'
        ));
        card = all.find((n) => !all.some((o) => o !== n && o.contains(n))) || all[0];
      } catch (e) { /* none */ }
      if (!card) return rows;

      let depth = 0;
      for (let n = card.parentElement; n && depth < 30; n = n.parentElement, depth++) {
        let overflowY = '?';
        try { overflowY = window.getComputedStyle(n).overflowY; } catch (e) { /* keep */ }
        const sh = n.scrollHeight || 0;
        const ch = n.clientHeight || 0;
        let canScroll = false;
        try {
          const orig = n.scrollTop;
          n.scrollTop = orig + 200;
          canScroll = n.scrollTop !== orig;
          n.scrollTop = orig;
        } catch (e) { canScroll = false; }

        rows.push({
          depth,
          path: nodePath(n),
          tag: n.tagName ? n.tagName.toLowerCase() : '?',
          cls: (n.className || '').toString().slice(0, 70),
          overflowY,
          clientHeight: ch,
          scrollHeight: sh,
          scrollTop: n.scrollTop || 0,
          scrollable: sh > ch + 40,
          canSetScrollTop: canScroll,
          node: n,
        });
        if (n.tagName === 'BODY' || n.tagName === 'HTML') break;
      }
      return rows;
    }

    // ---- Work this batch: a few scroll rounds, then return ---------------
    let roundsThisBatch = 0;
    while (!S.done && roundsThisBatch < ROUNDS_PER_BATCH && (Date.now() - batchStart) < BATCH_BUDGET_MS) {
      if (S.rounds >= MAX_ROUNDS) { finish(`round budget reached (${MAX_ROUNDS})`); break; }

      S.rounds++;
      roundsThisBatch++;

      const scannedAtRoundStart = S.scanned;
      const roundStartedAt = Date.now();

      // Only consider cards we have NOT already processed. `data-qcrm-seen` is
      // stamped on every scanned card, so this filter removes the previously
      // handled ones before any classification work happens — the live run was
      // re-walking hundreds of wrappers per round to find the same 5 cards.
      const candidates = collect().filter(
        (el) => !(el.dataset && el.dataset.qcrmSeen === '1'),
      );
      S.timing = S.timing || { collectMs: 0, classifyMs: 0, scrollMs: 0 };
      S.timing.collectMs += Date.now() - roundStartedAt;

      const classifyStartedAt = Date.now();
      for (const el of candidates) {
        if (S.posts.length >= TARGET) break;
        if (S.scanned >= MAX_SCAN) break;

        if (el.dataset && el.dataset.qcrmSeen === '1') { S.reobserved++; continue; }
        const key = entryKey(el);
        if (seenKeys.has(key)) { S.reobserved++; continue; }
        seenKeys.add(key);
        try { if (el.dataset) el.dataset.qcrmSeen = '1'; } catch (e) { /* non-fatal */ }
        S.scanned++;

        let verdict;
        try {
          verdict = classify(el);
        } catch (e) {
          verdict = { authored: false, skip: 'empty' };
        }

        // ---- AUDIT: one record per scanned entry (diagnostic only) --------
        // Recomputes the observable facts so a rejection can be explained
        // without re-running the scrape. Does not affect classification.
        try {
          const aHeader = readHeader(el);
          const aCommentary = readCommentary(el);
          const aActorEl = el.querySelector('.update-components-actor__title, .update-components-actor__name, .feed-shared-actor__name');
          const aActor = norm(aActorEl ? (aActorEl.innerText || aActorEl.textContent) : '') || '(none)';
          const aIsOwner = ownerCanon ? (canon(aActor).includes(ownerFirst) || ownerCanon.includes((canon(aActor).split(' ')[0]) || ' ')) : null;
          const aHasOriginal = !!el.querySelector('.update-components-mini-update-v2, .feed-shared-mini-update-v2, .feed-shared-reshared-update, .feed-shared-update-v2__update-content-wrapper');
          const aHasMedia = !!el.querySelector('.update-components-image img, .feed-shared-image img, img[data-delayed-url], video, .update-components-linkedin-video');
          const aIsPoll = !!el.querySelector('[class*="poll"], [aria-label*="poll" i]') || /\bpoll\b/i.test(aHeader);
          const REASONS = {
            like: 'header says the owner liked/reacted to someone else\'s post',
            reaction: 'header says the owner reacted (celebrate/love/support/insightful)',
            follow: 'header says the owner followed a page/person',
            comment: 'header says the owner commented on someone else\'s post',
            reshareNoCommentary: 'repost with no commentary (NO LONGER SKIPPED — kept as a repost)',
            sponsored: 'card is marked Promoted/Sponsored',
            empty: 'no text, no media and no article preview — empty placeholder card',
            connection: 'connection / network activity, not a post',
            suggested: 'LinkedIn suggested or recommended content, not a post',
            // Retained so an older cached payload still renders a label. The
            // author filter was removed: shared and reposted cards legitimately
            // name someone else as the actor, so this no longer fires.
            otherAuthor: 'card actor is not the profile owner (FILTER REMOVED — no longer applied)'
          };
          const rec = {
            i: S.scanned,
            type: verdict.authored
                  ? (verdict.isRepost
                      ? (verdict.text && verdict.text.length > 10 ? 'repost+commentary' : 'repost')
                      : 'authored-post')
                  : (aIsPoll ? 'poll' : (verdict.skip || 'unknown')),
            author: aActor,
            isOwner: aIsOwner,
            hasCommentary: !!(aCommentary && aCommentary.length > 10),
            commentaryLen: aCommentary ? aCommentary.length : 0,
            hasMedia: aHasMedia,
            hasOriginal: aHasOriginal,
            isPoll: aIsPoll,
            header: aHeader ? aHeader.slice(0, 60) : '(none)',
            decision: verdict.authored ? 'ACCEPTED' : 'REJECTED',
            reason: verdict.authored ? '' : (REASONS[verdict.skip] || 'unknown'),
            preview: (aCommentary || norm(el.textContent || '')).slice(0, 70),
            // Raw markup of the first few rejected cards, so a wrong rejection
            // can be diagnosed from the panel console without reproducing it.
            html: verdict.authored ? '' : (el.outerHTML || '').slice(0, 500)
          };
          if (aIsPoll && !verdict.authored) S.polls = (S.polls || 0) + 1;
          S.audit = S.audit || [];
          S.audit.push(rec);
          console.log(
            `[AUDIT] #${String(rec.i).padStart(3)} ${rec.decision.padEnd(8)} type=${String(rec.type).padEnd(20)} ` +
            `owner=${String(rec.isOwner)} commentary=${rec.hasCommentary}(${rec.commentaryLen}) media=${rec.hasMedia} ` +
            `original=${rec.hasOriginal} poll=${rec.isPoll} author="${rec.author}"` +
            (rec.reason ? ` | REASON: ${rec.reason}` : '') +
            ` | "${rec.preview}"`
          );
        } catch (e) { /* auditing must never affect extraction */ }

        if (verdict.authored) {
          S.posts.push(buildPost(el, verdict.text, verdict.isRepost));
        } else if (verdict.skip && S.skipped[verdict.skip] !== undefined) {
          S.skipped[verdict.skip]++;
        }
      }

      console.log(
        `[SCRAPER] batch ${S.batches} round ${S.rounds} — unique cards scanned: ${S.scanned} | ` +
        `posts collected: ${S.posts.length} | new this round: ${S.scanned - scannedAtRoundStart}`,
      );

      if (S.posts.length >= TARGET) { finish(`Reached requested limit (${TARGET})`); break; }
      if (S.scanned >= MAX_SCAN) { finish(`scan budget reached (${MAX_SCAN} entries)`); break; }

      // SCROLL FIRST, then judge. The previous order incremented a stagnation
      // counter before any scroll had been attempted, so three quick rounds
      // declared "end of feed" while the virtualiser was still painting — the
      // live run stopped at 5 cards with feedRootCount=25 still on the page.
      //
      // `scrollForMore()` now reports whether the container actually moved and
      // how many NEW activity URNs appeared, so the two distinct situations are
      // no longer conflated:
      //   moved && no new cards  → genuinely the end of the feed
      //   !moved                 → the scroll failed; retry, do not give up
      S.timing.classifyMs += Date.now() - classifyStartedAt;

      const scrollStartedAt = Date.now();
      const scroll = await scrollForMore();
      S.timing.scrollMs += Date.now() - scrollStartedAt;

      if (scroll.newCards > 0) {
        S.stagnantRounds = 0;
        S.failedScrolls = 0;
      } else if (scroll.moved) {
        // The scroll took effect but no new `feed-full-update` card rendered.
        // Require SIX such rounds before declaring the feed exhausted: a
        // virtualiser can legitimately need several viewports of travel before
        // it fetches the next page, and stopping at three ended the live run at
        // 5 cards while 20 were wanted.
        S.stagnantRounds++;
        if (S.stagnantRounds >= 6) {
          finish(
            `End of feed (6 successful scrolls rendered no new feed-full-update cards; ` +
            `${seenKeys.size} unique cards seen, feedCards=${feedCardCount()}, ` +
            `scrollHeight settled at ${scroll.afterH})`,
          );
          break;
        }
      } else {
        // Nothing scrolled AND no new cards. On a finite-scroll feed this is
        // normal — pagination is by button, not by scroll. So the decisive
        // question is whether a load-more button still exists:
        //   button present → keep clicking, we are not done
        //   button absent  → the feed is exhausted; stop immediately rather
        //                    than burning the 90s budget (the live run spent
        //                    384s to return 5 posts).
        const stillHasButton = !!findLoadMoreButton();
        S.failedScrolls = (S.failedScrolls || 0) + 1;
        S.scrollerCache = null;   // force container re-detection
        if (!stillHasButton) {
          finish(
            `End of feed (no load-more button and nothing scrollable; ` +
            `${seenKeys.size} unique cards seen, feedCards=${feedCardCount()})`,
          );
          break;
        }
        if (S.failedScrolls >= 8) {
          finish(
            `load-more button present but produced no new cards after 8 attempts ` +
            `(${seenKeys.size} unique cards seen)`,
          );
          break;
        }
      }
      S.lastSeenCount = seenKeys.size;
    }

    // Persist the de-dup set for the next batch.
    S.seenKeys = Array.from(seenKeys);

    // Order newest-first only when every post carries a real timestamp.
    let posts = S.posts.slice(0, TARGET);
    if (S.done && posts.length > 1 && posts.every((p) => p.date)) {
      posts = posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // ---- AUDIT summary (printed once, when the scrape finishes) ----------
    if (S.done && !S.auditSummaryPrinted) {
      S.auditSummaryPrinted = true;
      try {
        const sk = S.skipped;
        const mediaOnly = (S.audit || []).filter((r) => r.decision === 'REJECTED' && r.reason.indexOf('no commentary') === 0 && r.hasMedia).length;
        const polls = (S.audit || []).filter((r) => r.decision === 'REJECTED' && r.isPoll).length;
        const emptyOther = sk.empty - mediaOnly - polls;
        const originals = S.posts.filter((p) => p.type === 'post').length;
        const reposts = S.posts.filter((p) => p.type === 'repost').length;
        console.log('[AUDIT] ===================== SUMMARY =====================');
        console.log('[POSTS] Original posts:', originals);
        console.log('[POSTS] Reposts:', reposts);
        console.log('[POSTS] Total extracted:', S.posts.length);
        console.log('[AUDIT] ---------------------------------------------------');
        console.log('[AUDIT] Total entries scanned:   ', S.scanned);
        console.log('[AUDIT] Accepted (posts+reposts):', S.posts.length);
        console.log('[AUDIT] Rejected (all):          ', S.scanned - S.posts.length);
        console.log('[AUDIT]   Rejected likes:        ', sk.like + sk.reaction);
        console.log('[AUDIT]   Rejected comments:     ', sk.comment);
        console.log('[AUDIT]   Rejected follows:      ', sk.follow);
        console.log('[AUDIT]   Rejected sponsored:    ', sk.sponsored);
        console.log('[AUDIT]   Rejected media-only:   ', mediaOnly, '(should be 0 — media-only posts are now kept)');
        console.log('[AUDIT]   Rejected polls:        ', polls);
        console.log('[AUDIT]   Rejected other-author: ', sk.otherAuthor);
        console.log('[AUDIT]   Rejected unknown/empty:', emptyOther < 0 ? 0 : emptyOther);

        // Every skipped card, with the exact reason it was skipped.
        const skippedRows = (S.audit || []).filter((r) => r.decision === 'REJECTED');
        if (skippedRows.length) {
          console.log(`[POSTS] Skipped ${skippedRows.length} activity card(s):`);
          skippedRows.forEach((r) => {
            console.log(
              `[POSTS]   #${r.i} SKIPPED — ${r.reason || 'unknown'} | author="${r.author}" | "${r.preview}"`,
            );
          });
        } else {
          console.log('[POSTS] Skipped 0 activity cards — every card was extracted.');
        }
        console.log('[AUDIT] Feed entries present:    ', collect().length, '(DOM containers seen)');
        console.log('[AUDIT] Stop reason:             ', S.stopReason);
        console.log('[AUDIT] Full per-entry table:');
        try { console.table((S.audit || []).map((r) => ({
          '#': r.i, decision: r.decision, type: r.type, owner: r.isOwner,
          commentary: r.commentaryLen, media: r.hasMedia, original: r.hasOriginal,
          poll: r.isPoll, author: r.author, reason: r.reason, preview: r.preview
        }))); } catch (e) { console.log(S.audit); }
        console.log('[AUDIT] ===================================================');
      } catch (e) { /* summary must never break the return */ }
    }

    RETURN.path = S.done ? 'done' : 'batch-progress';
    const result = { ok: true, done: !!S.done, posts, debug: mkDebug({ audit: S.audit || [] }) };
    console.log(`[SCRAPER] returning batch ${S.batches} — done=${result.done} posts=${posts.length} path=${RETURN.path}`, result);
    return result;
  } catch (e) {
    // Any failure still yields a structured payload, plus whatever was collected.
    RETURN.path = 'caught-error';
    let salvaged = [];
    try {
      const st = window.__qcrmPostScrape;
      if (st && Array.isArray(st.posts)) salvaged = st.posts.slice(0, TARGET);
    } catch (e2) { /* ignore */ }
    console.error('[SCRAPER] batch threw:', e);
    return {
      ok: false,
      done: true,
      posts: salvaged,
      error: e && e.message ? e.message : String(e),
      stack: e && e.stack ? String(e.stack) : null,
      debug: {
        url: (function () { try { return window.location.href; } catch (e2) { return null; } })(),
        returnPath: 'caught-error',
        batchElapsedMs: Date.now() - batchStart,
        salvagedPosts: salvaged.length
      }
    };
  }
}

// Clears the cross-batch scrape state. Injected once before the first batch so
// a re-extraction on the same tab never inherits a previous run's results.
function resetActivityScrapeState() {
  try {
    delete window.__qcrmPostScrape;
    document.querySelectorAll('[data-qcrm-seen]').forEach((el) => {
      try { delete el.dataset.qcrmSeen; } catch (e) { /* non-fatal */ }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// Probe injected into the background tab BEFORE the scraper. Confirms the tab
// really navigated to the activity page and that a feed root exists, so the
// scraper is never run against a blank or wrong document.
function probeActivityPageReady() {
  // Kept in sync with scrapeActivityBatch's SELECTORS. If these drift, the
  // probe reports "feed present" while the scraper finds nothing — which is
  // exactly the false-green that hid a scraper failure before.
  const SELECTORS = [
    'div.feed-shared-update-v2',
    'li.profile-creator-shared-feed-update__container',
    'div.occludable-update',
    'div[data-urn*="activity"]',
    'div[data-id*="activity"]',
    '[data-view-name="feed-full-update"]',
    '[data-view-name*="update"]',
    '[data-testid="mainFeed"] [role="listitem"]',
    'main [role="listitem"]'
  ];
  let feedRootCount = 0;
  try { feedRootCount = document.querySelectorAll(SELECTORS.join(', ')).length; } catch (e) { feedRootCount = 0; }
  // Structural count: post permalinks are what the scraper falls back to.
  let permalinkCount = 0;
  try {
    permalinkCount = document.querySelectorAll(
      'main a[href*="/feed/update/"], main a[href*="activity-"]'
    ).length;
  } catch (e) { permalinkCount = 0; }

  const bodyText = (document.body && document.body.textContent) || '';
  const EMPTY_RE = /(hasn'?t posted( lately| yet)?|has not posted|no posts yet|nothing to see here)/i;
  const AUTH_RE = /(sign in|join now|log in to continue|authwall)/i;

  return {
    url: location.href,
    readyState: document.readyState,
    isBlank: location.href === 'about:blank' || !document.body,
    hasMain: !!document.querySelector('main'),
    bodyTextLen: bodyText.length,
    feedRootCount,
    permalinkCount,
    emptyState: EMPTY_RE.test(bodyText),
    authWall: AUTH_RE.test(bodyText.slice(0, 2000)) && bodyText.length < 4000
  };
}

// Open the profile's /recent-activity/all/ page in a background tab, scrape the
// authored-post list, then close it.
//
// Return contract (never a bare array, never a laundered []):
//   { ok: true,  posts: [...], debug: {...} }   scrape ran against a real feed
//   { ok: false, posts: null,  debug: {...} }   could not load/inject/scrape
// `ok:false` means "unavailable" and the caller MUST fall back to the profile
// preview. `ok:true` with posts: [] means the feed genuinely had no authored
// posts — a real answer, not a failure.
async function fetchPostsFromActivityPage(profileUrl, ownerName) {
  const debug = {
    activityUrl: null,
    tabId: null,
    navigation: { committed: false, finalUrl: null, tabStatus: null, readyState: null, waitedMs: 0 },
    probe: null,
    injection: { attempted: false, resultShape: null, error: null },
    failureStage: null,   // 'url' | 'create' | 'navigation' | 'probe' | 'injection' | 'scrape' | null
    reason: null
  };

  const activityUrl = buildRecentActivityUrl(profileUrl);
  debug.activityUrl = activityUrl;
  if (!activityUrl) {
    debug.failureStage = 'url';
    debug.reason = 'not a public /in/ profile URL — no activity page exists';
    console.log('[POSTS][activity] skipped —', debug.reason);
    return { ok: false, posts: null, debug };
  }

  let ownerSlug = '';
  try {
    const m = new URL(profileUrl).pathname.match(/\/in\/([^/?#]+)/i);
    ownerSlug = m ? m[1] : '';
  } catch { /* slug is optional */ }

  // Compare origin+pathname only: LinkedIn appends query/hash of its own.
  const expectedPath = (() => {
    try { const u = new URL(activityUrl); return u.origin + u.pathname.replace(/\/+$/, ''); }
    catch { return activityUrl; }
  })();
  const urlMatches = (u) => {
    if (!u) return false;
    try { const p = new URL(u); return (p.origin + p.pathname.replace(/\/+$/, '')) === expectedPath; }
    catch { return false; }
  };

  let tab = null;
  try {
    console.log('[POSTS][activity] opening background tab:', activityUrl);
    try {
      tab = await chrome.tabs.create({ url: activityUrl, active: false });
    } catch (e) {
      debug.failureStage = 'create';
      debug.reason = 'chrome.tabs.create failed: ' + (e && e.message ? e.message : String(e));
      console.warn('[POSTS][activity]', debug.reason);
      return { ok: false, posts: null, debug };
    }
    debug.tabId = tab && tab.id;

    // ---- Wait for a REAL navigation ------------------------------------
    // chrome.tabs.create resolves before navigation commits — at that moment
    // the tab is still about:blank with status "complete". Waiting on status
    // alone therefore passes instantly and we inject into a blank document.
    // Require: url matches the activity page AND status complete AND the
    // document itself reports readyState complete.
    const NAV_TIMEOUT_MS = 30000;
    const POLL_MS = 250;
    const navStart = Date.now();
    let navReady = false;

    while (Date.now() - navStart < NAV_TIMEOUT_MS) {
      const t = await chrome.tabs.get(tab.id).catch(() => null);
      if (!t) {
        debug.failureStage = 'navigation';
        debug.reason = 'background tab disappeared during navigation';
        break;
      }
      debug.navigation.finalUrl = t.url || null;
      debug.navigation.tabStatus = t.status || null;

      if (urlMatches(t.url) && t.status === 'complete') {
        debug.navigation.committed = true;
        // Confirm from inside the document — tab.status can report complete
        // while the document is still parsing.
        const rs = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => document.readyState
        }).then((r) => r && r[0] && r[0].result).catch(() => null);
        debug.navigation.readyState = rs;
        if (rs === 'complete') { navReady = true; break; }
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    debug.navigation.waitedMs = Date.now() - navStart;

    if (!navReady) {
      debug.failureStage = debug.failureStage || 'navigation';
      debug.reason = debug.reason ||
        `activity page did not finish loading within ${NAV_TIMEOUT_MS}ms ` +
        `(url=${debug.navigation.finalUrl}, status=${debug.navigation.tabStatus}, readyState=${debug.navigation.readyState})`;
      console.warn('[POSTS][activity] navigation failed —', debug.reason);
      return { ok: false, posts: null, debug };
    }
    console.log(`[POSTS][activity] navigation OK in ${debug.navigation.waitedMs}ms — url=${debug.navigation.finalUrl} readyState=${debug.navigation.readyState}`);

    // ---- Verify a feed root exists before running the scraper -----------
    // Poll briefly: the feed hydrates after readyState complete.
    const PROBE_TIMEOUT_MS = 10000;
    const probeStart = Date.now();
    let probe = null;
    while (Date.now() - probeStart < PROBE_TIMEOUT_MS) {
      probe = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: probeActivityPageReady
      }).then((r) => r && r[0] && r[0].result).catch(() => null);

      // Accept the structural signal too: on hashed-class layouts feedRootCount
      // is 0 while permalinks are present, and the scraper falls back to those.
      if (probe && (probe.feedRootCount > 0 || probe.permalinkCount > 0 || probe.emptyState || probe.authWall)) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    debug.probe = probe;
    console.log('[POSTS][activity] probe:', probe);

    if (!probe) {
      debug.failureStage = 'probe';
      debug.reason = 'readiness probe could not run in the background tab';
      console.warn('[POSTS][activity]', debug.reason);
      return { ok: false, posts: null, debug };
    }
    if (probe.isBlank) {
      debug.failureStage = 'probe';
      debug.reason = 'background tab is still a blank document — navigation never committed';
      console.warn('[POSTS][activity]', debug.reason);
      return { ok: false, posts: null, debug };
    }
    if (probe.authWall) {
      debug.failureStage = 'probe';
      debug.reason = 'activity page hit a login/auth wall — not signed in for this profile';
      console.warn('[POSTS][activity]', debug.reason);
      return { ok: false, posts: null, debug };
    }
    if (probe.feedRootCount === 0 && !probe.permalinkCount && !probe.emptyState) {
      // No feed containers AND no explicit "no posts" text: we cannot tell
      // whether the profile has no posts or our selectors missed. Treat as
      // unavailable so the caller falls back rather than asserting zero.
      debug.failureStage = 'probe';
      debug.reason = 'no feed root found and no empty-state text — cannot distinguish "no posts" from a selector/layout miss';
      console.warn('[POSTS][activity]', debug.reason);
      return { ok: false, posts: null, debug };
    }

    // ---- Run the scraper in SHORT BATCHES -------------------------------
    // One long injection gets killed when Chrome throttles/freezes the
    // background tab, and executeScript then resolves with result:null. Each
    // batch below does ~2 scroll rounds and returns within a few seconds, so no
    // single injection is ever long enough to be killed. Progress accumulates
    // on the page (window.__qcrmPostScrape) between calls.
    debug.injection.attempted = true;
    debug.batches = [];

    // Clear any state left by a previous extraction on this tab.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: resetActivityScrapeState
    }).catch(() => null);

    // Budgets sized for the observer-driven waits. Each batch now returns in
    // ~1–3s instead of ~11s, so 12 batches is ample to reach 20 posts, and the
    // 25s ceiling stops a stalled feed from running for minutes (the previous
    // 90s budget produced 160–384s total runs).
    const MAX_BATCHES = 12;
    const OVERALL_BUDGET_MS = 25000;
    const scrapeStart = Date.now();
    let lastPayload = null;
    let batchNo = 0;

    while (batchNo < MAX_BATCHES) {
      batchNo++;
      const elapsedTotal = Date.now() - scrapeStart;
      if (elapsedTotal > OVERALL_BUDGET_MS) {
        console.warn(`[POSTS][activity] overall budget ${OVERALL_BUDGET_MS}ms exhausted after ${batchNo - 1} batches`);
        break;
      }

      const t0 = Date.now();
      console.log(`[POSTS][activity] executeScript started — batch ${batchNo}`);

      let batchResults = null;
      try {
        batchResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: scrapeActivityBatch,
          args: [ownerName || '', ownerSlug, { target: 20, roundsPerBatch: 2, batchBudgetMs: 4000 }]
        });
      } catch (e) {
        const ms = Date.now() - t0;
        debug.failureStage = 'injection';
        debug.injection.error = e && e.message ? e.message : String(e);
        debug.reason = `batch ${batchNo} injection failed after ${ms}ms: ` + debug.injection.error;
        console.warn('[POSTS][activity] executeScript finished — ERROR |', debug.reason);
        break;
      }

      const ms = Date.now() - t0;
      const f0 = batchResults && batchResults[0];
      const shape = {
        batch: batchNo,
        frames: Array.isArray(batchResults) ? batchResults.length : null,
        hasFrame: !!f0,
        hasResult: !!(f0 && f0.result),
        resultIsNull: !!(f0 && f0.result === null),
        resultType: f0 ? typeof f0.result : 'no-frame',
        elapsedMs: ms
      };
      debug.batches.push(shape);
      debug.injection.resultShape = shape;

      const p = f0 && f0.result;
      const payloadSize = p && Array.isArray(p.posts) ? p.posts.length : 0;
      console.log(`[POSTS][activity] executeScript finished — batch ${batchNo} | elapsed=${ms}ms | payload posts=${payloadSize} | done=${p && p.done} | returnPath=${p && p.debug && p.debug.returnPath}`);

      // ── Per-batch candidate audit, mirrored from the background tab ──
      // The scraper's own console.log output lands in the hidden tab's
      // devtools, which is unreachable in practice. These lines are the only
      // visibility into why a batch produced nothing.
      try {
        const d = (p && p.debug) || {};
        console.log(
          `[SCRAPER][batch ${batchNo}] unique cards scanned: ${d.scanned} | ` +
          `posts collected: ${d.authored} | wrappers seen: ${d.candidateCount} | ` +
          `re-observed(dedupe)=${d.reobserved}`,
        );
        if (d.stopReason) {
          console.log(`[SCRAPER][batch ${batchNo}] stop reason: ${d.stopReason}`);
        }
        if (d.timing) {
          console.log(
            `[TIMING][batch ${batchNo}] collect=${d.timing.collectMs}ms | ` +
            `classify=${d.timing.classifyMs}ms | scroll+paginate=${d.timing.scrollMs}ms ` +
            `(cumulative across batches)`,
          );
        }

        // ── Per-scroll diagnostics, forwarded from the background tab ──
        if (Array.isArray(d.scrollLog) && d.scrollLog.length) {
          console.log(`[SCROLL][batch ${batchNo}] ${d.scrollLog.length} scroll(s) this batch:`);
          try {
            console.table(d.scrollLog.map((r) => ({
              round: r.round,
              container: r.container,
              clientH: r.clientHeight,
              'scrollTop→': `${r.scrollTopBefore}→${r.scrollTopAfter}`,
              'scrollH→': `${r.scrollHeightBefore}→${r.scrollHeightAfter}`,
              'feedCards→': `${r.feedFullUpdateBefore}→${r.feedFullUpdateAfter}`,
              'URNs→': `${r.urnsBefore}→${r.urnsAfter}`,
              newURNs: r.newUrns,
              'wrappers→': `${r.wrappersBefore}→${r.wrappersAfter}`,
              mutations: r.mutationsObserved,
              loadMoreBtn: r.loadMoreButton,
              clickedMore: r.clickedShowMore,
              moved: r.moved,
            })));
          } catch (e) { console.log(d.scrollLog); }
          d.scrollLog.forEach((r) =>
            console.log(`[SCROLL]   round ${r.round} container path: ${r.containerPath}`));

          // Nothing new rendered anywhere: name the elements that DO scroll so
          // the real feed owner can be pinned down instead of guessed at.
          //
          // Reported only when the scrape ACTUALLY UNDER-DELIVERED. A batch that
          // adds no new cards is normal — it is how a completed scrape ends, and
          // how an exhausted feed behaves. Logging it unconditionally with
          // console.warn put "no new feed cards" into Chrome's extension Errors
          // list on every successful run, which read as a failure when posts had
          // in fact been extracted correctly.
          const anyNew = d.scrollLog.some((r) => r.newUrns > 0);
          const underDelivered = d.authored === 0;
          if (!anyNew && underDelivered) {
            console.warn(
              `[SCROLL][batch ${batchNo}] no new feed cards after ${d.scrollLog.length} scroll(s) ` +
              `AND no posts collected. feed-full-update currently = ${d.feedCardCount}.`,
            );
            console.log(`[SCROLL] scroll container verified by outcome: ${d.scrollerVerified}`);

            // The decisive table: every ancestor of the first feed card, with
            // its geometry, overflow, and whether scrolling it actually loaded
            // more cards.
            if (Array.isArray(d.ancestorProbe) && d.ancestorProbe.length) {
              console.log('[SCROLL] ancestor chain of the first feed-full-update card:');
              try {
                console.table(d.ancestorProbe.map((r) => ({
                  depth: r.depth,
                  tag: r.tag,
                  overflowY: r.overflowY,
                  clientH: r.clientHeight,
                  scrollH: r.scrollHeight,
                  scrollTop: r.scrollTop,
                  scrollable: r.scrollable,
                  canSetScrollTop: r.canSetScrollTop,
                  loadsMoreCards: r.loadsMoreCards,
                  cls: r.cls,
                })));
              } catch (e) { console.log(d.ancestorProbe); }
              d.ancestorProbe.forEach((r) =>
                console.log(`[SCROLL]   depth ${r.depth}: ${r.path}`));
            } else {
              console.log('[SCROLL] ancestor probe empty — no feed card found to walk up from.');
            }
          }
        }
        if (d.selectorCensus) {
          console.log(`[SCRAPER][batch ${batchNo}] selector census:`, d.selectorCensus);
        }
        if (d.skipped) {
          const nonZero = Object.keys(d.skipped)
            .filter((k) => d.skipped[k])
            .map((k) => `${k}=${d.skipped[k]}`);
          console.log(
            `[SCRAPER][batch ${batchNo}] rejection rules fired:`,
            nonZero.length ? nonZero.join(', ') : '(none)',
          );
        }
        if (Array.isArray(d.rejectedSamples) && d.rejectedSamples.length) {
          console.log(`[SCRAPER][batch ${batchNo}] first ${d.rejectedSamples.length} rejected card(s):`);
          d.rejectedSamples.forEach((r) => {
            console.log(`[SCRAPER]   #${r.i} REJECTED — ${r.reason} | author="${r.author}"`);
            console.log(`[SCRAPER]   outerHTML: ${r.html}`);
          });
        }
        // Nothing matched any selector: dump what IS in <main> so the next
        // selector can be written from evidence rather than guesswork.
        //
        // Gated on `authored === 0` because a zero candidate count is EXPECTED
        // once the scrape has what it needs: collect() filters out every card
        // already stamped data-qcrm-seen, so a completed batch legitimately
        // reports 0. Warning unconditionally flagged successful runs as errors.
        if (d.candidateCount === 0 && d.authored === 0) {
          console.warn(
            `[SCRAPER][batch ${batchNo}] ZERO CANDIDATES — no element matched any known activity-card selector.`,
          );
          const rows = d.unmatchedContainers || [];
          if (rows.length) {
            console.log('[SCRAPER] containers inside <main> that might be activity cards:');
            try { console.table(rows.map((r) => ({
              probe: r.probe, tag: r.tag, urn: r.urn, viewName: r.viewName, cls: r.cls,
            }))); } catch (e) { console.log(rows); }
            rows.slice(0, 5).forEach((r) => console.log(`[SCRAPER]   ${r.probe} → ${r.html}`));
          } else {
            console.log('[SCRAPER] no candidate containers found inside <main> at all.');
          }
        }
      } catch (e) { /* diagnostics must never break the pipeline */ }

      // A null frame result means this batch was killed. Earlier batches already
      // persisted their progress on the page, so retry rather than give up.
      if (!p) {
        console.warn(`[POSTS][activity] batch ${batchNo} returned a null frame result — retrying (state is preserved in the page)`);
        if (batchNo >= 3 && !lastPayload) {
          debug.failureStage = 'scrape';
          debug.reason = 'first 3 batches all returned null frame results — the background tab is being killed before any batch can return';
          console.warn('[POSTS][activity]', debug.reason);
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      // The batch reported an internal error but still returned a payload.
      if (p.ok === false) {
        debug.failureStage = 'scrape';
        debug.scrape = p.debug || null;
        debug.reason = `batch ${batchNo} reported an internal error: ` + (p.error || 'unknown');
        console.warn('[POSTS][activity]', debug.reason, '| stack:', p.stack);
        // Keep any salvaged posts rather than discarding them.
        lastPayload = Array.isArray(p.posts) && p.posts.length ? p : lastPayload;
        break;
      }

      lastPayload = p;
      if (p.done) {
        console.log(`[POSTS][activity] scrape complete after ${batchNo} batch(es) — ${p.posts.length} post cards, stopReason="${p.debug && p.debug.stopReason}"`);

        // Mirror the per-entry classifier audit into the PANEL console, so it
        // can be reviewed without opening the background tab's devtools.
        try {
          const audit = (p.debug && p.debug.audit) || [];
          if (audit.length) {
            const sk = (p.debug && p.debug.skipped) || {};
            const mediaOnly = audit.filter((r) => r.decision === 'REJECTED' && String(r.reason).indexOf('no commentary') === 0 && r.hasMedia).length;
            const polls = audit.filter((r) => r.decision === 'REJECTED' && r.isPoll).length;
            const originals = p.posts.filter((x) => x.type === 'post').length;
            const reposts = p.posts.filter((x) => x.type === 'repost').length;
            console.log('[AUDIT][panel] ================= CLASSIFIER AUDIT =================');
            console.log('[POSTS][panel] Original posts:', originals);
            console.log('[POSTS][panel] Reposts:', reposts);
            console.log('[POSTS][panel] Total extracted:', p.posts.length);
            const skippedRows = audit.filter((r) => r.decision === 'REJECTED');
            if (skippedRows.length) {
              console.log(`[POSTS][panel] Skipped ${skippedRows.length} activity card(s):`);
              skippedRows.forEach((r) => {
                console.log(`[POSTS][panel]   #${r.i} SKIPPED — ${r.reason || 'unknown'} | author="${r.author}"`);
              });
            } else {
              console.log('[POSTS][panel] Skipped 0 activity cards — every card was extracted.');
            }
            console.log('[AUDIT][panel] ----------------------------------------------------');
            console.log('[AUDIT][panel] Total entries scanned:   ', p.debug.scanned);
            console.log('[AUDIT][panel] Accepted (posts+reposts):', p.posts.length);
            console.log('[AUDIT][panel] Rejected (all):          ', p.debug.scanned - p.posts.length);
            console.log('[AUDIT][panel]   likes/reactions:       ', (sk.like || 0) + (sk.reaction || 0));
            console.log('[AUDIT][panel]   comments:              ', sk.comment || 0);
            console.log('[AUDIT][panel]   follows:               ', sk.follow || 0);
            console.log('[AUDIT][panel]   sponsored:             ', sk.sponsored || 0);
            console.log('[AUDIT][panel]   media-only:            ', mediaOnly);
            console.log('[AUDIT][panel]   polls:                 ', polls);
            console.log('[AUDIT][panel]   other-author:          ', sk.otherAuthor || 0);
            console.table(audit.map((r) => ({
              '#': r.i, decision: r.decision, type: r.type, owner: r.isOwner,
              commentaryLen: r.commentaryLen, media: r.hasMedia, original: r.hasOriginal,
              poll: r.isPoll, author: r.author, reason: r.reason, preview: r.preview
            })));
            console.log('[AUDIT][panel] ====================================================');
          }
        } catch (e) { /* auditing must never break the pipeline */ }
        break;
      }
    }

    if (!lastPayload || !Array.isArray(lastPayload.posts)) {
      debug.failureStage = debug.failureStage || 'scrape';
      debug.reason = debug.reason || 'no batch produced a usable payload';
      console.warn('[POSTS][activity]', debug.reason, '| batches:', debug.batches);
      return { ok: false, posts: null, debug };
    }

    debug.scrape = lastPayload.debug || null;
    debug.batchCount = batchNo;
    debug.totalScrapeMs = Date.now() - scrapeStart;
    if (!lastPayload.done) {
      // A partial result that still carries posts is a normal budget trim, not a
      // failure — log it. Only a partial result with NOTHING to show is worth a
      // warning (and Chrome's Errors list).
      const msg = `[POSTS][activity] scrape ended before completion — returning ${lastPayload.posts.length} partial results after ${batchNo} batches (${debug.totalScrapeMs}ms)`;
      if (lastPayload.posts.length === 0) console.warn(msg);
      else console.log(msg);
    }
    console.log('[POSTS][activity] post cards returned:', lastPayload.posts.length,
      '| batches:', batchNo, '| totalMs:', debug.totalScrapeMs,
      '| returnPath:', lastPayload.debug && lastPayload.debug.returnPath);

    // ── PHASE TIMING SUMMARY ──
    // Identifies the slow step directly instead of leaving it to inference.
    try {
      const t = (lastPayload.debug && lastPayload.debug.timing) || {};
      const nav = (debug.navigation && debug.navigation.elapsedMs) || 0;
      console.log(
        `[TIMING] navigation=${nav}ms | ` +
        `collect=${t.collectMs || 0}ms | classify=${t.classifyMs || 0}ms | ` +
        `scroll+paginate=${t.scrollMs || 0}ms | scrape=${debug.totalScrapeMs}ms | ` +
        `batches=${batchNo} | posts=${lastPayload.posts.length}`,
      );
    } catch (e) { /* diagnostics must never break the return */ }
    return { ok: true, posts: lastPayload.posts, debug };
  } catch (e) {
    debug.failureStage = debug.failureStage || 'injection';
    debug.reason = 'unexpected failure: ' + (e && e.message ? e.message : String(e));
    console.warn('[POSTS][activity] failed —', debug.reason);
    return { ok: false, posts: null, debug };
  } finally {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }
    }
  }
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
      // Posts are part of the payload we ship to the CRM, so a frame that
      // captured them must not lose to an otherwise-equal frame that didn't.
      // Weighted below the identity fields so it can never outrank real
      // profile data.
      if (Array.isArray(r.posts) && r.posts.length) s += 1;
      return s;
    }

    let best = null;
    let bestScore = -1;
    let bestFrameId = null;
    (results || []).forEach((entry) => {
      const score = scoreResult(entry && entry.result);
      if (score > bestScore) {
        bestScore = score;
        best = entry ? entry.result : null;
        bestFrameId = entry ? entry.frameId : null;
      }
    });

    // ===================================================================
    // DETERMINISTIC EXPERIENCE DIAGNOSTIC (panel-side).
    //
    // Emitted by linkedIn.js itself, from the executeScript() RETURN VALUE —
    // never from inside the injected function. The extractor runs in the
    // LinkedIn page context, so anything it logs goes to the page's console and
    // cannot be read here; that ambiguity is what this block removes. These
    // lines land in the same console as [POSTS] and [VERIFY].
    //
    // Reports EVERY frame, not just the winner, because frame score is driven
    // by identity fields — a frame can win on name/headline/picture while a
    // different frame is the one that actually holds the Experience section.
    // ===================================================================
    // Retained so the whole report can be RE-PRINTED next to [VERIFY] at the
    // end of the run. The posts scrape between here and there takes ~30s and
    // emits hundreds of lines, which pushes these lines out of a truncated
    // console buffer — the report is useless if it cannot be read.
    let expReportLines = [];
    try {
      const frames = (results || []).map((entry, i) => ({
        i,
        frameId: entry ? entry.frameId : null,
        r: entry ? entry.result : null,
      }));

      frames.forEach((f) => {
        if (!f.r) {
          console.log(`[EXPERIENCE][FRAME ${f.i}] frameId=${f.frameId} result=null (frame returned nothing)`);
          return;
        }
        const d = f.r.experienceDebug;
        if (!d) {
          // No experienceDebug at all ⇒ the page ran a scraper build older than
          // the one that introduced this field. That is a definitive stale-code
          // signal, not a scraping failure.
          console.warn(
            `[EXPERIENCE][FRAME ${f.i}] frameId=${f.frameId} NO experienceDebug FIELD` +
              ` — stale scraper build=${(f.r.__diag && f.r.__diag.build) || '(none)'}`,
          );
          return;
        }
        const line =
          `[EXPERIENCE][FRAME ${f.i}] frameId=${f.frameId} build=${d.build}` +
          ` topFrame=${d.isTopFrame} name=${d.hasFullName} aboutLen=${d.aboutLen}` +
          ` | anchor=${d.anchorPresent} section=${d.sectionFound} rows=${d.rowsDetected}` +
          ` liRows=${d.liRows} parserReached=${d.parserReached}` +
          ` parserResult=${d.parserResultCount} voyager=${d.voyagerCount} parsed=${d.parsed}` +
          ` | scrollContainer="${d.scrollContainer}" rounds=${d.scrollRounds}` +
          ` scrollTop=${d.finalScrollTop}/${d.finalScrollHeight} reason="${d.reason}"` +
          ` | docH=${d.docClientH}/${d.docScrollH} bodyH=${d.bodyClientH}/${d.bodyScrollH}` +
          ` innerH=${d.innerH} scrollables=${d.scrollableCount} roots=${d.rootCandidates}` +
          ` moved=${d.scrollVerifyMoved} (${d.scrollVerifyBefore}→${d.scrollVerifyAfter})` +
          ` | expText before=${d.scanBeforeExpText}/exact=${d.scanBeforeExpExact}` +
          ` last=${d.lastScanExpText}/exact=${d.lastScanExpExact}` +
          ` final=${d.finalScanExpText}/exact=${d.finalScanExpExact}` +
          ` | url=${d.frameUrl}`;
        expReportLines.push(line);
        console.log(line);
        if (d.matchedSelectors && d.matchedSelectors.length) {
          console.log(`[EXPERIENCE][FRAME ${f.i}] matched selectors: ${d.matchedSelectors.join(' , ')}`);
        }
        if (d.failedSelectors && d.failedSelectors.length) {
          console.log(`[EXPERIENCE][FRAME ${f.i}] failed selectors:  ${d.failedSelectors.join(' , ')}`);
        }
        if (d.titles && d.titles.length) {
          console.log(`[EXPERIENCE][FRAME ${f.i}] titles:`, d.titles);
        }
      });

      const wd = best && best.experienceDebug;
      const winnerLine =
        `[EXPERIENCE][WINNER] frame=${bestFrameId} score=${bestScore}` +
        ` parsed=${wd ? wd.parsed : 'n/a'} section=${wd ? wd.sectionFound : 'n/a'}` +
        ` rows=${wd ? wd.rowsDetected : 'n/a'} parserReached=${wd ? wd.parserReached : 'n/a'}`;
      expReportLines.push(winnerLine);
      console.log(winnerLine);

      // Does a NON-winning frame hold Experience the winner lacks? This is the
      // CASE C check (parsed somewhere, discarded by frame selection) and it is
      // answered with data rather than inferred.
      const richer = frames.filter(
        (f) => f.r && f.r.experienceDebug && f.r.experienceDebug.parsed > 0 && f.frameId !== bestFrameId,
      );
      if (richer.length) {
        console.warn(
          `[EXPERIENCE][RESULT] CASE C — ${richer.length} non-winning frame(s) DO have parsed Experience:`,
          richer.map((f) => `frame ${f.i} (id=${f.frameId}) parsed=${f.r.experienceDebug.parsed}`).join(' | '),
        );
      }

      const anySection = frames.some((f) => f.r && f.r.experienceDebug && f.r.experienceDebug.sectionFound);
      const anyRows = frames.some((f) => f.r && f.r.experienceDebug && f.r.experienceDebug.rowsDetected > 0);
      const anyParsed = frames.some((f) => f.r && f.r.experienceDebug && f.r.experienceDebug.parsed > 0);
      const anyReached = frames.some((f) => f.r && f.r.experienceDebug && f.r.experienceDebug.parserReached);

      // Name the case outright so the next step is not a judgement call.
      let verdict;
      if (!anySection && !anyRows) {
        verdict = 'CASE A — Experience section not present in ANY frame (scroll/section detection is the problem)';
      } else if (anyRows && anyReached && !anyParsed) {
        verdict = 'CASE B — rows detected and parser ran, but returned 0 (parser is the problem)';
      } else if (anyParsed && !(wd && wd.parsed > 0)) {
        verdict = 'CASE C — parsed in a non-winning frame, discarded by frame selection/merge';
      } else if (anySection && !anyReached) {
        verdict = 'CASE X — section found but parser NEVER invoked (execution path is the problem)';
      } else if (wd && wd.parsed > 0) {
        verdict = 'parsed OK in winning frame — if VERIFY still shows empty, the loss is downstream (CASE D/E)';
      } else {
        verdict = 'inconclusive — see per-frame lines above';
      }
      const resultLine =
        `[EXPERIENCE][RESULT] build=${(wd && wd.build) || (best && best.__diag && best.__diag.build) || '(none)'}` +
        ` frames=${frames.length} anySection=${anySection} anyRows=${anyRows}` +
        ` anyParserReached=${anyReached} anyParsed=${anyParsed} → ${verdict}`;
      expReportLines.push(resultLine);
      console.log(resultLine);
    } catch (diagError) {
      // A diagnostic must never break extraction.
      console.warn('[EXPERIENCE][RESULT] diagnostic failed:', diagError);
    }

    // Stale-build guard.
    //
    // linkedin-profile-scraper.js is loaded into the service worker via
    // importScripts, and a service worker survives a plain "Reload" in
    // chrome://extensions. The panel can therefore run a NEW linkedIn.js against
    // an OLD scraper, which looks exactly like "the fix didn't work". Report it
    // instead of letting it masquerade as a scraping failure.
    const EXPECTED_SCRAPER_BUILD = '2026-08-11f';
    const ranBuild = (best && best.__diag && best.__diag.build) || null;
    if (ranBuild !== EXPECTED_SCRAPER_BUILD) {
      console.error(
        `[QCRM] STALE SCRAPER: panel expects build ${EXPECTED_SCRAPER_BUILD} but the page ran ` +
          `${ranBuild || '(a build with no stamp — older than 2026-08-11a)'}. ` +
          `The cached service worker was not replaced. Fix: chrome://extensions → ` +
          `"Remove" the extension → "Load unpacked" again (a plain Reload does NOT ` +
          `replace the worker). Experience extraction WILL fail until this is done.`,
      );
    } else {
      console.log(`[QCRM] scraper build ${ranBuild} ✓`);
    }

    // If the chosen frame has no Experience but another frame does, prefer that
    // frame's list rather than reporting empty. Identity fields still come from
    // the winner, so this can only ADD data that was actually extracted.
    if (best && !(Array.isArray(best.experiences) && best.experiences.length)) {
      const donor = (results || [])
        .map((e) => e && e.result)
        .find((r) => r && Array.isArray(r.experiences) && r.experiences.length);
      if (donor) {
        console.warn(
          `[EXP] chosen frame had no experiences — adopting ${donor.experiences.length} from another frame`,
        );
        best.experiences = donor.experiences;
        best.__sources = Object.assign({}, best.__sources, {
          experiences: (donor.__sources && donor.__sources.experiences) || 'other-frame',
        });
      }
    }

    // Fires ONLY when About or Experience came back empty, naming the stage
    // instead of requiring a fresh debugging round. anchor=false together with a
    // small page height means the page had not hydrated when the extractor ran —
    // the cause of the empty-About/Experience failure this guard was added for.
    if (best && (!best.about || !(Array.isArray(best.experiences) && best.experiences.length))) {
      const d = best.__diag || {};
      const lz = d.lazy || {};
      const x = d.experience || {};
      console.warn(
        '[QCRM] About/Experience empty — anchor=' + x.anchorPresent +
          ' section=' + x.sectionFound + ' liRows=' + x.liRows + ' parsed=' + x.parsed +
          ' | page height ' + lz.startH + '->' + lz.endH +
          ' rounds=' + lz.rounds + ' scroller=' + lz.scroller +
          ' reason="' + lz.reason + '"',
      );
    }

    // Posts diagnostic per frame, mirrored into the PANEL console.
    (results || []).forEach((entry) => {
      const r = entry && entry.result;
      if (!r) return;
      console.log(`[POSTS][panel] frameId=${entry.frameId} posts=${Array.isArray(r.posts) ? r.posts.length : 'n/a'}`, r.__postsDebug || '(no debug)');
    });

    // The profile page's Activity block is only an unfiltered preview. Pull the
    // authored-post list from /recent-activity/all/ in a background tab; it is
    // authoritative because it is the only pass that classifies each entry and
    // keeps just the owner's own posts. The preview is a fallback for when the
    // activity page is unavailable (private profile, tab blocked, timeout).
    if (best && isExtractableLinkedInProfileUrl(tab.url)) {
      const previewCount = Array.isArray(best.posts) ? best.posts.length : 0;
      const activity = await fetchPostsFromActivityPage(best.linkedinUrl || tab.url, best.fullName);

      // Only an ok:true result is authoritative. A failure NEVER overwrites the
      // preview with an empty list — "couldn't load" and "has no posts" are
      // different answers and must not be conflated.
      if (activity && activity.ok && Array.isArray(activity.posts)) {
        console.log(`[POSTS] using post cards from activity page (${activity.posts.length}); profile preview had ${previewCount} unfiltered entries`);
        best.posts = activity.posts;
        best.__postsSource = 'activity-page';
      } else {
        const why = (activity && activity.debug && activity.debug.reason) || 'unknown';
        const stage = (activity && activity.debug && activity.debug.failureStage) || 'unknown';
        console.warn(`[POSTS] activity page unavailable (stage=${stage}) — falling back to profile preview (${previewCount} unfiltered entries). Reason: ${why}`);
        best.__postsSource = previewCount > 0 ? 'profile-preview' : 'none';
        best.__postsUnavailableReason = why;
      }
      best.__postsPipelineDebug = activity ? activity.debug : null;
      console.log('[POSTS] pipeline debug:', best.__postsPipelineDebug);
    }

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
      // Final state of the exact field VERIFY reads, immediately before it is
      // read. If this count is > 0 while VERIFY prints (EMPTY), the loss is in
      // VERIFY itself; if it is 0 while a frame reported parsed>0 above, the
      // loss happened between frame selection and here.
      {
        const fin = Array.isArray(best.experiences) ? best.experiences : [];
        console.log(`[EXPERIENCE][FINAL] data.experiences count=${fin.length}`);
        if (fin.length) {
          console.log('[EXPERIENCE][FINAL] titles=', fin.map((e) => (e && e.jobTitle) || '(no title)'));
        }
        // Re-print the per-frame report here. It was already logged ~200 lines
        // and ~30s ago (before the posts scrape), which is far enough back that
        // a truncated console buffer drops it; this copy sits in the surviving
        // tail next to [VERIFY]. Same strings, emitted twice by design.
        if (expReportLines && expReportLines.length) {
          console.log('[EXPERIENCE][REPORT] ----- captured at frame-selection time -----');
          expReportLines.forEach((l) => console.log(l));
          console.log('[EXPERIENCE][REPORT] -------------------------------------------');
        }
      }
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
      delete best.__sources; delete best.__diag; delete best.__postsDebug;
      delete best.__postsSource; delete best.__postsUnavailableReason; delete best.__postsPipelineDebug;
      // Diagnostic-only field; stripped here so the CRM payload shape is
      // unchanged. (It has no `__` prefix, so the deletes above miss it.)
      delete best.experienceDebug;
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

  // Experience — same collapsible behaviour as About and Recent Posts.
  const toggleExperience = document.getElementById('toggleExperience');
  const experienceSection = document.getElementById('experienceSection');
  const experienceToggleIcon = document.getElementById('experienceToggleIcon');

  if (toggleExperience && experienceSection) {
    toggleExperience.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = experienceSection.style.display === 'none';
      experienceSection.style.display = isHidden ? 'block' : 'none';
      if (experienceToggleIcon) experienceToggleIcon.textContent = isHidden ? '▼' : '▶';
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


// `scrapeLinkedInProfile` now lives in linkedin-profile-scraper.js, loaded
// before this file by linkedIn.html and shared with the background service
// worker (which injects the same extractor for the "QuikCRM Connect" button).
// Moved verbatim — behaviour is unchanged.

/**
 * Is `url` a LinkedIn company page?
 *
 * Parsed with the URL API rather than string matching. The previous check was
 * `tab.url.includes('linkedin.com/sales/company/')`, which accepted ONLY Sales
 * Navigator and therefore rejected every standard company page —
 * https://www.linkedin.com/company/quikit/ always threw "Please navigate to a
 * LinkedIn company profile page".
 *
 * Accepts, on any LinkedIn host (www, in, uk, …):
 *   /company/<slug>            /company/<slug>/
 *   /company/<slug>/about/     …and any other sub-tab
 *   /school/<slug>             (LinkedIn models schools as company pages)
 *   /showcase/<slug>           (showcase pages)
 *   /sales/company/<id>        (Sales Navigator — still supported)
 */
function isLinkedInCompanyUrl(url) {
  if (!isLinkedInUrl(url)) return false;
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch (e) {
    // Not parseable as an absolute URL — fall back to the raw string so a
    // protocol-less value still works.
    pathname = String(url || '');
  }
  return /^\/(?:sales\/)?(?:company|school|showcase)\/[^/]+/i.test(pathname);
}

/**
 * Canonical /about/ URL for any company sub-tab.
 *
 * /company/microsoft/posts/?feedView=all → /company/microsoft/about/
 * Returns '' when the URL is not a company page.
 */
function buildCompanyAboutUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/((?:sales\/)?(?:company|school|showcase))\/([^/]+)/i);
    if (!m) return '';
    return `${u.origin}/${m[1]}/${m[2]}/about/`;
  } catch (e) {
    return '';
  }
}

/**
 * Load a company's /about/ page in a background tab and scrape it.
 *
 * Mirrors fetchPostsFromActivityPage: open inactive, wait for a real
 * navigation (tabs.create resolves while the tab is still about:blank), inject
 * the shared scraper, then always close the tab in `finally`.
 *
 * Returns the scraped object, or null when the page could not be loaded — the
 * caller then keeps whatever the visible tab produced.
 */
async function fetchCompanyFromAboutPage(aboutUrl) {
  let tab = null;
  const startedAt = Date.now();
  try {
    tab = await chrome.tabs.create({ url: aboutUrl, active: false });

    // Wait for the navigation to actually commit AND the document to finish.
    const TIMEOUT_MS = 15000;
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < TIMEOUT_MS) {
      const t = await chrome.tabs.get(tab.id).catch(() => null);
      if (!t) break;
      if (t.status === 'complete' && t.url && t.url.indexOf('/about') !== -1) {
        const rs = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => document.readyState,
        }).then((r) => r && r[0] && r[0].result).catch(() => null);
        if (rs === 'complete') { ready = true; break; }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) {
      console.log(`[COMPANY] about-page did not finish loading within ${TIMEOUT_MS}ms`);
      return null;
    }

    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: scrapeLinkedInCompany,
    });
    const data = res && res[0] ? res[0].result : null;
    console.log(
      `[COMPANY] about-page scrape: name="${data && data.name}" ` +
      `source=${data && data.__source} in ${Date.now() - startedAt}ms`,
    );
    return data || null;
  } catch (e) {
    console.log('[COMPANY] about-page fetch failed:', e && e.message);
    return null;
  } finally {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }
    }
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
  
  const startedAt = Date.now();
  try {
    // Resolve the tab the same way the profile flow does: the side panel's own
    // window can win `currentWindow`, which returns a tab with no URL.
    const tab = await getActiveLinkedInTab();
    console.log('[COMPANY] Current URL:', tab && tab.url);

    if (!tab || !tab.id) {
      const err = new Error('Could not find the active LinkedIn tab. Click the page, then try again.');
      err.code = 'NO_TAB';
      throw err;
    }

    if (!isLinkedInCompanyUrl(tab.url)) {
      console.log('[COMPANY] Company Page Detected: false');
      const err = new Error('Current page is not a LinkedIn company page.');
      err.code = 'INVALID_PAGE';
      throw err;
    }
    console.log('[COMPANY] Company Page Detected: true');

    console.log('[COMPANY] Extraction Started on tab:', tab.url);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: scrapeLinkedInCompany
    });

    let companyData = results && results[0] ? results[0].result : null;

    // Sub-tabs (/posts/, /jobs/, /people/) do not render the company top card,
    // so a scrape there yields little or nothing — the live /posts/ run returned
    // no name and no about in 703ms. The full record lives on the /about/ page,
    // so fetch it in a background tab and merge. This is the same pattern the
    // profile flow uses for /recent-activity/, and it means the user does not
    // have to navigate to a specific tab first.
    const isThin = !companyData ||
      !companyData.name ||
      !companyData.about ||
      !companyData.industry;
    const aboutUrl = buildCompanyAboutUrl(tab.url);
    if (isThin && aboutUrl && aboutUrl !== tab.url.split('?')[0]) {
      console.log('[COMPANY] Fallback layer: current tab was thin — fetching', aboutUrl);
      const viaAbout = await fetchCompanyFromAboutPage(aboutUrl);
      if (viaAbout) {
        // The current tab still wins for anything it DID find (it is the page
        // the user is looking at); the About page fills the gaps.
        const merged = Object.assign({}, viaAbout, companyData || {});
        Object.keys(merged).forEach((k) => {
          if ((merged[k] === '' || merged[k] === null || merged[k] === undefined) && viaAbout[k]) {
            merged[k] = viaAbout[k];
          }
        });
        // Posts: prefer whichever page actually captured some.
        if ((!merged.posts || !merged.posts.length) && viaAbout.posts && viaAbout.posts.length) {
          merged.posts = viaAbout.posts;
        }
        merged.__source = [companyData && companyData.__source, viaAbout.__source]
          .filter((x) => x && x !== 'none').join('+') || 'none';
        companyData = merged;
        console.log('[COMPANY] Fallback layer used: about-page');
      }
    }

    if (!companyData || (!companyData.name && !companyData.about)) {
      const err = new Error('Unable to extract company information.');
      err.code = 'SCRAPER_FAILED';
      throw err;
    }

    console.log('[COMPANY] Extraction Source:', companyData.__source || 'dom');
    console.log('[COMPANY] Company Name:', companyData.name || '(none)');
    console.log('[COMPANY] Followers:', companyData.followers || '(none)');
    console.log('[COMPANY] Posts Found:', Array.isArray(companyData.posts) ? companyData.posts.length : 0);

    // MERGE, never replace: the prospect data already in the form must survive.
    // `extractedCompanyData` is a separate global from the profile fields, and
    // the save payload reads both — so company data is additive by construction.
    extractedCompanyData = Object.assign({}, extractedCompanyData || {}, companyData);
    displayCompanyData(extractedCompanyData);

    console.log(`[COMPANY] Extraction Completed | Execution Time: ${Date.now() - startedAt}ms`);
    if (statusEl) statusEl.innerHTML = '<span style="color: #10b981;">✓ Company details extracted successfully!</span>';
    showToast('Company details extracted successfully!', 'success');
    return { success: true, data: extractedCompanyData };
  } catch (error) {
    const code = error && error.code ? error.code : 'SCRAPER_FAILED';
    const message = (error && error.message) || 'Unable to extract company information.';
    console.error(`[COMPANY] Extraction failed [${code}] after ${Date.now() - startedAt}ms:`, message);
    if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">✗ ${message}</span>`;
    showToast(message, 'error');
    return { success: false, code, message };
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = originalText;
  }
}

function displayCompanyData(companyData) {
  const displayEl = document.getElementById('companyDataDisplay');
  if (!displayEl) return;
  
  // `set` tolerates a missing element, so the panel's markup can evolve without
  // this throwing and aborting the rest of the render.
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '-';
  };

  set('companyName', companyData.name);
  set('companyIndustry', companyData.industry);
  set('companySize', companyData.companySize);
  // `headquarters` is the canonical field; `location` is the legacy alias the
  // scraper still populates for backward compatibility.
  set('companyLocation', companyData.headquarters || companyData.location);
  set('companyWebsite', companyData.website);

  // Fields the richer scraper now returns. Rendered into the existing
  // free-text rows so no markup change is needed: the old
  // revenueSources/challenges/competitiveLandscape fields are no longer
  // produced by the scraper, and leaving them blank would waste the space.
  const overview = [
    companyData.tagline ? `Tagline: ${companyData.tagline}` : '',
    companyData.founded ? `Founded: ${companyData.founded}` : '',
    companyData.followers ? `Followers: ${companyData.followers}` : '',
    companyData.employees ? `Employees: ${companyData.employees}` : '',
    companyData.specialties ? `Specialties: ${companyData.specialties}` : '',
  ].filter(Boolean).join(' · ');
  set('companyRevenueSources', overview);

  const aboutEl = document.getElementById('companyChallenges');
  if (aboutEl) {
    aboutEl.textContent = companyData.about || '-';
  }

  const postsEl = document.getElementById('companyCompetitiveLandscape');
  if (postsEl) {
    const posts = Array.isArray(companyData.posts) ? companyData.posts : [];
    postsEl.textContent = posts.length
      ? `${posts.length} post(s) found` +
        (posts[0] && posts[0].text ? ` — latest: "${posts[0].text.slice(0, 80)}"` : '')
      : '-';
  }

  displayEl.style.display = 'block';
  console.log('[COMPANY] Extracted fields:', {
    name: companyData.name, headline: companyData.tagline, industry: companyData.industry,
    website: companyData.website, headquarters: companyData.headquarters,
    companySize: companyData.companySize, founded: companyData.founded,
    specialties: companyData.specialties, followers: companyData.followers,
    employees: companyData.employees, logo: !!companyData.logo, banner: !!companyData.banner,
    companyUrl: companyData.companyUrl,
    about: companyData.about ? `${companyData.about.length} chars` : '(none)',
    posts: Array.isArray(companyData.posts) ? companyData.posts.length : 0,
  });
}

// ===========================================================================
// PROSPECT SELECTOR (existing-prospect flow)
//
// Default state is "New Prospect", which leaves the original extract → save
// flow byte-for-byte unchanged. Selecting an existing prospect switches the
// panel into an existing-prospect mode that fetches by CRM id and blocks a
// save when the open LinkedIn profile is a different person.
//
// Nothing here touches the conversation extractor: `scrapeLinkedInConversation`
// is invoked exactly as the New-Prospect flow invokes it.
// ===========================================================================

/** Cached prospect list, per org (prospects are org-scoped, like ICPs). */
let prospectOptionsCache = [];
let prospectsLoadedForOrgId = null;
/** Full record of the currently selected prospect; null in New-Prospect mode. */
let selectedProspect = null;

/** Normalise a LinkedIn profile URL for comparison: host + /in/<slug>. */
function normalizeLinkedInProfileUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, 'https://www.linkedin.com');
    const m = u.pathname.match(/\/in\/([^/]+)/i);
    // Trailing slashes, query strings, locale subdomains and case all vary
    // between what the extension scrapes and what was saved, so compare only
    // the stable public-identifier segment.
    return m ? decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, '') : '';
  } catch (e) {
    return '';
  }
}

/** Drop the cached list + selection when the active org changes. */
function resetProspectSelector() {
  prospectOptionsCache = [];
  prospectsLoadedForOrgId = null;
  selectedProspect = null;
  const sel = document.getElementById('prospectSelect');
  if (sel) sel.value = '';
  applyProspectMode();
}

/**
 * Show either the New-Prospect UI (the original screen) or the
 * existing-prospect panel. Called on every selection change.
 */
function applyProspectMode() {
  const panel = document.getElementById('existingProspectPanel');
  const fetchSection = document.getElementById('fetchsection');
  const slidingWarning = document.querySelector('.sliding-warning');
  const isExisting = Boolean(selectedProspect);

  if (panel) panel.style.display = isExisting ? 'block' : 'none';
  // The original extract button and its hint belong to the New-Prospect flow.
  if (fetchSection) fetchSection.style.display = isExisting ? 'none' : '';
  if (slidingWarning) slidingWarning.style.display = isExisting ? 'none' : '';

  if (isExisting) {
    void refreshProspectMismatchState();
  } else {
    const warn = document.getElementById('prospectMismatchWarning');
    if (warn) warn.style.display = 'none';
  }
}

/** Load the org's prospects once per org and populate the dropdown. */
async function loadProspectOptions() {
  const sel = document.getElementById('prospectSelect');
  const hint = document.getElementById('prospectSelectHint');
  if (!sel) return;

  const selectedOrg = await getSelectedOrganization();
  const orgId = selectedOrg && selectedOrg.id ? selectedOrg.id : '';
  if (prospectsLoadedForOrgId === (orgId || '__default__') && prospectOptionsCache.length > 0) return;

  try {
    if (hint) hint.textContent = 'Loading prospects…';
    sel.disabled = true;
    const endpoint = orgId
      ? `/api/extension-auth/prospects?orgId=${encodeURIComponent(orgId)}`
      : '/api/extension-auth/prospects';
    const res = await window.apiFetch(endpoint);
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error((result && result.error) || 'Failed to load prospects');
    }

    prospectOptionsCache = Array.isArray(result.data && result.data.prospects)
      ? result.data.prospects
      : [];
    prospectsLoadedForOrgId = orgId || '__default__';

    // Rebuild options, always keeping "New Prospect" first so the default
    // (and therefore the original flow) is what a user lands on.
    sel.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— New Prospect —';
    sel.appendChild(blank);
    prospectOptionsCache.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const bits = [p.name || '(unnamed)'];
      if (p.company) bits.push(p.company);
      opt.textContent = bits.join(' · ');
      sel.appendChild(opt);
    });
    sel.disabled = false;

    if (hint) {
      hint.textContent = prospectOptionsCache.length === 0
        ? 'No prospects saved yet — continue with New Prospect.'
        : `${prospectOptionsCache.length} prospect(s) available.`;
    }
  } catch (err) {
    // Never leave a broken/empty dropdown: keep New Prospect usable and say why.
    console.error('[PROSPECT] load failed:', err && err.message);
    prospectOptionsCache = [];
    prospectsLoadedForOrgId = null;
    sel.disabled = false;
    if (hint) {
      hint.textContent = `Could not load prospects (${(err && err.message) || 'error'}). New Prospect still works.`;
    }
  }
}

/** Fetch one prospect by CRM id and render it. */
async function fetchSelectedProspect(prospectId) {
  const statusEl = document.getElementById('prospectFetchStatus');
  const bodyEl = document.getElementById('selectedProspectBody');
  if (statusEl) statusEl.textContent = 'Loading prospect…';

  try {
    const selectedOrg = await getSelectedOrganization();
    const orgId = selectedOrg && selectedOrg.id ? selectedOrg.id : '';
    const endpoint = `/api/extension-auth/prospects/${encodeURIComponent(prospectId)}` +
      (orgId ? `?orgId=${encodeURIComponent(orgId)}` : '');
    const res = await window.apiFetch(endpoint);
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error((result && result.error) || 'Failed to load prospect');
    }

    selectedProspect = result.data.prospect;
    selectedProspect.__savedMessageCount = result.data.savedMessageCount || 0;
    renderSelectedProspect();
    if (statusEl) statusEl.innerHTML = '<span style="color:#10b981;">✓ Prospect loaded</span>';
    await refreshProspectMismatchState();
    return selectedProspect;
  } catch (err) {
    const msg = (err && err.message) || 'Failed to load prospect';
    console.error('[PROSPECT] fetch failed:', msg);
    if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✗ ${msg}</span>`;
    if (bodyEl) bodyEl.innerHTML = '<div style="color:#ef4444;">Could not load this prospect.</div>';
    return null;
  }
}

/** Render the selected prospect's fields. textContent only — CRM data is text. */
function renderSelectedProspect() {
  const bodyEl = document.getElementById('selectedProspectBody');
  if (!bodyEl || !selectedProspect) return;
  bodyEl.textContent = '';

  const row = (label, value, isLink) => {
    if (!value) return;
    const d = document.createElement('div');
    const b = document.createElement('strong');
    b.textContent = `${label}: `;
    d.appendChild(b);
    if (isLink) {
      const a = document.createElement('a');
      a.href = value;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = value;
      a.style.color = '#2563eb';
      a.style.wordBreak = 'break-all';
      d.appendChild(a);
    } else {
      d.appendChild(document.createTextNode(value));
    }
    bodyEl.appendChild(d);
  };

  row('Name', selectedProspect.name);
  row('Title', selectedProspect.title);
  row('Company', selectedProspect.company);
  row('Email', selectedProspect.email);
  row('LinkedIn', selectedProspect.linkedinUrl, true);
  row('Status', selectedProspect.status);

  // Saved/extracted/delta line and the incremental Save button are owned by
  // updateConversationSaveState so the two can never disagree.
  updateConversationSaveState();
}

/**
 * Compare the LinkedIn profile currently open in the tab against the selected
 * prospect. On mismatch the warning is shown and Save to CRM is blocked.
 */
async function refreshProspectMismatchState() {
  const warn = document.getElementById('prospectMismatchWarning');
  if (!warn || !selectedProspect) return true;

  let currentUrl = '';
  try {
    const tab = await getActiveLinkedInTab();
    currentUrl = (tab && tab.url) || '';
  } catch (e) { /* tab unavailable */ }

  const currentSlug = normalizeLinkedInProfileUrl(currentUrl);
  const prospectSlug = normalizeLinkedInProfileUrl(selectedProspect.linkedinUrl);

  // Unknown on either side is NOT treated as a match: without both slugs we
  // cannot prove they are the same person, and silently saving would be the
  // exact data-integrity hazard this guard exists to prevent.
  const matches = Boolean(currentSlug) && Boolean(prospectSlug) && currentSlug === prospectSlug;

  if (matches) {
    warn.style.display = 'none';
  } else {
    const curEl = document.getElementById('mismatchCurrentUrl');
    const proEl = document.getElementById('mismatchProspect');
    if (curEl) curEl.textContent = currentUrl || '(no LinkedIn profile open)';
    if (proEl) {
      proEl.textContent = `${selectedProspect.name || '(unnamed)'} — ` +
        `${selectedProspect.linkedinUrl || '(no LinkedIn URL saved)'}`;
    }
    warn.style.display = 'block';
  }
  return matches;
}

/**
 * "Open Conversation" — navigate to the prospect's profile when the tab is
 * showing someone else, then run the EXISTING extractor unchanged.
 */
async function openConversationForSelectedProspect() {
  const statusEl = document.getElementById('existingConversationStatus');
  if (!selectedProspect) return;

  const target = selectedProspect.linkedinUrl;
  if (!target) {
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#ef4444;">✗ This prospect has no LinkedIn URL saved.</span>';
    }
    return;
  }

  try {
    const tab = await getActiveLinkedInTab();
    const currentSlug = normalizeLinkedInProfileUrl(tab && tab.url);
    const wantSlug = normalizeLinkedInProfileUrl(target);

    if (!tab || !tab.id) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">✗ No active browser tab.</span>';
      return;
    }

    // Navigate only when we are on a different profile; re-navigating the page
    // the user is already on would needlessly reload it.
    if (currentSlug !== wantSlug) {
      if (statusEl) statusEl.textContent = 'Opening the prospect’s LinkedIn profile…';
      await chrome.tabs.update(tab.id, { url: target });
      // Wait for the SPA to finish loading before the extractor runs.
      const started = Date.now();
      while (Date.now() - started < 20000) {
        await new Promise((r) => setTimeout(r, 500));
        const t = await chrome.tabs.get(tab.id).catch(() => null);
        if (t && t.status === 'complete') break;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Hand off to the existing extractor. It opens the messaging panel itself
    // (openMessagingPanel) and reports "No open LinkedIn conversation found."
    // when it cannot — which is the fallback behaviour required here.
    await extractConversationFromPage({ intoExistingPanel: true });
  } catch (err) {
    const msg = (err && err.message) || 'Could not open the conversation';
    console.error('[PROSPECT] open conversation failed:', msg);
    if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✗ ${msg}</span>`;
  }
}

/**
 * Single owner of the saved / extracted / delta display in the existing-prospect
 * panel, including whether the incremental Save button is shown.
 *
 * Rules:
 *   extracted > saved  → "+N new message(s)" + [Save New Messages to CRM]
 *   extracted === saved → "✓ N message(s) already saved in CRM.", no button
 *   nothing extracted   → saved count only, no button
 *
 * The comparison is deliberately count-based rather than content-based: the
 * server performs the authoritative sequence alignment when the save runs, so
 * this only decides whether it is worth offering the action.
 */
function updateConversationSaveState() {
  const info = document.getElementById('savedConversationInfo');
  const row = document.getElementById('conversationDeltaRow');
  const deltaInfo = document.getElementById('conversationDeltaInfo');
  if (!info || !row) return;

  const saved = (selectedProspect && selectedProspect.__savedMessageCount) || 0;
  const extracted =
    extractedConversationData && Array.isArray(extractedConversationData.messages)
      ? extractedConversationData.messages.length
      : 0;

  const lines = [];
  if (saved > 0) lines.push(`${saved} message(s) already saved in CRM.`);
  else lines.push('No conversation saved in CRM for this prospect yet.');
  if (extracted > 0) lines.push(`${extracted} message(s) extracted`);

  const newCount = extracted - saved;

  if (extracted > 0 && newCount > 0) {
    info.textContent = lines.join(' ');
    if (deltaInfo) deltaInfo.textContent = `+ ${newCount} new message(s)`;
    row.style.display = 'block';
  } else if (extracted > 0 && newCount <= 0) {
    // Extracted and saved agree (or the extractor returned FEWER, which happens
    // when LinkedIn virtualises older history out of the DOM — there is nothing
    // new to append either way, so the action is hidden rather than offering a
    // save that would append nothing).
    info.textContent = `✓ ${saved} message(s) already saved in CRM.`;
    row.style.display = 'none';
  } else {
    info.textContent = lines.join(' ');
    row.style.display = 'none';
  }
}

/**
 * Save ONLY the new messages for the selected prospect.
 *
 * Posts the full extracted thread to the existing endpoint; the server's
 * incremental merge appends just the tail after the last already-saved message
 * (51 → 55, never 51 → 106). Nothing about extraction is touched here.
 */
async function saveNewMessagesToCrm() {
  const btn = document.getElementById('saveNewMessagesBtn');
  const statusEl = document.getElementById('existingConversationStatus');
  if (!btn || !selectedProspect || !selectedProspect.id) return;
  // Guard against double submission: the button is disabled for the whole
  // request and restored in `finally`.
  if (btn.disabled) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  if (statusEl) statusEl.textContent = 'Saving new messages…';

  try {
    if (!extractedConversationData ||
        !Array.isArray(extractedConversationData.messages) ||
        !extractedConversationData.messages.length) {
      throw new Error('No extracted conversation to save. Run Fetch Conversation first.');
    }

    const selectedOrg = await getSelectedOrganization();
    const orgId = selectedOrg && selectedOrg.id ? selectedOrg.id : '';

    // Minimal payload: the prospect id targets the existing record (no
    // duplicate) and the conversation is merged server-side. Profile scalars
    // are deliberately omitted so this action cannot overwrite CRM fields with
    // whatever page happens to be open.
    const payload = {
      prospectId: selectedProspect.id,
      name: selectedProspect.name || undefined,
      linkedinConversation: extractedConversationData,
    };
    if (orgId) payload.orgId = orgId;

    const response = await window.apiFetch('/api/leads/from-linkedin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error((result && result.error) || 'Save failed');
    }

    const conv = result.conversation || {};
    const appended = typeof conv.appended === 'number' ? conv.appended : 0;
    const total = typeof conv.total === 'number' ? conv.total : selectedProspect.__savedMessageCount;

    // Refresh the saved count immediately from the server's own figure.
    selectedProspect.__savedMessageCount = total;
    updateConversationSaveState();

    if (statusEl) {
      statusEl.innerHTML = appended === 0
        ? '<span style="color:#6b7280;">No new messages to save.</span>'
        : `<span style="color:#10b981;">✓ ${appended} new message(s) saved (${total} total)</span>`;
    }
    showToast(
      appended === 0
        ? 'No new messages to save'
        : `${appended} new message(s) saved to CRM`,
      'success',
    );
  } catch (err) {
    const msg = (err && err.message) || 'Could not save messages';
    console.error('[CONVO] incremental save failed:', msg);
    if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✗ ${msg}</span>`;
    showToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/** Render extracted/saved messages inside the existing-prospect panel. */
function renderExistingPanelConversation(messages) {
  const listEl = document.getElementById('existingConversationMessages');
  if (!listEl) return;
  listEl.textContent = '';
  if (!messages || !messages.length) {
    listEl.style.display = 'none';
    updateConversationSaveState();
    return;
  }
  listEl.style.display = 'flex';

  messages.forEach((m) => {
    const sent = m.direction === 'sent';
    const row = document.createElement('div');
    row.style.cssText =
      'padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.45; max-width: 90%;' +
      (sent
        ? ' background: #eff6ff; color: #1e3a8a; align-self: flex-end;'
        : ' background: #f9fafb; color: #374151; align-self: flex-start;');

    const head = document.createElement('div');
    head.style.cssText = 'font-size: 11px; color: #6b7280; margin-bottom: 2px;';
    head.textContent = [m.senderName || 'Unknown', m.time || null].filter(Boolean).join(' · ');
    row.appendChild(head);

    // textContent, never innerHTML — message bodies are attacker-controlled.
    const body = document.createElement('div');
    body.textContent = m.text || '(no text)';
    row.appendChild(body);

    listEl.appendChild(row);
  });

  // Recompute now that extractedConversationData holds a fresh thread — this is
  // what reveals the Save button when the extraction found new messages.
  updateConversationSaveState();
}

/** Wire the selector + existing-prospect actions. Called once at init. */
function wireProspectSelector() {
  const sel = document.getElementById('prospectSelect');
  if (sel && sel.dataset.wired !== '1') {
    sel.dataset.wired = '1';
    sel.addEventListener('change', async () => {
      const id = sel.value;
      if (!id) {
        // Back to the original New-Prospect flow.
        selectedProspect = null;
        applyProspectMode();
        return;
      }
      selectedProspect = { id };          // provisional, so the panel opens
      applyProspectMode();
      await fetchSelectedProspect(id);
    });
  }

  const fetchBtn = document.getElementById('fetchProspectDataBtn');
  if (fetchBtn && fetchBtn.dataset.wired !== '1') {
    fetchBtn.dataset.wired = '1';
    fetchBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (selectedProspect && selectedProspect.id) {
        await fetchSelectedProspect(selectedProspect.id);
      }
    });
  }

  const convoBtn = document.getElementById('fetchConversationBtn');
  if (convoBtn && convoBtn.dataset.wired !== '1') {
    convoBtn.dataset.wired = '1';
    convoBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      // Straight to the existing extractor — no scraping logic duplicated here.
      await extractConversationFromPage({ intoExistingPanel: true });
    });
  }

  const saveNewBtn = document.getElementById('saveNewMessagesBtn');
  if (saveNewBtn && saveNewBtn.dataset.wired !== '1') {
    saveNewBtn.dataset.wired = '1';
    saveNewBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveNewMessagesToCrm();
    });
  }

  const openBtn = document.getElementById('openConversationBtn');
  if (openBtn && openBtn.dataset.wired !== '1') {
    openBtn.dataset.wired = '1';
    openBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await openConversationForSelectedProspect();
    });
  }

  const selectCorrect = document.getElementById('mismatchSelectCorrect');
  if (selectCorrect && selectCorrect.dataset.wired !== '1') {
    selectCorrect.dataset.wired = '1';
    selectCorrect.addEventListener('click', (e) => {
      e.preventDefault();
      const s = document.getElementById('prospectSelect');
      if (s) { s.focus(); s.size = Math.min(8, s.options.length); }
    });
  }

  const useNew = document.getElementById('mismatchUseNew');
  if (useNew && useNew.dataset.wired !== '1') {
    useNew.dataset.wired = '1';
    useNew.addEventListener('click', (e) => {
      e.preventDefault();
      const s = document.getElementById('prospectSelect');
      if (s) s.value = '';
      selectedProspect = null;
      applyProspectMode();
      showToast('Switched to New Prospect', 'success');
    });
  }
}

// ===========================================================================
// CONVERSATION EXTRACTION (user-initiated only)
//
// Kept entirely separate from extractLinkedInData(): different button,
// different injected function, different global. Nothing here runs during
// profile or company scraping.
// ===========================================================================

// Last successful conversation scrape, merged into the save payload alongside
// `extractedCompanyData`. Null until the user clicks Extract Conversation.
let extractedConversationData = null;

/**
 * @param {{intoExistingPanel?: boolean}} [opts] When called from the
 *   existing-prospect panel, status and results are rendered there instead of
 *   in the New-Prospect conversation card. This is UI ROUTING ONLY — the
 *   extraction itself (injection, shadow DOM, scrolling, grouping, body
 *   extraction, sender/timestamp detection, dedupe) is completely unchanged.
 */
async function extractConversationFromPage(opts) {
  const intoExisting = Boolean(opts && opts.intoExistingPanel);
  const btn = intoExisting
    ? document.getElementById('fetchConversationBtn')
    : document.getElementById('extractConversationBtn');
  const statusEl = intoExisting
    ? document.getElementById('existingConversationStatus')
    : document.getElementById('conversationExtractionStatus');
  if (!btn) return;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Loading full history...';
  if (statusEl) statusEl.textContent = 'Opening the conversation and loading older messages...';

  const startedAt = Date.now();
  try {
    const tab = await getActiveLinkedInTab();
    if (!tab || !tab.id) {
      const err = new Error('Could not find the active LinkedIn tab. Click the page, then try again.');
      err.code = 'NO_TAB';
      throw err;
    }
    if (!isLinkedInUrl(tab.url)) {
      const err = new Error('Open a LinkedIn page with the message thread visible, then try again.');
      err.code = 'INVALID_PAGE';
      throw err;
    }

    console.log('[CONVO] Extraction started on tab:', tab.url);

    // ── LOCATION PROBE (read-only, runs before extraction) ────────────────
    // Answers "where does the visible conversation actually live?" — top frame
    // vs iframe vs shadow DOM. Printed panel-side because the injected
    // function's own console.log goes to the PAGE console, not this one.
    try {
      const probeRes = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        function: probeLinkedInConversationLocation,
      });
      console.log('[CONVO][PROBE] ===== conversation location report =====');
      (probeRes || []).forEach((entry, i) => {
        const p = entry && entry.result;
        if (!p) {
          console.log(`[CONVO][PROBE][frame ${i}] frameId=${entry && entry.frameId} result=null`);
          return;
        }
        console.log(
          `[CONVO][PROBE][frame ${i}] frameId=${entry.frameId} top=${p.isTopFrame}` +
          ` lightDomEls=${p.totalElementsLightDom} roots=${p.rootsFound}` +
          ` shadowRoots=${p.shadowRoots.length} iframes=${p.iframes.length}` +
          ` frames=${p.framesLength}`
        );
        console.log(`[CONVO][PROBE][frame ${i}] text presence:`, p.textPresence);
        if (p.shadowRoots.length) {
          console.log(`[CONVO][PROBE][frame ${i}] shadow roots:`, p.shadowRoots);
        }
        if (p.composerElements.length) {
          console.log(`[CONVO][PROBE][frame ${i}] COMPOSER found in:`, p.composerElements);
        }
        if (p.messageElements.length) {
          console.log(`[CONVO][PROBE][frame ${i}] MESSAGES found in:`, p.messageElements);
        }
        if (p.iframes.length) {
          console.log(`[CONVO][PROBE][frame ${i}] iframes:`, p.iframes);
        }
      });
      console.log('[CONVO][PROBE] ========================================');
    } catch (e) {
      console.warn('[CONVO][PROBE] probe failed:', e && e.message);
    }

    // The messaging overlay is rendered by LinkedIn's own SPA in the TOP frame.
    // The other frames on a profile page are ad/tracking iframes (about:blank,
    // /tscp-serving/dtag) that can never hold a conversation — injecting into
    // them only produced noise and buried the real frame's diagnostics. Start
    // with the top frame; fall back to all frames only if it finds nothing.
    const runIn = async (target, label) => {
      const res = await chrome.scripting.executeScript({
        target,
        function: scrapeLinkedInConversation,
      });
      console.log(`[CONVO] injected into ${label}: ${(res || []).length} frame result(s)`);
      return res || [];
    };

    let results = await runIn({ tabId: tab.id }, 'top frame');

    const pick = (list) => {
      let b = null;
      let bCount = -1;
      (list || []).forEach((entry) => {
        const r = entry && entry.result;
        const count = r && r.conversation && Array.isArray(r.conversation.messages)
          ? r.conversation.messages.length
          : -1;
        if (count > bCount) { bCount = count; b = r; }
      });
      return b;
    };

    let best = pick(results);

    if (!best || !best.conversation) {
      console.log('[CONVO] top frame found no conversation — retrying across all frames');
      const allResults = await runIn({ tabId: tab.id, allFrames: true }, 'all frames');
      results = results.concat(allResults);
      best = pick(allResults) || best;
    }

    // Surface EVERY frame's diagnostics in the panel console. The scraper's own
    // console.log calls land in the PAGE's console (and each iframe's), not
    // here — so on failure this was previously a silent black box.
    (results || []).forEach((entry, i) => {
      const r = entry && entry.result;
      if (!r) {
        console.log(`[CONVO][frame ${i}] frameId=${entry && entry.frameId} result=null`);
        return;
      }
      const fd = r.diagnostics || {};
      console.log(
        `[CONVO][frame ${i}] frameId=${entry.frameId} build=${fd.build || '(none)'}` +
        ` url=${fd.pageUrl || '?'} messages=${fd.messagesLoaded || 0}` +
        ` candidates=${fd.candidatesFound || 0} openedVia=${fd.openedVia || '-'}` +
        ` reason=${fd.reason || '-'}`
      );
      if (fd.liveDom) {
        console.log(`[CONVO][frame ${i}] LIVE-DOM report:`, fd.liveDom);
      }
      // Group-structure diagnostic. The scraper's own console.log calls land in
      // the PAGE console, so the report is returned and printed here too.
      if (fd.liveGroupReport) {
        const r = fd.liveGroupReport;
        console.log(`[CONVO][LIVE-DIAGNOSTIC] selected panel: ${r.panel} | groups: ${r.groupCount} | inspected: ${r.groups.length}`);
        // Time range + one-line text of every mounted group. If these are all
        // from the tail of the thread, the older history is not in the DOM and
        // the bottleneck is scrolling/virtualisation, not parsing.
        if (r.groupTimeRange) {
          console.log('[CONVO][LIVE-DIAGNOSTIC] timestamps of ALL mounted groups:', r.groupTimeRange);
        }
        if (r.groupTexts) {
          console.log('[CONVO][LIVE-DIAGNOSTIC] text of ALL mounted groups:', r.groupTexts);
        }
        r.groups.forEach((g, gi) => {
          console.log(`[CONVO][LIVE-GROUP ${gi}] sender=${g.sender} timestamp=${g.timestamp} tag=${g.tag} children=${g.childElementCount}`);
          console.log(`[CONVO][LIVE-GROUP ${gi}] class="${g.cls}"`);
          console.log(`[CONVO][LIVE-GROUP ${gi}] text="${g.text}"`);
          console.log(`[CONVO][LIVE-GROUP ${gi}] own-text descendants (${g.ownTextDescendants.length}):`, g.ownTextDescendants);
        });
        if (r.multiBodyProbe) {
          console.log('[CONVO][MULTI-BODY-PROBE] group text:', r.multiBodyProbe.text);
          console.log('[CONVO][MULTI-BODY-PROBE] selector counts:', r.multiBodyProbe.selectorCounts);
          console.log('[CONVO][MULTI-BODY-PROBE] own-text descendants:', r.multiBodyProbe.ownTextDescendants);
        } else {
          console.log('[CONVO][MULTI-BODY-PROBE] no multi-message group identified');
        }
        console.log('[CONVO][LIVE-DIAGNOSTIC] END');
      }
      // Scroll diagnostic: whether the element being scrolled can actually
      // scroll, and what happened on each round.
      if (fd.scrollDiag) {
        console.log('[CONVO][SCROLL-DIAG] ===== scroller census =====');
        console.log('[CONVO][SCROLL-DIAG] chosen scroller:', fd.scrollDiag.chosen);
        console.log('[CONVO][SCROLL-DIAG] scrollable candidates INSIDE panel:', fd.scrollDiag.scrollablesInPanel);
        console.log('[CONVO][SCROLL-DIAG] scrollable ANCESTORS of panel:', fd.scrollDiag.scrollableAncestors);
        console.log('[CONVO][SCROLL-DIAG] sentinel/loader elements:', fd.scrollDiag.sentinels);
        console.log('[CONVO][SCROLL-DIAG] load-more controls:', fd.scrollDiag.loadMoreControls);
        console.log('[CONVO][SCROLL-DIAG] initial mounted groups:', fd.scrollDiag.initialGroupCount);
        console.log('[CONVO][SCROLL-DIAG] initial mounted timestamps (ALL):', fd.scrollDiag.initialTimestamps);
      }
      if (fd.scrollLog) {
        console.log('[CONVO][SCROLL-DIAG] per-round log:', fd.scrollLog);
      }
      if (fd.scrollBidirectional) {
        console.log('[CONVO][SCROLL-DIAG] bidirectional probe (all scrollable candidates):', fd.scrollBidirectional);
      }
      if (fd.scrollVerdict) {
        const v = fd.scrollVerdict;
        console.log('[CONVO][SCROLL-DIAG][VERDICT]');
        console.log('  scrollerMoves             =', v.scrollerMoves);
        console.log('  mountedGroupsChange       =', v.mountedGroupsChange);
        console.log('  timestampsSpanFullHistory =', v.timestampsSpanFullHistory);
        console.log('  olderHistoryLoaded        =', v.olderHistoryLoaded);
        console.log('  uniqueTimestamps          =', v.uniqueTimestamps);
        console.log('  likelyCause               =', v.likelyCause);
      }
    });

    if (!best || !best.conversation) {
      const err = new Error((best && best.error) || 'No open LinkedIn conversation found.');
      err.code = 'NO_CONVERSATION';
      throw err;
    }

    const d = best.diagnostics || {};
    console.log('[CONVO] thread id            :', d.threadId || '(none)');
    console.log('[CONVO] opened via           :', d.openedVia || '(already open)');
    console.log('[CONVO] panel source         :', d.panelSource || '(none)');
    console.log('[CONVO] scroll rounds        :', d.scrollRounds);
    console.log('[CONVO] raw event DOM nodes (overlapping)      :', d.rawEventNodes || 0);
    console.log('[CONVO] message group DOM nodes (deduped)      :', d.logicalGroups != null ? d.logicalGroups : d.messagesFound);
    console.log('[CONVO] candidate body nodes                   :', d.candidateBodyNodes || 0);
    console.log('[CONVO] canonical message bodies               :', d.canonicalBodies || 0);
    console.log('[CONVO] accessibility/visual duplicates collapsed:', d.duplicateBodiesCollapsed || 0);
    console.log('[CONVO] UI controls excluded                   :', d.uiControlsExcluded || 0);
    console.log('[CONVO] messages returned                      :', d.messagesLoaded);
    console.log('[CONVO] duplicates removed (safety layer)      :', d.duplicatesRemoved);
    console.log('[CONVO] attachments found    :', d.attachmentsFound);
    console.log('[CONVO] completed            :', d.completed);

    extractedConversationData = best.conversation;
    if (intoExisting) {
      renderExistingPanelConversation(best.conversation.messages);
    } else {
      displayConversationData(best.conversation, d);
    }

    const n = best.conversation.messages.length;
    console.log(`[CONVO] Extraction completed | ${n} message(s) | ${Date.now() - startedAt}ms`);
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #10b981;">✓ ${n} message(s) extracted</span>`;
    }
    showToast(`Extracted ${n} message(s)`, 'success');
    return { success: true, data: best.conversation };
  } catch (error) {
    const code = error && error.code ? error.code : 'SCRAPER_FAILED';
    const message = (error && error.message) || 'Unable to extract the conversation.';
    console.error(`[CONVO] Extraction failed [${code}] after ${Date.now() - startedAt}ms:`, message);
    if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">✗ ${message}</span>`;
    showToast(message, 'error');
    return { success: false, code, message };
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function displayConversationData(conversation, diagnostics) {
  const displayEl = document.getElementById('conversationDataDisplay');
  const metaEl = document.getElementById('conversationMeta');
  const listEl = document.getElementById('conversationMessages');
  if (!displayEl || !listEl) return;

  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

  if (metaEl) {
    const parts = [
      conversation.participant && conversation.participant.name
        ? `With ${conversation.participant.name}`
        : null,
      `${messages.length} message(s)`,
      conversation.threadId ? `thread ${conversation.threadId}` : null,
      diagnostics && diagnostics.duplicatesRemoved
        ? `${diagnostics.duplicatesRemoved} duplicate(s) removed`
        : null,
    ].filter(Boolean);
    metaEl.textContent = parts.join(' · ');
  }

  // Rebuild from scratch so a re-extract never appends to the previous run.
  listEl.textContent = '';
  let lastDate = null;
  messages.forEach((m) => {
    if (m.date && m.date !== lastDate) {
      lastDate = m.date;
      const sep = document.createElement('div');
      sep.textContent = m.date;
      sep.style.cssText =
        'text-align: center; font-size: 11px; color: #9ca3af; text-transform: uppercase; margin: 6px 0 2px;';
      listEl.appendChild(sep);
    }

    const sent = m.direction === 'sent';
    const row = document.createElement('div');
    row.style.cssText =
      'padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.45; max-width: 90%;' +
      (sent
        ? ' background: #eff6ff; color: #1e3a8a; align-self: flex-end;'
        : ' background: #f9fafb; color: #374151; align-self: flex-start;');

    const head = document.createElement('div');
    head.style.cssText = 'font-size: 11px; color: #6b7280; margin-bottom: 2px;';
    head.textContent = [m.senderName || 'Unknown', m.time || null].filter(Boolean).join(' · ');
    row.appendChild(head);

    // textContent, never innerHTML — message bodies are attacker-controlled.
    const body = document.createElement('div');
    body.textContent = m.text || '(no text)';
    row.appendChild(body);

    if (Array.isArray(m.attachments) && m.attachments.length) {
      const att = document.createElement('div');
      att.style.cssText = 'font-size: 11px; color: #6b7280; margin-top: 4px;';
      att.textContent = `📎 ${m.attachments.length} attachment(s)`;
      row.appendChild(att);
    }

    listEl.appendChild(row);
  });

  displayEl.style.display = 'block';
}

// Scrape company data from LinkedIn company profile
/**
 * Company-page scraper, injected into the LinkedIn tab by executeScript.
 *
 * Mirrors the profile scraper's architecture deliberately:
 *   - self-contained (it is serialised into the page, so it may not close over
 *     anything from the panel);
 *   - lazy sections are forced to render by scrolling before extraction;
 *   - layered sources, strongest first: Voyager JSON → JSON-LD → DOM → meta.
 *
 * Always returns an object (never throws), with `__source` recording which
 * layers contributed so a thin result can be diagnosed.
 */
async function scrapeLinkedInCompany() {
  // String() coercion is required, not cosmetic: Voyager fields such as
  // `foundedOn.year` and `staffCount` are NUMBERS. Calling .replace on one threw
  // "(t || '').replace is not a function", and because the whole Voyager layer
  // sits in a single try/catch that exception silently abandoned the rest of the
  // block — every field after `founded` (employees, headquarters, logo) was lost.
  const norm = (t) => (t === null || t === undefined ? '' : String(t)).replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sources = [];

  const data = {
    name: '', tagline: '', about: '', industry: '', website: '',
    companySize: '', headquarters: '', founded: '', specialties: '',
    followers: '', employees: '', logo: '', banner: '',
    companyUrl: window.location.href.split('?')[0],
    posts: [],
    // Retained for backward compatibility with the existing panel UI, which
    // reads these field names.
    location: '', revenueSources: '', challenges: [], competitiveLandscape: '',
  };

  // ── Lazy-load: LinkedIn renders About/Posts only when scrolled into view ──
  try {
    const total = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
    );
    const step = Math.max(500, Math.floor(window.innerHeight * 0.9));
    for (let y = 0; y <= total; y += step) {
      window.scrollTo(0, y);
      await sleep(120);
    }
    window.scrollTo(0, total);
    await sleep(300);
    window.scrollTo(0, 0);
    await sleep(150);
  } catch (e) { /* best effort — never block extraction */ }

  const setIfEmpty = (key, value) => {
    const v = norm(value);
    if (v && !data[key]) data[key] = v;
  };

  // ── LAYER 1: Voyager JSON (most authoritative when present) ──
  try {
    const included = [];
    document.querySelectorAll('code, script[type="application/json"]').forEach((n) => {
      const raw = norm(n.textContent);
      if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return;
      if (raw.indexOf('com.linkedin') === -1 && raw.indexOf('"included"') === -1) return;
      let parsed;
      try { parsed = JSON.parse(n.textContent); } catch (e) { return; }
      if (Array.isArray(parsed && parsed.included)) included.push(...parsed.included);
    });

    const isType = (e, sfx) => e && typeof e.$type === 'string' && e.$type.endsWith(sfx);
    const company = included.find((e) => isType(e, '.organization.Company') && e.name);
    if (company) {
      sources.push('voyager');
      setIfEmpty('name', company.name);
      setIfEmpty('tagline', company.tagline);
      setIfEmpty('about', company.description);
      setIfEmpty('website', company.companyPageUrl || company.websiteUrl);
      setIfEmpty('founded', company.foundedOn && company.foundedOn.year);
      if (Array.isArray(company.specialities) && company.specialities.length) {
        setIfEmpty('specialties', company.specialities.join(', '));
      }
      // Assigned directly rather than via setIfEmpty: these are numeric and the
      // helper's `norm()` + truthiness path made the result depend on field
      // ordering within the entity. A direct guarded write is unambiguous.
      if (company.staffCount && !data.employees) {
        data.employees = String(company.staffCount);
      }
      if (company.staffCountRange && !data.companySize) {
        const r = company.staffCountRange;
        const range = [r.start, r.end].filter((x) => x !== undefined && x !== null).join('-');
        if (range) data.companySize = `${range} employees`;
      }
      const hq = company.headquarter || (company.confirmedLocations || [])[0];
      if (hq) {
        setIfEmpty('headquarters', [hq.city, hq.geographicArea, hq.country].filter(Boolean).join(', '));
      }
      if (company.logo && company.logo.image) {
        const arts = (company.logo.image['com.linkedin.common.VectorImage'] || {}).artifacts;
        if (Array.isArray(arts) && arts.length) {
          const root = (company.logo.image['com.linkedin.common.VectorImage'] || {}).rootUrl || '';
          setIfEmpty('logo', root + (arts[arts.length - 1].fileIdentifyingUrlPathSegment || ''));
        }
      }
    }

    const industryEntity = included.find((e) => isType(e, '.common.Industry') && e.localizedName);
    if (industryEntity) setIfEmpty('industry', industryEntity.localizedName);

    const followerEntity = included.find(
      (e) => e && typeof e.followerCount === 'number',
    );
    if (followerEntity) setIfEmpty('followers', String(followerEntity.followerCount));
  } catch (e) { /* fall through to the next layer */ }

  // ── LAYER 2: JSON-LD ──
  try {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((n) => {
      let parsed;
      try { parsed = JSON.parse(n.textContent); } catch (e) { return; }
      const nodes = [].concat(parsed, parsed && parsed['@graph'] ? parsed['@graph'] : []);
      nodes.forEach((o) => {
        if (!o || !/Organization|Corporation/i.test(String(o['@type'] || ''))) return;
        if (!sources.includes('json-ld')) sources.push('json-ld');
        setIfEmpty('name', o.name);
        setIfEmpty('about', o.description);
        setIfEmpty('website', o.sameAs || o.url);
        if (o.address) {
          setIfEmpty('headquarters',
            [o.address.addressLocality, o.address.addressRegion, o.address.addressCountry]
              .filter(Boolean).join(', '));
        }
        if (o.logo) setIfEmpty('logo', typeof o.logo === 'string' ? o.logo : o.logo.contentUrl);
        if (o.numberOfEmployees) {
          const v = o.numberOfEmployees.value || o.numberOfEmployees;
          if (v) setIfEmpty('employees', String(v));
        }
      });
    });
  } catch (e) { /* fall through */ }

  // ── LAYER 3: DOM ──
  try {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el ? norm(el.innerText || el.textContent) : '';
    };

    /**
     * The company NAME.
     *
     * Sub-tabs (/posts/, /jobs/, /people/) do NOT render the company top card,
     * so `document.querySelector('h1')` can miss entirely or — worse — pick up a
     * heading from the feed. On the live /company/microsoft/posts/ page this
     * produced a payload built from a feed post ("Phil Spencer", "Safer Internet
     * Day 2") instead of the company.
     *
     * So the name is read from company-scoped sources first, and a bare h1 is
     * only trusted when it sits inside the organisation top card.
     */
    const companyNameFromDom = () => {
      // 1 — the org top card's own name element.
      const scoped = pick(
        '.org-top-card-summary__title, [class*="org-top-card-summary__title"], ' +
        '.org-top-card-primary-content__title, h1.org-top-card-summary__title'
      );
      if (scoped) return scoped;

      // 2 — an h1 that is genuinely inside the top card / an org container.
      const h1s = Array.from(document.querySelectorAll('h1'));
      const inOrg = h1s.find((h) => h.closest(
        '[class*="org-top-card"], [class*="organization"], [class*="company"]'
      ));
      if (inOrg) return norm(inOrg.innerText || inOrg.textContent);

      // 3 — the left-rail "about this page" module present on every sub-tab.
      const rail = pick('[class*="org-page-navigation"] [class*="title"], aside [class*="org-"] h2');
      if (rail) return rail;

      // 4 — og:title / document.title. Both read "Microsoft" on every company
      //     sub-tab, carry the company's OWN casing, and are never a feed
      //     author's name. Preferred over the URL slug for that reason.
      const og = document.querySelector('meta[property="og:title"]');
      const fromOg = og ? norm(og.getAttribute('content')).replace(/\s*\|\s*LinkedIn.*$/i, '').trim() : '';
      if (fromOg && fromOg.length <= 80) return fromOg;

      const fromTitle = norm(document.title)
        .replace(/\s*\|\s*LinkedIn.*$/i, '')
        .replace(/^\(\d+\+?\)\s*/, '')
        .replace(/\s*\|\s*(Posts|Jobs|People|About|Life|Videos|Images)\s*$/i, '')
        .trim();
      if (fromTitle && fromTitle.length <= 80) return fromTitle;

      // 5 — the company slug from the URL, title-cased. Last resort: always the
      //     right ENTITY, but the casing is a guess ("more-yeahs" → "More
      //     Yeahs"), which is why the metadata above is tried first.
      try {
        const m = window.location.pathname.match(/\/(?:company|school|showcase)\/([^/]+)/i);
        if (m && m[1]) {
          return decodeURIComponent(m[1])
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
        }
      } catch (e) { /* ignore */ }
      return '';
    };

    if (!data.name) {
      // Record WHICH strategy supplied the name. companyNameFromDom() falls
      // back through og:title / document.title / URL slug, so labelling all of
      // those "dom" would misreport the provenance in the [COMPANY] logs.
      setIfEmpty('name', companyNameFromDom());
      if (data.name) {
        // "dom" when the name came from a real element on the page; "meta" when
        // it fell through to og:title / document.title / the URL slug. Compared
        // against the rendered text so the label reflects the actual source.
        const domText = new Set();
        document.querySelectorAll(
          'h1, .org-top-card-summary__title, [class*="org-top-card-summary__title"], ' +
          '.org-top-card-primary-content__title'
        ).forEach((n) => {
          const t = norm(n.innerText || n.textContent);
          if (t) domText.add(t);
        });
        sources.push(domText.has(data.name) ? 'dom' : 'meta');
      }
    }
    setIfEmpty('tagline', pick('.org-top-card-summary__tagline, [class*="tagline"]'));
    setIfEmpty('about', pick('.org-about-us-organization-description__text, section[class*="about"] p'));

    // The top-card info line: "Software Development · Indore · 568 followers · 11-50 employees"
    const infoLine = pick('.org-top-card-summary-info-list, [class*="top-card-summary-info"]');
    if (infoLine) {
      const parts = infoLine.split(/[·•]/).map(norm).filter(Boolean);
      parts.forEach((p) => {
        if (/followers?$/i.test(p)) setIfEmpty('followers', p.replace(/\s*followers?$/i, ''));
        else if (/employees?$/i.test(p)) setIfEmpty('companySize', p);
        else if (!data.industry) setIfEmpty('industry', p);
        else if (!data.headquarters) setIfEmpty('headquarters', p);
      });
    }

    // Definition-list style rows on the About tab.
    document.querySelectorAll('dl > dt, .org-page-details__definition-term').forEach((dt) => {
      const label = norm(dt.textContent).toLowerCase();
      const dd = dt.nextElementSibling;
      const val = dd ? norm(dd.innerText || dd.textContent) : '';
      if (!val) return;
      if (/website/.test(label)) setIfEmpty('website', val);
      else if (/industry/.test(label)) setIfEmpty('industry', val);
      else if (/company size/.test(label)) setIfEmpty('companySize', val);
      else if (/headquarters/.test(label)) setIfEmpty('headquarters', val);
      else if (/founded/.test(label)) setIfEmpty('founded', val);
      else if (/specialties/.test(label)) setIfEmpty('specialties', val);
    });

    // Website is often a plain outbound link in the top card.
    if (!data.website) {
      const a = Array.from(document.querySelectorAll('a[href^="http"]')).find((n) => {
        const href = n.getAttribute('href') || '';
        return !/linkedin\.com/i.test(href) && norm(n.textContent).length > 3;
      });
      if (a) setIfEmpty('website', a.getAttribute('href'));
    }

    if (!data.logo) {
      const img = document.querySelector(
        'img[class*="org-top-card-primary-content__logo"], .org-top-card-primary-content img, main img[alt*="logo" i]'
      );
      if (img) setIfEmpty('logo', img.src || img.getAttribute('data-delayed-url'));
    }
    if (!data.banner) {
      const bg = document.querySelector(
        'img[class*="cover"], [class*="org-top-card__banner"] img, div[class*="cover-img"] img'
      );
      if (bg) setIfEmpty('banner', bg.src || bg.getAttribute('data-delayed-url'));
    }
  } catch (e) { /* fall through */ }

  // ── LAYER 4: meta tags (last resort) ──
  try {
    const meta = (p) => {
      const el = document.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
      return el ? norm(el.getAttribute('content')) : '';
    };
    if (!data.name) { setIfEmpty('name', meta('og:title')); if (data.name) sources.push('meta'); }
    setIfEmpty('about', meta('og:description') || meta('description'));
    setIfEmpty('logo', meta('og:image'));
  } catch (e) { /* ignore */ }

  // ── Company posts (up to 20) ──
  try {
    const cards = Array.from(document.querySelectorAll(
      'div.feed-shared-update-v2, [data-view-name="feed-full-update"], div.occludable-update, li[class*="update"]'
    )).filter((n, i, arr) => !arr.some((o) => o !== n && o.contains(n)));

    for (const el of cards) {
      if (data.posts.length >= 20) break;
      const text = norm(
        (el.querySelector('.update-components-text, .feed-shared-update-v2__description') || {}).innerText
        || (el.querySelector('.update-components-text, .feed-shared-update-v2__description') || {}).textContent
        || ''
      );
      const timeEl = el.querySelector('time[datetime]');
      const linkEl = el.querySelector('a[href*="/feed/update/"], a[href*="activity-"]');
      const num = (n) => {
        if (!n) return 0;
        const v = parseInt(norm(n.getAttribute('aria-label') || n.textContent).replace(/[^\d]/g, ''), 10);
        return isNaN(v) ? 0 : v;
      };
      const images = [];
      el.querySelectorAll('.update-components-image img, img[data-delayed-url]').forEach((img) => {
        const u = img.src || img.getAttribute('data-delayed-url');
        if (u && !/^(blob:|data:)/i.test(u) && !images.includes(u)) images.push(u);
      });
      const videos = [];
      el.querySelectorAll('video').forEach((v) => {
        const u = v.getAttribute('poster') || v.currentSrc || v.src;
        if (u && !/^(blob:|data:)/i.test(u) && !videos.includes(u)) videos.push(u);
      });

      // Skip empty shells — a card needs text or media to be worth keeping.
      if (!text && !images.length && !videos.length) continue;

      // Only THIS company's posts. The /posts/ tab also renders "Affiliated
      // pages" and suggested content authored by other entities; on the live
      // Microsoft page that leaked a third party's post into the payload
      // ("Phil Spencer" / "Safer Internet Day 2"). Match the card's actor
      // against the company name, and skip anything that names someone else.
      if (data.name) {
        const actorEl = el.querySelector(
          '.update-components-actor__title, .update-components-actor__name, ' +
          '.feed-shared-actor__name, a[href*="/company/"] span'
        );
        const actor = norm(actorEl ? (actorEl.innerText || actorEl.textContent) : '');
        if (actor) {
          const a = actor.toLowerCase();
          const c = data.name.toLowerCase();
          if (!a.includes(c) && !c.includes(a.split('•')[0].trim())) continue;
        }
      }

      data.posts.push({
        text,
        date: timeEl ? timeEl.getAttribute('datetime') : null,
        reactions: num(el.querySelector('.social-details-social-counts__reactions-count, button[aria-label*="reaction"]')),
        comments: num(el.querySelector('.social-details-social-counts__comments, button[aria-label*="comment"]')),
        images,
        videos,
        postUrl: linkEl && linkEl.href ? linkEl.href.split('?')[0] : '',
      });
    }
  } catch (e) { /* posts are optional */ }

  // Backward-compatible aliases for the existing panel UI.
  data.location = data.headquarters || data.location;
  data.__source = sources.length ? sources.join('+') : 'none';

  console.log(`[COMPANY] scraped name="${data.name}" source=${data.__source} posts=${data.posts.length}`);
  return data;
}
