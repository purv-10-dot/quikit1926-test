/**
 * Shared prospect-sync helpers for the background service worker.
 *
 * The "QuikCRM Connect" content script cannot call chrome.scripting/chrome.tabs
 * and must not hold the auth token, so the background worker performs the
 * extraction and the API calls on its behalf. This module holds that logic in
 * one place, keyed to the SAME endpoints and payload shape the side panel uses
 * (/api/leads/from-linkedin, then /api/linkedin/activity).
 *
 * Loaded into the service worker via importScripts() from background.js.
 * Deliberately free of DOM and window references so it is valid in a worker.
 */

/* global importScripts */

// ── Auth / config ────────────────────────────────────────────────────────────
// api.js targets `window`, which does not exist in a service worker, so the
// small amount it provides is re-implemented here rather than importing it.
const QUIKCRM_API_BASE_URL = 'http://localhost:3008';

// UAT
// const QUIKCRM_API_BASE_URL = 'https://uatcrm.quikit.ai';

// Production
// const QUIKCRM_API_BASE_URL = 'https://crm.quikit.ai';

async function qcrmGetAuthToken() {
  const result = await chrome.storage.local.get(['authToken']);
  return result.authToken || null;
}

async function qcrmGetSelectedOrganization() {
  try {
    const result = await chrome.storage.local.get(['selectedOrganization']);
    return result.selectedOrganization || null;
  } catch (e) {
    return null;
  }
}

/**
 * Authenticated fetch against the QuikCRM API. Mirrors api.js#apiFetch: attaches
 * the Bearer token and clears it on 401 so the user is prompted to log in again.
 */
async function qcrmApiFetch(endpoint, options = {}) {
  const token = await qcrmGetAuthToken();
  if (!token) {
    throw new Error('Not signed in to QuikCRM. Open the extension and log in.');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${QUIKCRM_API_BASE_URL}${endpoint}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    throw new Error('Network error. Check your connection and try again.');
  }

  if (response.status === 401) {
    await chrome.storage.local.remove(['authToken', 'userEmail']);
    throw new Error('QuikCRM session expired. Open the extension and log in again.');
  }
  return response;
}

/** Parse a JSON API response into data, turning any failure into an Error. */
async function qcrmReadJson(response, fallbackMessage) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.success === false) {
    throw new Error((result && result.error) || fallbackMessage);
  }
  return result;
}

// ── Extraction ───────────────────────────────────────────────────────────────

/**
 * Run the existing profile extractor in the given tab and return the richest
 * frame's result.
 *
 * `scrapeLinkedInProfile` is the same self-contained function the side panel
 * injects — it is shared via importScripts rather than duplicated, so the two
 * entry points can never drift. The frame-scoring rule matches the panel's:
 * identity fields outrank posts, and empty frames score 0.
 *
 * The panel's full pipeline additionally opens a background tab to harvest
 * authored posts from /recent-activity/all/. That is intentionally skipped
 * here: it takes tens of seconds and spawns a visible tab, which would be
 * wrong under a single button click. Posts are captured by the panel's
 * "Fetch"+"Save" flow; because the prospect upsert merges on
 * (orgId, linkedinUrl) and only writes JSON blobs that are present, saving
 * from this button never erases posts captured earlier by the panel.
 */
async function qcrmExtractProfile(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    function: scrapeLinkedInProfile,
  });

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
    if (Array.isArray(r.posts) && r.posts.length) s += 1;
    return s;
  }

  let best = null;
  let bestScore = -1;
  (results || []).forEach((entry) => {
    const score = scoreResult(entry && entry.result);
    if (score > bestScore) {
      bestScore = score;
      best = entry ? entry.result : null;
    }
  });

  if (best) {
    // Debug-only props the panel also strips before use.
    delete best.__sources;
    delete best.__diag;
    delete best.__postsDebug;
    delete best.__postsSource;
    delete best.__postsUnavailableReason;
    delete best.__postsPipelineDebug;
    // No `__` prefix, so it is not covered by the deletes above.
    delete best.experienceDebug;
  }
  return best;
}

// ── Step 1: ensure the prospect exists ───────────────────────────────────────

/**
 * Create-or-update the prospect for the profile open in `tabId`.
 *
 * Duplicate-safe by construction: /api/leads/from-linkedin upserts on
 * (orgId, linkedinUrl), so calling this for an already-saved profile updates
 * that row and returns its id instead of creating a second prospect.
 *
 * `pageFacts` are what the content script read from the live DOM. They are the
 * fallback for anything the injected extractor misses, and the profile URL is
 * always taken from them because it is the canonical, query-stripped URL of the
 * page the user is actually on.
 */
async function qcrmEnsureProspect(tabId, pageFacts) {
  const facts = pageFacts || {};
  let extracted = null;
  try {
    extracted = await qcrmExtractProfile(tabId);
  } catch (e) {
    // Extraction is best-effort: if injection fails we can still save the
    // prospect from what the content script read off the page.
    console.warn('[QuikCRM] profile extraction failed; falling back to page facts', e);
  }

  const e = extracted || {};
  const name =
    (e.fullName && e.fullName.trim()) ||
    [e.firstName, e.lastName].filter(Boolean).join(' ').trim() ||
    (facts.profileName || '').trim();

  if (!name) {
    throw new Error("Couldn't read this profile's name. Reload the page and try again.");
  }

  const linkedinUrl = (facts.linkedinProfileUrl || e.linkedinUrl || '').trim();

  const payload = {
    name,
    email: e.email || '',
    phone: e.phone || '',
    title: e.shortSummary || e.currentPosition || '',
    company: (e.company || facts.company || '').trim(),
    linkedinUrl,
    shortSummary: e.shortSummary || '',
    about: e.about || '',
    profilePicture: e.profilePicture || '',
  };

  // Only send JSON blobs we actually captured — the backend skips undefined
  // fields on update, so omitting them preserves richer data saved earlier.
  if (Array.isArray(e.posts) && e.posts.length) payload.posts = e.posts;
  if (Array.isArray(e.experiences) && e.experiences.length) payload.experiences = e.experiences;

  const org = await qcrmGetSelectedOrganization();
  if (org && org.id) payload.orgId = org.id;

  const response = await qcrmApiFetch('/api/leads/from-linkedin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const result = await qcrmReadJson(response, 'Failed to save prospect to QuikCRM');

  const prospectId = result.prospectId || (result.data && result.data.id);
  if (!prospectId) throw new Error('QuikCRM did not return a prospect id');
  return prospectId;
}

// ── Steps 3 & 4: log the activity ────────────────────────────────────────────

/**
 * Record a LinkedIn action against a prospect.
 *
 * Generic over the activity type, so future actions (message sent, connection
 * accepted, …) reuse this untouched. The endpoint dedupes server-side, so a
 * retry of the same connection request returns duplicate:true rather than
 * adding a second timeline entry.
 */
async function qcrmLogLinkedInActivity(payload) {
  const body = { ...payload };
  const org = await qcrmGetSelectedOrganization();
  if (org && org.id) body.orgId = org.id;

  const response = await qcrmApiFetch('/api/linkedin/activity', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const result = await qcrmReadJson(response, 'Failed to log the LinkedIn activity');
  return { duplicate: Boolean(result.data && result.data.duplicate) };
}
