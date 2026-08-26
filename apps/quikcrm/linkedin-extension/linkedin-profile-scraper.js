/**
 * Shared LinkedIn profile extractor.
 *
 * MOVED VERBATIM from linkedIn.js so BOTH entry points can inject the exact
 * same extractor and can never drift:
 *   • the side panel (linkedIn.html loads this before linkedIn.js), and
 *   • the background service worker (importScripts in background.js), which
 *     runs it for the injected "QuikCRM Connect" button.
 *
 * The body is unchanged — do not add panel- or worker-specific code here.
 *
 * IMPORTANT: this function is passed to chrome.scripting.executeScript and is
 * serialised into the page, so it must stay fully self-contained. It may not
 * reference anything from this file's scope, and it runs in the LinkedIn page
 * context — never in the panel or the worker.
 */

/**
 * Build stamp for this file.
 *
 * The scraper is pulled into the service worker via importScripts(), and a
 * service worker SURVIVES a plain "Reload" in chrome://extensions — so the
 * panel can be running today's linkedIn.js while this file is still yesterday's
 * cached copy. That mismatch is invisible without a marker, and it silently
 * undoes fixes made here. Logged on load and echoed into every payload so the
 * console always states which build actually ran.
 */
const QCRM_SCRAPER_BUILD = '2026-08-11f';
try {
  console.log(`[QCRM][scraper] build ${QCRM_SCRAPER_BUILD} loaded`);
} catch (e) { /* console may be unavailable in some worker contexts */ }

// This function runs in the LinkedIn page context
async function scrapeLinkedInProfile() {
  // Inlined, not read from the outer scope: this function is serialised by
  // chrome.scripting.executeScript and loses every closure reference.
  const SCRAPER_BUILD = '2026-08-11f';

  // Wait for the SPA to render/hydrate before extracting (LinkedIn is
  // client-rendered; injecting too early sees an empty document). Poll up to
  // 10s for any real profile signal, including inside shadow roots and the
  // embedded hydration JSON.
  await (async function waitForProfileDom() {
    const READY_TIMEOUT_MS = 10000;
    const POLL_MS = 200;
    const start = Date.now();

    // Readiness must mean "content has hydrated", not "a skeleton exists".
    //
    // The previous test accepted `main section`, which LinkedIn renders as part
    // of the loading shell. On a real run that was satisfied while the document
    // was still 945px tall: the lazy-load scroll then "reached bottom" after two
    // rounds at 1700px, About and Experience never mounted, and sectionByAnchor
    // correctly reported anchorFound=false for both. The top card WAS present in
    // that shell, which is why name/headline/company/picture succeeded while
    // About and Experience came back empty.
    //
    // A hydrated profile is tall and has real body text. Both must hold, so a
    // short skeleton no longer passes. The 10s timeout still applies, so a
    // genuinely short page can never hang the extractor.
    const MIN_HYDRATED_HEIGHT = 2000;
    const MIN_BODY_TEXT = 1200;
    // Measure the tallest CONTENT element, not just body/documentElement.
    //
    // On LinkedIn's current profile shell the document does not scroll — an
    // inner <main id="workspace"> is the scroller, and body/documentElement stay
    // pinned at the viewport height (observed: 937/937 while main was 3116).
    // Measuring only those two meant `tall` could never become true, so this
    // gate burned its full 10s timeout on EVERY load and then proceeded against
    // a page it had not actually confirmed as hydrated.
    const pageHeight = () => {
      let h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
      );
      try {
        const main = document.querySelector('main');
        if (main && main.scrollHeight > h) h = main.scrollHeight;
      } catch (e) { /* keep the body/doc measurement */ }
      return h;
    };
    const ready = () => {
      // Anchors present means hydration is unambiguously done — accept at once.
      if (document.getElementById('about') || document.getElementById('experience')) return true;
      const tall = pageHeight() >= MIN_HYDRATED_HEIGHT;
      const texty = ((document.body && document.body.innerText) || '').length >= MIN_BODY_TEXT;
      return tall && texty;
    };
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
  // Records what the lazy-load walk actually did, so a still-empty Experience
  // can be diagnosed from the panel console instead of guessed at.
  const LAZY_DBG = { ran: false, rounds: 0, maxY: 0, startH: 0, endH: 0, anchors: false, reason: '', scroller: '' };

  await (async function forceLazySections() {
    try {
      // Only the profile document lazy-renders these sections. Iframes (ads,
      // messaging overlay, embedded players) have no profile content, and
      // scrolling them wastes the whole time budget — which is why five frames
      // came back and none of them had Experience.
      if (window.top !== window.self && !document.getElementById('about')) {
        LAZY_DBG.reason = 'skipped: subframe with no profile content';
        return;
      }

      LAZY_DBG.ran = true;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // The document is not always the scroller. On LinkedIn's current profile
      // shell an inner <main> scrolls while body/documentElement stay pinned at
      // the viewport height — so window.scrollTo() moved nothing and pageHeight()
      // read 937/937, which is why this walk reported "reached bottom" after two
      // rounds and About/Experience never mounted. Detect the scroller once and
      // drive it; falls back to the window when the document really does scroll.
      let scroller = null;
      try {
        const m = document.querySelector('main');
        if (m && m.scrollHeight > m.clientHeight + 200) {
          const st = window.getComputedStyle(m);
          if (/(auto|scroll|overlay)/.test(st.overflowY)) scroller = m;
        }
      } catch (e) { /* fall back to the window */ }
      LAZY_DBG.scroller = scroller ? 'main' : 'window';

      const originalY = scroller ? scroller.scrollTop : window.scrollY;
      const pageHeight = () => {
        if (scroller) return scroller.scrollHeight;
        return Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0,
        );
      };
      const goTo = (y) => {
        try {
          if (scroller) scroller.scrollTop = y;
          else window.scrollTo(0, y);
        } catch (e) { /* non-fatal */ }
      };
      const step = Math.max(400, Math.floor(window.innerHeight * 0.9));
      const anchorsReady = () =>
        !!document.getElementById('experience') && !!document.getElementById('about');

      LAZY_DBG.startH = pageHeight();

      // The page GROWS as sections hydrate — a profile can start at ~4,200px and
      // reach ~19,800px once Experience/Education/Skills mount. Measuring
      // scrollHeight ONCE before scrolling bounded the walk at the
      // pre-hydration height, so Experience never entered the viewport, was
      // never rendered, and came back empty.
      //
      // So the bound is re-measured every round, and the walk is capped by
      // ROUND COUNT and WALL CLOCK rather than a stale pixel target.
      const MAX_ROUNDS = 60;
      const DEADLINE_MS = 12000;
      const startedAt = Date.now();

      let y = 0;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (anchorsReady()) { LAZY_DBG.reason = 'anchors found'; break; }
        if (Date.now() - startedAt > DEADLINE_MS) { LAZY_DBG.reason = 'deadline'; break; }

        y += step;
        goTo(y);
        LAZY_DBG.rounds = round + 1;
        LAZY_DBG.maxY = Math.max(LAZY_DBG.maxY, y);
        await sleep(120);

        // Past the CURRENT bottom? The page may simply not have hydrated yet —
        // a loading skeleton is short, so "reached bottom" fired after two
        // rounds and the walk ended before Experience ever mounted. Wait for
        // growth across several checks before accepting the bottom as real.
        if (y >= pageHeight()) {
          let grew = false;
          const before = pageHeight();
          for (let w = 0; w < 6; w++) {
            await sleep(250);
            if (pageHeight() > before) { grew = true; break; }
            if (anchorsReady()) { grew = true; break; }
          }
          if (!grew) { LAZY_DBG.reason = LAZY_DBG.reason || 'reached bottom (no growth)'; break; }
        }
      }

      // Settle at the bottom so anything still mounting gets a chance, then
      // restore the user's original position.
      goTo(pageHeight());
      await sleep(300);
      goTo(originalY);
      await sleep(80);

      LAZY_DBG.endH = pageHeight();
      LAZY_DBG.anchors = anchorsReady();
      if (!LAZY_DBG.reason) LAZY_DBG.reason = 'max rounds';
    } catch (e) {
      LAZY_DBG.reason = 'threw: ' + (e && e.message);
    }
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
      if (anchor) {
        // Preferred: the anchor sits INSIDE its section.
        const s = anchor.closest('section');
        if (s) return s;
        // LinkedIn also ships the anchor as an empty SIBLING placed just before
        // the block it names, with no <section> wrapper at all. `closest` then
        // returns null and the section was reported "not found" even though the
        // content was right there — the anchor's next sibling IS the section.
        //
        // Take the FIRST sibling that has content, and stop at the next anchor.
        // Requiring a list row here would be wrong: About has no <li>, so the
        // scan would run past it and return the Experience block, attributing
        // Experience dates to About.
        let cand = anchor.nextElementSibling;
        while (cand) {
          // Another section's anchor — we have left this section's territory.
          if (cand.id && cand.id !== id) break;
          if (cand.querySelector && cand.querySelector('[id]')) {
            const nested = cand.querySelector('[id]');
            if (nested && nested.id && nested.id !== id && !cand.contains(anchor)) {
              // Container spanning into another anchored section; don't use it.
              break;
            }
          }
          if (norm(cand.textContent)) return cand;
          cand = cand.nextElementSibling;
        }
        // Otherwise climb to the nearest ancestor that actually holds content.
        let up = anchor.parentElement;
        for (let d = 0; up && d < 4; d++) {
          if (norm(up.textContent)) return up;
          up = up.parentElement;
        }
      }
      if (headingWord) {
        // Heading text is not always the bare word: LinkedIn appends counts and
        // separators ("Experience · 2"), and requiring an exact match silently
        // skipped those layouts. Anchor at the start instead, and search the
        // whole document so a section rendered outside <main> is still found.
        const re = new RegExp('^' + headingWord + '\\b', 'i');
        const scopes = [];
        try { document.querySelectorAll('main section').forEach((s) => scopes.push(s)); } catch (e) {}
        try { document.querySelectorAll('section').forEach((s) => scopes.push(s)); } catch (e) {}
        const hit = scopes.find((sec) => {
          const h = sec.querySelector('h2, h3, [role="heading"]');
          return h && re.test(norm(h.textContent)) && sec.querySelector('li');
        });
        if (hit) return hit;
        // Heading with no <section> ancestor — take its container instead.
        const heads = Array.from(document.querySelectorAll('h2, h3, [role="heading"]'))
          .filter((h) => re.test(norm(h.textContent)));
        for (const h of heads) {
          let up = h.parentElement;
          for (let d = 0; up && d < 4; d++) {
            if (up.querySelector('li')) return up;
            up = up.parentElement;
          }
        }
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

    // A date-range string is the one stable marker of an employment row across
    // every LinkedIn layout: "Oct 2020 - Present", "Jan 2019 - Oct 2020",
    // "3 yrs 1 mo". Generated class names change; this does not.
    const DATEISH_RE = /\b(19|20)\d{2}\b|\bpresent\b|\b\d+\s*(yr|yrs|mo|mos)\b/i;

    // Find the repeated-sibling block that constitutes the entry list, without
    // relying on tag or class names. Returns { parent, rows } or null.
    //
    // Used BOTH by the section locator (to count rows) and by parseExperience
    // (to iterate them), so the two can never disagree about what a row is.
    function experienceRowGroup(root) {
      if (!root) return null;
      let nodes = [];
      try { nodes = Array.from(root.querySelectorAll('*')); } catch (e) { return null; }
      const byParent = new Map();
      for (const el of nodes) {
        let t = '';
        try { t = norm(el.textContent || ''); } catch (e) { continue; }
        if (!t || t.length < 12 || t.length > 4000) continue;
        if (!DATEISH_RE.test(t)) continue;
        const p = el.parentElement;
        if (!p) continue;
        let rec = byParent.get(p);
        if (!rec) { rec = []; byParent.set(p, rec); }
        rec.push(el);
      }
      let bestGroup = null;
      byParent.forEach((children, parent) => {
        // Outermost date-bearing node per branch only, so a row and its inner
        // spans are not both counted as rows.
        const rows = children.filter((c) => !children.some((o) => o !== c && o.contains(c)));
        if (rows.length < 1) return;
        if (!bestGroup || rows.length > bestGroup.rows.length ||
            (rows.length === bestGroup.rows.length &&
             norm(parent.textContent).length < norm(bestGroup.parent.textContent).length)) {
          bestGroup = { parent: parent, rows: rows };
        }
      });
      return bestGroup;
    }

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
        // Newer LinkedIn renders each role as a div entity rather than an <li>.
        // Take only the OUTERMOST entity nodes so nested sub-role entities are
        // not also counted as top-level rows.
        const entities = Array.from(section.querySelectorAll('div[data-view-name="profile-component-entity"]'))
          .filter((d) => {
            const p = d.parentElement && d.parentElement.closest('div[data-view-name="profile-component-entity"]');
            return !p;
          });
        if (entities.length) items = entities;
      }
      if (!items.length) {
        const list = section.querySelector('ul, [class*="pvs-list"], [class*="list"]');
        if (list) items = Array.from(list.children).filter((c) => c.querySelector && norm(c.textContent));
      }
      // Structural fallback: no tag/class assumption held, so use the
      // repeated-sibling block identified by date-range text. This is what makes
      // the parser work on a layout whose row markup matches none of the
      // selectors above (the observed rows=0 / parsed=0 case).
      if (!items.length) {
        const group = experienceRowGroup(section);
        if (group && group.rows.length) items = group.rows;
      }
      // Drop the section's own heading row ("Experience") if it came through
      // as a candidate — it has no role content and would yield an empty entry.
      items = items.filter((it) => {
        const t = norm(it.textContent || '');
        return t && !/^experience(\s*·\s*\d+)?$/i.test(t);
      });
      // Keep only rows that actually carry a date range. A role always has one,
      // and this is what prevents Education/Skills/Licenses/Recommendations rows
      // from being harvested when the resolved section is broader than intended
      // (STEP 4 containment). Applied only when SOME row qualifies, so a layout
      // that genuinely renders no dates is not reduced to zero entries.
      if (items.length > 1) {
        const dated = items.filter((it) => {
          try { return DATEISH_RE.test(norm(it.textContent || '')); } catch (e) { return false; }
        });
        if (dated.length) items = dated;
      }

      // An activity COUNT is a number plus a noun ("12 comments", "1,024 followers"),
      // never prose. Testing ACTIVITY_RE alone matched any line merely CONTAINING
      // one of those words — so "Mountain View, CA" (contains "view") and
      // "Head of Connections" were discarded, silently losing that field.
      const looksLikeCount = (t) =>
        /^\d[\d,\.]*$/.test(t) ||
        (/^[\d,\.]+\s*\+?\s*\w/.test(t) && ACTIVITY_RE.test(t)) ||
        /^(comments?|likes?|reposts?|reactions?|followers?|connections?|views?|impressions?)$/i.test(t);
      const looksLikeDate = (t) => /\b(19|20)\d{2}\b|present|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b\d+\s*(yr|yrs|mo|mos)\b/i.test(t);

      items.forEach((item) => {
        // Nested sub-roles: one company, multiple roles beneath it.
        //
        // Only <li> descendants were considered before, so on a layout that uses
        // divs for sub-roles the group collapsed into ONE entry that merged every
        // role's text. Detect the sub-role block structurally too: sibling
        // descendants that each carry their own date range.
        let nested = Array.from(item.querySelectorAll('li')).filter((li) => li !== item && li.parentElement.closest('li') === item);
        if (!nested.length) {
          const g = experienceRowGroup(item);
          // A genuine sub-role group has 2+ dated siblings that are strictly
          // inside this item. One row means "this item IS the role", not a group.
          if (g && g.rows.length > 1 && g.rows.every((r) => r !== item && item.contains(r))) {
            nested = g.rows;
          }
        }
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
        // Typical line order on /in/ is
        //   [0]=title, [1]=company·type, [2]=dates, [3]=location, [4+]=description
        // but it is NOT guaranteed: the employment-type suffix, the location and
        // the description are each optional, and bullet descriptions span many
        // lines. So each line is classified by shape rather than by index.
        // The title is the first line that is NOT the company, not a date, and
        // not an employment type.
        //
        // Taking lines[0] unconditionally was wrong: the row's leading node is
        // often the company LOGO LINK, whose text is the company name, so every
        // entry came back with jobTitle === companyName and the real title was
        // silently dropped. Choose by shape instead of position.
        const isDateLine = (t) => DATEISH_RE.test(t);
        const isTypeOnly = (t) => /^(full-?time|part-?time|contract|internship|freelance|self-?employed|seasonal|apprenticeship|permanent|temporary)$/i.test(t);
        const hintNorm = norm(companyHint || '');
        let title = '';
        for (const t of lines) {
          if (!t || isDateLine(t) || isTypeOnly(t)) continue;
          // Skip the company line, including its "Company · Full-time" form.
          if (hintNorm && (t === hintNorm || cleanCompany(t) === cleanCompany(hintNorm))) continue;
          title = t;
          break;
        }
        // Every line looked like the company/date/type — fall back to the old
        // behaviour rather than emitting an entry with no title at all.
        if (!title) title = lines[0] || '';
        let company = companyHint || cleanCompany(lines.find((t) => t !== title && !isDateLine(t)) || '');
        let dates = '', location = '';
        const descParts = [];

        // Employment type ("Full-time", "Contract") rides on the company line and
        // is not a location; keep it out of the location slot. Anchored, so a
        // description that merely mentions "contract work" is not discarded —
        // the outer EMPLOYMENT_RE is unanchored and would swallow it.
        const EMPLOYMENT_ONLY_RE = /^(full-?time|part-?time|contract|internship|freelance|self-?employed|seasonal|apprenticeship|permanent|temporary)$/i;
        // A location is short, comma-shaped or ends in a work-mode marker.
        const looksLikeLocation = (t) =>
          t.length <= 80 &&
          !/[.!?]$/.test(t) &&
          (/,/.test(t) || /\b(remote|on-?site|hybrid)\b/i.test(t));

        // Classify by shape, not by index. The title is now chosen by shape
        // (above), so it is no longer guaranteed to be line 0 — an index-based
        // skip would drop the wrong line. Skip the chosen title and the company
        // line wherever they actually appear.
        let companyLineUsed = false;
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i];
          if (!t || EMPLOYMENT_ONLY_RE.test(t)) continue;
          if (t === title) continue;                       // the title itself
          // The company line ("Company" or "Company · Full-time") — only once,
          // so a description mentioning the company is still captured.
          if (!companyLineUsed && company && t.indexOf(company) === 0 && !looksLikeDate(t)) {
            companyLineUsed = true;
            continue;
          }
          if (!dates && looksLikeDate(t)) { dates = t; continue; }
          if (!location && looksLikeLocation(t)) { location = t; continue; }
          // Anything left over is description text. Previously this branch did
          // not exist, so `description` was declared and never assigned — every
          // role came back with an empty description, and any line longer than
          // 60 chars was dropped entirely.
          descParts.push(t);
        }

        // Employment type rides on the company line ("Horizontal · Full-time")
        // and is also a standalone line in some layouts. Read it from whichever
        // line carries it rather than assuming a position.
        let employmentType = '';
        for (const t of lines) {
          const m = t.match(/\b(Full-?time|Part-?time|Self-?employed|Freelance|Contract|Internship|Apprenticeship|Seasonal|Permanent|Temporary)\b/i);
          if (m) { employmentType = m[1]; break; }
        }

        // LinkedIn renders "Oct 2020 - Present · 5 yrs 11 mos" as ONE line:
        // the range before the "·", the human duration after it. Split so
        // startDate / endDate / duration are each populated, while `duration`
        // keeps the whole original string for backwards compatibility with
        // whatever already consumes it.
        let startDate = '', endDate = null, durationText = '';
        if (dates) {
          const parts = dates.split(/\s*[·•]\s*/);
          const range = parts[0] || '';
          durationText = parts.slice(1).join(' · ').trim();
          const rm = range.split(/\s*[-–—]\s*|\s+to\s+/i);
          if (rm.length >= 2) {
            startDate = norm(rm[0]);
            const end = norm(rm.slice(1).join(' '));
            endDate = /^present$/i.test(end) ? null : end;
          } else {
            startDate = norm(range);
          }
        }

        const link = node.querySelector('a[href*="/company/"]');
        // Company logo — the entity's own image. Skip 1px trackers/ghosts by
        // reusing the same validators the profile picture uses.
        let logoUrl = '';
        try {
          const logo = Array.from(node.querySelectorAll('img')).find((img) => {
            const u = img.currentSrc || img.src || img.getAttribute('data-delayed-url') || '';
            return isValidProfileImageUrl(u) && imageElementLooksReal(img);
          });
          if (logo) logoUrl = (logo.currentSrc || logo.src || logo.getAttribute('data-delayed-url') || '').trim();
        } catch (e) { /* logo is optional */ }

        return {
          companyName: company, companyUrl: link ? link.href : '', companyDuration: '',
          jobTitle: title, startDate: startDate, endDate: endDate, duration: dates,
          location: location, description: descParts.join('\n'),
          employmentType: employmentType, durationText: durationText, companyLogo: logoUrl,
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

    // =====================================================================
    // EXPERIENCE — dedicated scroll-until-visible pass.
    //
    // Why this exists even though forceLazySections() already scrolled:
    // that walk stops as soon as the #experience ANCHOR exists, but LinkedIn
    // ships the anchor with the section shell while the rows are still
    // virtualised — so sections.experience was resolved (above) against an
    // empty container and parseExperience() returned []. This pass scrolls the
    // real scroll container until the section holds actual role rows, then
    // RE-RESOLVES sections.experience so the parser sees the hydrated node.
    //
    // Strictly additive: it only ever replaces sections.experience with a node
    // that has more content than the one already found, and never touches the
    // top card, About, Activity or the posts pass.
    // =====================================================================
    const EXP_DBG = {
      scrollContainer: '',
      rounds: 0,
      scrollY: 0,
      scrollHeight: 0,
      sectionFound: false,
      rowsDetected: 0,
      selectorsMatched: [],
      selectorsFailed: [],
      extracted: 0,
      reason: '',
      // Set by callParser() below. Defaults chosen so a missing value is
      // unambiguous rather than undefined: parserReached=false proves the
      // parser was never invoked at all.
      parserReached: false,
      parserResultCount: 0,
      voyagerCount: 0,
      // Scroll-root survey + move verification.
      docClientH: 0, docScrollH: 0, bodyClientH: 0, bodyScrollH: 0, innerH: 0,
      scrollableCount: 0, rootCandidates: 0,
      scrollVerifyBefore: 0, scrollVerifyAfter: 0, scrollVerifyMoved: false,
      // DOM-scan evidence: "Experience" text presence before scrolling, after
      // the last round, and after the mandatory post-bottom scan.
      scanBeforeExpText: 0, scanBeforeExpExact: 0, scanBeforeAbout: 0,
      lastScanExpText: 0, lastScanExpExact: 0, lastScanAbout: 0,
      finalScanExpText: 0, finalScanExpExact: 0, finalScanAbout: 0
    };

    await (async function scrollToExperience() {
      try {
        console.log('[EXPERIENCE] Starting Experience extraction');
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // ---- Detect the scroll container -------------------------------
        // LinkedIn normally scrolls the document, but inside the extension
        // side panel / some overlays the profile lives in a scrollable div.
        // Pick whichever element actually has overflow to scroll.
        console.log('[EXPERIENCE] Detecting scroll container');

        const describe = (node) => {
          if (!node) return '(null)';
          if (node === document.scrollingElement || node === document.documentElement) return 'document';
          let s = (node.tagName || '').toLowerCase();
          if (node.id) s += '#' + node.id;
          if (node.className && typeof node.className === 'string') {
            s += '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.');
          }
          const dvn = node.getAttribute && node.getAttribute('data-view-name');
          if (dvn) s += '[data-view-name=' + dvn + ']';
          const dti = node.getAttribute && node.getAttribute('data-testid');
          if (dti) s += '[data-testid=' + dti + ']';
          return s;
        };

        // ---- Record the raw page metrics -------------------------------
        // These answer "is the document itself scrollable at all?" with data
        // rather than by assumption. The previous detector ASSUMED document was
        // scrollable and fell back to it unconditionally, so when the real
        // content lived in an inner div the walk measured a container whose
        // scrollHeight equalled its clientHeight and immediately concluded
        // "reached bottom".
        const docEl = document.scrollingElement || document.documentElement;
        EXP_DBG.docClientH = docEl ? docEl.clientHeight : 0;
        EXP_DBG.docScrollH = docEl ? docEl.scrollHeight : 0;
        EXP_DBG.bodyClientH = document.body ? document.body.clientHeight : 0;
        EXP_DBG.bodyScrollH = document.body ? document.body.scrollHeight : 0;
        EXP_DBG.innerH = window.innerHeight;

        // ---- Survey EVERY scrollable element in the document -----------
        function surveyScrollables() {
          const out = [];
          let all = [];
          try { all = Array.from(document.querySelectorAll('*')); } catch (e) { all = []; }
          for (const el of all) {
            let sh = 0, ch = 0;
            try { sh = el.scrollHeight; ch = el.clientHeight; } catch (e) { continue; }
            if (sh <= ch + 200) continue;
            let st;
            try { st = window.getComputedStyle(el); } catch (e) { continue; }
            if (!st || !/(auto|scroll|overlay)/.test(st.overflowY)) continue;
            // Must be big enough to plausibly be the content viewport.
            if (ch < 200) continue;
            out.push({ el: el, label: describe(el), clientH: ch, scrollH: sh, scrollTop: el.scrollTop });
          }
          return out;
        }
        const scrollables = surveyScrollables();
        EXP_DBG.scrollableCount = scrollables.length;
        console.log('[EXPERIENCE][SCROLL-ROOT] scrollable elements found=' + scrollables.length);
        scrollables.slice(0, 12).forEach((c, i) => {
          console.log('[EXPERIENCE][SCROLL-ROOT]   [' + i + '] ' + c.label +
            ' clientH=' + c.clientH + ' scrollH=' + c.scrollH + ' scrollTop=' + c.scrollTop);
        });

        // ---- Build the ordered candidate list --------------------------
        // Document first ONLY if it can actually scroll. Then any scrollable
        // that contains the profile content (main / the experience anchor),
        // preferring the one with the most scrollable distance.
        const candidates = [];
        if (docEl && docEl.scrollHeight > window.innerHeight + 200) {
          candidates.push({ el: docEl, label: 'document', isWindow: true });
        }
        const main = document.querySelector('main');
        const contentHost = main || document.body;
        // Scrollables that CONTAIN the profile content are the real viewport.
        scrollables
          .filter((c) => !contentHost || c.el.contains(contentHost) || (main && main.contains(c.el)))
          .sort((a, b) => (b.scrollH - b.clientH) - (a.scrollH - a.clientH))
          .forEach((c) => candidates.push({ el: c.el, label: c.label, isWindow: false }));
        // Any remaining scrollable, largest scroll distance first.
        scrollables
          .sort((a, b) => (b.scrollH - b.clientH) - (a.scrollH - a.clientH))
          .forEach((c) => {
            if (!candidates.some((k) => k.el === c.el)) {
              candidates.push({ el: c.el, label: c.label, isWindow: false });
            }
          });
        // Document as a LAST resort even if it looked unscrollable — the page
        // may still grow once content hydrates.
        if (docEl && !candidates.some((k) => k.el === docEl)) {
          candidates.push({ el: docEl, label: 'document (last resort)', isWindow: true });
        }
        EXP_DBG.rootCandidates = candidates.length;

        // ---- Verify by MOVING it, not by measuring it ------------------
        // A candidate is only accepted if changing its scroll position
        // actually changes it. This is the check whose absence caused the
        // "937 -> 937, reached bottom" dead end.
        const readTop = (c) => (c.isWindow ? window.scrollY : c.el.scrollTop);
        const writeTop = (c, y) => {
          try {
            if (c.isWindow) window.scrollTo(0, y);
            else c.el.scrollTop = y;
          } catch (e) { /* non-fatal */ }
        };
        async function pickVerifiedContainer() {
          for (const c of candidates) {
            const before = readTop(c);
            const probe = before + Math.max(200, Math.floor(window.innerHeight * 0.5));
            writeTop(c, probe);
            await sleep(150);
            const after = readTop(c);
            const moved = after !== before;
            console.log('[EXPERIENCE][SCROLL-VERIFY] candidate="' + c.label +
              '" before=' + before + ' after=' + after + ' moved=' + moved);
            // Restore before trying the next one so candidates don't interfere.
            writeTop(c, before);
            await sleep(60);
            if (moved) {
              EXP_DBG.scrollVerifyBefore = before;
              EXP_DBG.scrollVerifyAfter = after;
              EXP_DBG.scrollVerifyMoved = true;
              return c;
            }
          }
          EXP_DBG.scrollVerifyMoved = false;
          return null;
        }

        const verified = await pickVerifiedContainer();
        // If nothing moved, fall back to the document so the walk still runs —
        // the section may already be in the DOM without any scrolling.
        const sc = verified || { el: docEl, label: 'document (unverified — nothing moved)', isWindow: true };
        EXP_DBG.scrollContainer = sc.label;
        console.log('[EXPERIENCE][SCROLL-ROOT] candidate count=' + candidates.length +
          ' | selected="' + sc.label + '"' +
          ' clientH=' + (sc.isWindow ? window.innerHeight : sc.el.clientHeight) +
          ' scrollH=' + (sc.el ? sc.el.scrollHeight : 0) +
          ' scrollTop=' + readTop(sc));

        const heightOf = () => (sc.el ? sc.el.scrollHeight : 0);
        const posOf = () => (sc.isWindow ? window.scrollY : sc.el.scrollTop);
        const viewOf = () => (sc.isWindow ? window.innerHeight : sc.el.clientHeight);
        const scrollTo = (y) => {
          try {
            if (sc.isWindow) window.scrollTo(0, y);
            else sc.el.scrollTop = y;
          } catch (e) { /* non-fatal */ }
        };

        // ---- Robust, text-first Experience locator ----------------------
        // Never a single brittle CSS class: try the anchor, then any heading
        // whose text starts with "Experience" (LinkedIn appends counts, e.g.
        // "Experience · 4"), then a loose class match as the last resort.
        // A candidate only counts as "found" once it holds real role rows.
        const ROW_SELECTORS = [
          'li.artdeco-list__item',
          'div[data-view-name="profile-component-entity"]',
          'li.pvs-list__paged-list-item',
          'li',
          '[class*="pvs-entity"]'
        ];
        function rowCount(el) {
          if (!el) return 0;
          let best = 0;
          for (const sel of ROW_SELECTORS) {
            let n = 0;
            try { n = el.querySelectorAll(sel).length; } catch (e) { continue; }
            if (n > 0) {
              if (EXP_DBG.selectorsMatched.indexOf(sel) === -1) EXP_DBG.selectorsMatched.push(sel);
              if (n > best) best = n;
            } else if (EXP_DBG.selectorsFailed.indexOf(sel) === -1) {
              EXP_DBG.selectorsFailed.push(sel);
            }
          }
          return best;
        }
        const HEADING_RE = /^experience\b/i;
        function locateExperience() {
          const cands = [];
          // 1. Semantic anchor (both shapes: inside a section, or a sibling).
          const anchor = document.getElementById('experience');
          if (anchor) {
            const s = anchor.closest('section');
            if (s) cands.push({ el: s, via: '#experience → closest(section)' });
            let sib = anchor.nextElementSibling;
            for (let i = 0; sib && i < 3; i++) {
              if (norm(sib.textContent)) { cands.push({ el: sib, via: '#experience → nextElementSibling' }); break; }
              sib = sib.nextElementSibling;
            }
            let up = anchor.parentElement;
            for (let d = 0; up && d < 4; d++) {
              if (norm(up.textContent)) { cands.push({ el: up, via: '#experience → ancestor' }); break; }
              up = up.parentElement;
            }
          }
          // 2. Text-based heading detection, anywhere in the document.
          let heads = [];
          try {
            heads = Array.from(document.querySelectorAll('h2, h3, [role="heading"]'))
              .filter((h) => HEADING_RE.test(norm(h.textContent)));
          } catch (e) { heads = []; }
          for (const h of heads) {
            const s = h.closest('section');
            if (s) cands.push({ el: s, via: 'heading "Experience" → closest(section)' });
            let up = h.parentElement;
            for (let d = 0; up && d < 5; d++) {
              cands.push({ el: up, via: 'heading "Experience" → ancestor[' + d + ']' });
              up = up.parentElement;
            }
          }
          // 3. Loose class match — last resort only.
          try {
            document.querySelectorAll('section[class*="experience"], div[class*="experience-section"]')
              .forEach((el) => cands.push({ el: el, via: 'class*="experience"' }));
          } catch (e) { /* ignore */ }

          // Pick the candidate with the most role rows; ties → the smallest
          // node, so we keep the section rather than a page-wide wrapper.
          let best = null;
          for (const c of cands) {
            if (!c.el) continue;
            const rows = rowCount(c.el);
            if (!rows) continue;
            if (!best || rows > best.rows ||
                (rows === best.rows && (c.el.textContent || '').length < (best.el.textContent || '').length)) {
              best = { el: c.el, via: c.via, rows: rows };
            }
          }
          if (best) return best;

          // ---- Structural fallback (fixes CASE 1) ------------------------
          // Everything above requires rowCount() > 0, i.e. one of the five
          // hardcoded ROW_SELECTORS must match. When LinkedIn ships row markup
          // that matches none of them, every candidate is discarded and this
          // function returned null — reporting section=false even though the
          // heading WAS found. That is the observed failure: 2 exact "Experience"
          // headings in the DOM, rows=0, section=false.
          //
          // So: keep the heading's section even with zero recognised rows, and
          // derive the rows STRUCTURALLY — the repeated-sibling block under the
          // heading — instead of from any selector list.
          for (const c of cands) {
            if (!c.el) continue;
            const rows = structuralRowCount(c.el);
            if (!rows) continue;
            if (!best || rows > best.rows) {
              best = { el: c.el, via: c.via + ' [structural]', rows: rows };
            }
          }
          if (best) return best;

          // Last resort: the tightest heading container with real text, rows
          // unknown (0). parseExperience() still gets a correct section to work
          // with, which is strictly better than returning nothing.
          for (const c of cands) {
            if (c.el && norm(c.el.textContent).length > 40) {
              return { el: c.el, via: c.via + ' [no rows recognised]', rows: 0 };
            }
          }
          return null;
        }

        // Count entry-like rows without relying on class names or tag names.
        //
        // A LinkedIn entry list is a set of SIBLINGS that each contain a
        // date-range-ish string ("2020 - Present", "Jan 2019 - Oct 2020",
        // "3 yrs 1 mo"). Employment rows essentially always carry one, which
        // makes it a far more stable signal than any generated class. Finds the
        // parent whose children most often look like that, and returns the count.
        function structuralRowCount(root) {
          const g = experienceRowGroup(root);
          return g ? g.rows.length : 0;
        }
        // experienceRowGroup / DATEISH_RE are defined at the extractor's top
        // level (above parseExperience) so the locator and the parser share ONE
        // definition of "what a row is" and cannot disagree.

        // ---- DOM evidence collector (diagnostic only) -------------------
        // Answers "is the Experience DOM present at all?" independently of the
        // section locator, so a detector miss (CASE 1) is distinguishable from
        // content that never rendered (CASE 3) and from lazy rendering (CASE 2).
        // Reads only; it never influences detection.
        const EXACT_HEADING_RE = /^Experience(\s*[·•]\s*\d+)?$/i;
        function domScan(label) {
          const info = {
            expTextMatches: 0, expExactMatches: 0, expVisibleMatches: 0,
            aboutTextMatches: 0, candidates: []
          };
          let all = [];
          try { all = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,p,section,a,[role="heading"]')); } catch (e) { all = []; }
          for (const el of all) {
            let t = '';
            try { t = norm(el.textContent || ''); } catch (e) { continue; }
            if (!t) continue;
            if (/\bAbout\b/.test(t) && t.length < 40) info.aboutTextMatches++;
            if (t.indexOf('Experience') === -1) continue;
            info.expTextMatches++;
            if (!EXACT_HEADING_RE.test(t)) continue;
            info.expExactMatches++;
            // Only the tightest nodes are worth describing: an exact-text match
            // on a wrapper repeats for every ancestor.
            let r = null;
            try { r = el.getBoundingClientRect(); } catch (e) { r = null; }
            const inView = !!(r && r.bottom > 0 && r.top < (window.innerHeight || 0));
            if (inView) info.expVisibleMatches++;
            if (info.candidates.length < 5) {
              const anc = [];
              let up = el.parentElement;
              for (let d = 0; up && d < 4; d++) { anc.push(describe(up)); up = up.parentElement; }
              info.candidates.push({
                self: describe(el),
                role: (el.getAttribute && el.getAttribute('role')) || '',
                ariaLabel: (el.getAttribute && el.getAttribute('aria-label')) || '',
                rectTop: r ? Math.round(r.top) : null,
                rectBottom: r ? Math.round(r.bottom) : null,
                rectHeight: r ? Math.round(r.height) : null,
                inViewport: inView,
                inSelectedContainer: !!(sc.el && sc.el.contains && sc.el.contains(el)),
                // Which scrollable actually owns this node — answers CASE 5.
                nearestScrollableAncestor: (function () {
                  let p = el.parentElement;
                  while (p) {
                    try {
                      const st = window.getComputedStyle(p);
                      if (/(auto|scroll|overlay)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 50) return describe(p);
                    } catch (e) { /* keep climbing */ }
                    p = p.parentElement;
                  }
                  return '(none)';
                })(),
                text: t.slice(0, 300),
                ancestors: anc,
                html: (function () { try { return (el.outerHTML || '').slice(0, 1000); } catch (e) { return ''; } })()
              });
            }
          }
          console.log('[EXPERIENCE][DOM-SCAN] ' + label +
            ' scrollTop=' + posOf() +
            ' experienceTextMatches=' + info.expTextMatches +
            ' experienceExactMatches=' + info.expExactMatches +
            ' experienceVisibleMatches=' + info.expVisibleMatches +
            ' aboutTextMatches=' + info.aboutTextMatches);
          if (info.candidates.length) {
            console.log('[EXPERIENCE][DOM-SCAN] ' + label + ' candidates:', info.candidates);
          }
          return info;
        }

        // Geometry probe — does the PROFILE CONTENT actually move when the
        // container moves? scrollTop changing is not sufficient proof (CASE 5).
        const contentProbe = document.querySelector('main') || document.body;
        const contentTop = () => {
          try { return Math.round(contentProbe.getBoundingClientRect().top); } catch (e) { return null; }
        };

        // ---- Scroll rounds ---------------------------------------------
        const MAX_ROUNDS = 40;
        const DEADLINE_MS = 15000;
        const startedAt = Date.now();
        const originalY = posOf();
        const step = Math.max(400, Math.floor(viewOf() * 0.85));

        // Baseline BEFORE any scrolling, so lazy rendering is provable by
        // comparing this against the per-round counts.
        const scanBefore = domScan('BEFORE-SCROLL');
        EXP_DBG.scanBeforeExpText = scanBefore.expTextMatches;
        EXP_DBG.scanBeforeExpExact = scanBefore.expExactMatches;
        EXP_DBG.scanBeforeAbout = scanBefore.aboutTextMatches;

        let hit = locateExperience();
        let y = posOf();

        for (let round = 1; round <= MAX_ROUNDS && !hit; round++) {
          if (Date.now() - startedAt > DEADLINE_MS) { EXP_DBG.reason = 'deadline'; break; }

          const posBefore = posOf();
          const contentBefore = contentTop();
          y += step;
          scrollTo(y);
          EXP_DBG.rounds = round;
          // Longer settle: LinkedIn renders these sections asynchronously, and
          // scanning too early reports "not present" for content that is about
          // to mount.
          await sleep(800);
          const posAfter = posOf();
          const contentAfter = contentTop();

          hit = locateExperience();
          const anchorNow = !!document.getElementById('experience');
          console.log('[EXPERIENCE][ROUND ' + round + '] scrollTop=' + posAfter +
            ' scrollHeight=' + heightOf() +
            ' anchor=' + anchorNow +
            ' section=' + !!hit +
            ' rows=' + (hit ? hit.rows : 0) +
            ' moved=' + (posAfter !== posBefore) +
            // CASE 5 check: did the profile content actually shift on screen?
            ' contentTop=' + contentBefore + '->' + contentAfter +
            ' contentMoved=' + (contentBefore !== contentAfter));
          const roundScan = domScan('ROUND ' + round);
          EXP_DBG.lastScanExpText = roundScan.expTextMatches;
          EXP_DBG.lastScanExpExact = roundScan.expExactMatches;
          EXP_DBG.lastScanAbout = roundScan.aboutTextMatches;

          if (hit) break;

          // "Reached bottom" now requires BOTH that the requested position is
          // past the measured height AND that the container genuinely stopped
          // moving. Height alone was the bug: a container whose scrollHeight
          // equals its clientHeight reports "bottom" on round 1 even though the
          // real content scrolls elsewhere, which ended the walk at 937->937
          // before Experience ever mounted.
          const atBottom = y >= heightOf() && posAfter === posBefore;
          if (atBottom) {
            const before = heightOf();
            let grew = false;
            for (let w = 0; w < 6; w++) {
              await sleep(250);
              if (heightOf() > before) { grew = true; break; }
              if (locateExperience()) { grew = true; break; }
            }
            if (!grew) { EXP_DBG.reason = 'reached bottom (no growth, container did not move)'; break; }
          } else if (y >= heightOf() && posAfter !== posBefore) {
            // Still moving even though we asked to go past the measured height:
            // the container is growing under us. Re-anchor to where it actually
            // is so the next step continues from reality rather than from a
            // runaway target.
            y = posAfter;
          }
        }

        // Mandatory final scan. Reaching the container's bottom does NOT prove
        // the section failed to render — it only proves the container stopped.
        // Settle, re-scan, and re-locate once more before accepting CASE A.
        if (!hit) {
          await sleep(1000);
          const finalScan = domScan('FINAL-AFTER-BOTTOM');
          EXP_DBG.finalScanExpText = finalScan.expTextMatches;
          EXP_DBG.finalScanExpExact = finalScan.expExactMatches;
          EXP_DBG.finalScanAbout = finalScan.aboutTextMatches;
          hit = locateExperience();
          console.log('[EXPERIENCE][FINAL-RELOCATE] section=' + !!hit +
            ' rows=' + (hit ? hit.rows : 0));
          // If the text is in the DOM but the locator still misses it, that is
          // CASE 1 (detector gap) and must not be reported as CASE A.
          if (!hit && finalScan.expExactMatches > 0) {
            EXP_DBG.reason = 'CASE 1 — "Experience" heading present in DOM (' +
              finalScan.expExactMatches + ' exact match(es)) but locator found no rows';
          } else if (!hit && finalScan.expTextMatches === 0) {
            EXP_DBG.reason = 'CASE 3 — no "Experience" text anywhere in this frame DOM';
          }
        }

        EXP_DBG.scrollY = posOf();
        EXP_DBG.scrollHeight = heightOf();

        if (hit) {
          // Bring it fully into view and let LinkedIn finish rendering the
          // rows (descriptions and "…more" bodies mount slightly later).
          console.log('[EXPERIENCE] Waiting for Experience content to render');
          try { hit.el.scrollIntoView({ block: 'center' }); } catch (e) { /* non-fatal */ }
          await sleep(700);

          // Re-locate after the settle: the node can be swapped out during
          // hydration, and row count usually rises.
          const settled = locateExperience() || hit;
          EXP_DBG.sectionFound = true;
          EXP_DBG.rowsDetected = settled.rows;
          EXP_DBG.reason = EXP_DBG.reason || ('found via ' + settled.via);
          console.log('[EXPERIENCE] Experience entries found: ' + settled.rows + ' | via ' + settled.via);

          // Adopt the hydrated node only if it beats what STEP 1 resolved.
          const prevRows = sections.experience ? rowCount(sections.experience) : 0;
          if (settled.rows > prevRows) sections.experience = settled.el;
        } else {
          EXP_DBG.sectionFound = false;
          EXP_DBG.reason = EXP_DBG.reason || 'max rounds';
          console.log('[EXPERIENCE] Section not found after maximum scroll attempts');
        }

        console.log('[EXPERIENCE] selectors matched:', EXP_DBG.selectorsMatched.join(', ') || '(none)');
        console.log('[EXPERIENCE] selectors failed:', EXP_DBG.selectorsFailed.join(', ') || '(none)');

        // Restore the user's position — the posts pass below does its own
        // scrolling and expects to start from where it left the page.
        scrollTo(originalY);
        await sleep(80);
      } catch (e) {
        EXP_DBG.reason = 'threw: ' + (e && e.message);
        console.log('[EXPERIENCE] pass threw (non-fatal):', e && e.message);
      }
    })();

    // --- Experience (DOM) — the authority for currentPosition + company ----
    // The DOM is parsed even when Voyager already supplied positions, because
    // the two layers are complementary rather than ranked:
    //   Voyager → reliable titles/companies + structured start/end dates, but
    //             `duration` is always '' and `description` is often absent.
    //   DOM     → LinkedIn's rendered "2 yrs 3 mos" duration and the full role
    //             description, which exist ONLY in the markup.
    // Treating Voyager as a winner meant profiles with hydration JSON showed
    // titles and companies but no durations and no descriptions.
    // Instrumentation only — records that the parser was actually invoked and
    // what it returned, so "parser never reached" and "parser returned 0" are
    // distinguishable from the panel without reading page-context logs.
    // Wraps the parser; does not alter it.
    const callParser = () => {
      EXP_DBG.parserReached = true;
      EXP_DBG.voyagerCount = data.experiences.length;
      const r = parseExperience();
      EXP_DBG.parserResultCount = Array.isArray(r) ? r.length : 0;
      return r;
    };

    if (!data.experiences.length) {
      data.experiences = callParser();
      if (data.experiences.length) markSource('experiences', 'DOM(#experience)');
    } else {
      const domExperiences = callParser();
      if (domExperiences.length) {
        // Match on title+company rather than index: the layers can order or
        // group roles differently (Voyager flattens nested sub-roles).
        const key = (e) => (norm(e.jobTitle) + '@' + norm(e.companyName)).toLowerCase();
        const byKey = {};
        domExperiences.forEach((d) => { const k = key(d); if (!byKey[k]) byKey[k] = d; });

        let enriched = 0;
        data.experiences.forEach((e, i) => {
          const d = byKey[key(e)] ||
            (domExperiences.length === data.experiences.length ? domExperiences[i] : null);
          if (!d) return;
          if (!e.duration && d.duration) { e.duration = d.duration; enriched++; }
          if (!e.description && d.description) { e.description = d.description; enriched++; }
          if (!e.location && d.location) { e.location = d.location; enriched++; }
          if (!e.companyUrl && d.companyUrl) { e.companyUrl = d.companyUrl; }
          // Fields only the DOM ever carries — Voyager has no equivalent, so
          // without this the merge path silently dropped them.
          if (!e.employmentType && d.employmentType) { e.employmentType = d.employmentType; enriched++; }
          if (!e.durationText && d.durationText) { e.durationText = d.durationText; }
          if (!e.companyLogo && d.companyLogo) { e.companyLogo = d.companyLogo; }
        });
        // Assigned directly: markSource() never overwrites, and 'Voyager' is
        // already recorded — so the diagnostic would otherwise hide the merge.
        if (enriched) fieldSources.experiences = 'Voyager + DOM(#experience)';
      }
    }
    // ---- Experience extraction summary ------------------------------------
    EXP_DBG.extracted = Array.isArray(data.experiences) ? data.experiences.length : 0;
    data.experiences.forEach((e, i) => {
      console.log('[EXPERIENCE] Extracted entry ' + (i + 1) + ': ' + (e.jobTitle || '(no title)') +
        (e.companyName ? ' @ ' + e.companyName : ''));
    });
    console.log('[EXPERIENCE] Final extracted experience count: ' + EXP_DBG.extracted);
    if (!EXP_DBG.extracted) console.log('[EXPERIENCE] ZERO ENTRIES — reason:', EXP_DBG.reason);
    console.log('[EXPERIENCE] summary:', EXP_DBG);

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

    // =====================================================================
    // --- Extract Recent Posts (public profile first) ---------------------
    //
    // QuikCRM imports PUBLIC profiles (linkedin.com/in/...), so the public
    // layout is the primary target and Sales Navigator is a fallback.
    //
    // Public profiles render the Activity block as an anchored <section>
    // containing #content_collections, with each post as a
    // .feed-shared-update-v2 / .profile-creator-shared-feed-update__container
    // element — NOT the <article> elements Sales Navigator uses, and NOT
    // section[class*="_recent-activity-v2__section"] (a Sales-Nav-only
    // hashed CSS-module class).
    //
    // Never throws: any failure leaves data.posts as [] (requirement 7).
    // =====================================================================
    data.posts = [];

    const POSTS_DBG = {
      url: window.location.href,
      layout: null,              // 'public' | 'salesnav' | null
      activitySectionFound: false,
      activitySectionLoaded: false,
      hydrationWaitMs: 0,
      candidateCount: 0,
      matchedSelector: null,
      extracted: 0,
      rejected: 0,
      errors: 0,
      reason: null
    };

    try {
      // ---- Post container selectors (public profile) ---------------------
      const PUBLIC_POST_SELECTORS = [
        'div.feed-shared-update-v2',
        'li.profile-creator-shared-feed-update__container',
        'div.occludable-update',
        'div[data-urn*="activity"]',
        'div[data-id*="activity"]'
      ];
      // Sales Navigator keeps its <article> shape.
      const SALESNAV_POST_SELECTORS = ['article'];

      // ---- Locate the Activity section -----------------------------------
      // Prefer the semantic anchor already resolved for the page (#about /
      // #experience style anchors); fall back through public-profile shapes,
      // then Sales Navigator.
      function findActivitySection() {
        // 1. Public profile: #content_collections anchor inside a <section>.
        const anchor = document.getElementById('content_collections');
        if (anchor) {
          const sec = anchor.closest('section');
          if (sec) return { el: sec, layout: 'public', via: '#content_collections' };
        }

        // 2. Reuse the section map built earlier in this function.
        if (sections.activity) {
          return { el: sections.activity, layout: 'public', via: 'sections.activity (heading match)' };
        }

        // 3. Public profile: a <section> whose heading reads "Activity".
        const byHeading = Array.from(document.querySelectorAll('main section')).find((sec) => {
          const h = sec.querySelector('h2, h3, [role="heading"]');
          return h && /^activity$/i.test(norm(h.textContent));
        });
        if (byHeading) return { el: byHeading, layout: 'public', via: 'section heading "Activity"' };

        // 4. Sales Navigator (legacy primary target) — kept for compatibility.
        const salesNav = document.querySelector('section[class*="_recent-activity-v2__section"]');
        if (salesNav) return { el: salesNav, layout: 'salesnav', via: 'section[class*="_recent-activity-v2__section"]' };

        // 5. Any remaining recent-activity-ish section.
        const loose = document.querySelector('section[class*="recent-activity"]');
        if (loose) return { el: loose, layout: 'public', via: 'section[class*="recent-activity"]' };

        return null;
      }

      // ---- Count post candidates inside a root ---------------------------
      function findPostCandidates(root, selectorList) {
        const seen = new Set();
        const out = [];
        let matched = null;
        for (const sel of selectorList) {
          let els = [];
          try { els = Array.from(root.querySelectorAll(sel)); } catch (e) { continue; }
          for (const el of els) {
            // Normalise to the outermost post container so nested matches
            // (e.g. a data-urn div inside feed-shared-update-v2) collapse.
            let postEl = el;
            try {
              postEl = el.closest(PUBLIC_POST_SELECTORS.join(', ')) || el;
            } catch (e) { /* keep el */ }
            if (seen.has(postEl)) continue;
            seen.add(postEl);
            out.push(postEl);
            if (!matched) matched = sel;
          }
        }
        return { elements: out, matchedSelector: matched };
      }

      let found = findActivitySection();
      POSTS_DBG.activitySectionFound = !!found;
      POSTS_DBG.layout = found ? found.layout : null;
      console.log('[POSTS] url:', POSTS_DBG.url);
      console.log('[POSTS] activity section found:', !!found, found ? `| layout=${found.layout} | via=${found.via}` : '');

      // ---- Scroll until the Activity section is hydrated -----------------
      // The earlier forceLazySections() pass stops as soon as #about and
      // #experience exist — Activity sits below those, so it is usually still
      // un-hydrated here. Scroll it into view and poll until real post
      // containers appear (or the section reports it is empty).
      if (found) {
        const HYDRATE_TIMEOUT_MS = 6000;
        const POLL_MS = 250;
        const started = Date.now();
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const originalY = window.scrollY;

        // Phrases LinkedIn shows when there is genuinely nothing to display.
        const EMPTY_RE = /(hasn'?t posted( lately| yet)?|has not posted|no posts yet|nothing to see here|no activity)/i;

        let selectorList = found.layout === 'salesnav'
          ? SALESNAV_POST_SELECTORS.concat(PUBLIC_POST_SELECTORS)
          : PUBLIC_POST_SELECTORS.concat(SALESNAV_POST_SELECTORS);

        let candidates = { elements: [], matchedSelector: null };
        let emptyStateSeen = false;

        while (Date.now() - started < HYDRATE_TIMEOUT_MS) {
          // Re-resolve each pass: LinkedIn can replace the section node
          // wholesale as it hydrates, leaving a detached element behind.
          if (!found.el.isConnected) {
            const again = findActivitySection();
            if (again) { found = again; POSTS_DBG.layout = again.layout; }
          }

          try { found.el.scrollIntoView({ block: 'center' }); } catch (e) { /* non-fatal */ }
          await sleep(POLL_MS);

          candidates = findPostCandidates(found.el, selectorList);
          if (candidates.elements.length > 0) break;

          // Explicit "no posts" empty state — stop waiting, this is a real
          // answer, not a slow load. Use textContent, not innerText: innerText
          // is layout-dependent and returns '' for nodes that aren't rendered.
          if (EMPTY_RE.test(norm(found.el.textContent || ''))) { emptyStateSeen = true; break; }

          // Nudge past the section to trigger the lazy loader below it.
          try { window.scrollBy(0, Math.floor(window.innerHeight * 0.5)); } catch (e) { /* non-fatal */ }
        }

        POSTS_DBG.hydrationWaitMs = Date.now() - started;
        POSTS_DBG.activitySectionLoaded = candidates.elements.length > 0 || emptyStateSeen;
        POSTS_DBG.candidateCount = candidates.elements.length;
        POSTS_DBG.matchedSelector = candidates.matchedSelector;

        console.log('[POSTS] activity section loaded (hydrated):', POSTS_DBG.activitySectionLoaded,
          `| waited ${POSTS_DBG.hydrationWaitMs}ms | candidates=${candidates.elements.length}`,
          candidates.matchedSelector ? `| via selector: ${candidates.matchedSelector}` : '',
          emptyStateSeen ? '| empty-state text present' : '');

        try { window.scrollTo(0, originalY); } catch (e) { /* non-fatal */ }

        if (emptyStateSeen && candidates.elements.length === 0) {
          POSTS_DBG.reason = 'profile shows an explicit empty activity state (no posts, or posts not publicly visible)';
        }

        // ---- Extract each post -------------------------------------------
        // Preview-only path (fallback when the activity page is unavailable).
        // Capped at 20 to match the authored-post target; unlike the activity
        // collector this pass does NOT classify authorship, so it can include
        // likes/reshares — hence it is only used when the activity page fails.
        const MAX_POSTS = 20;
        const limit = Math.min(candidates.elements.length, MAX_POSTS);

        for (let i = 0; i < limit; i++) {
          const postEl = candidates.elements[i];
          const postData = {};

          try {
            // Type — from the actor sub-description / header wording.
            const headerText = norm(
              (postEl.querySelector('.update-components-actor__sub-description, header h4, .feed-shared-actor__sub-description') || {}).textContent || ''
            );
            const wholeText = norm(postEl.innerText || '');
            const typeMatch = (headerText + ' ' + wholeText).match(/\b(shared|reshared|reposted|commented on|posted|published|liked|celebrated)\b/i);
            postData.type = typeMatch ? typeMatch[1].toLowerCase() : 'post';

            // Date — <time datetime> when present, else the relative label.
            const timeEl = postEl.querySelector('time[datetime]');
            if (timeEl) {
              postData.date = timeEl.getAttribute('datetime');
              postData.relativeTime = norm(timeEl.textContent);
            } else {
              postData.date = null;
              const rel = postEl.querySelector('.update-components-actor__sub-description span[aria-hidden="true"], .update-components-actor__sub-description');
              // LinkedIn renders "2w • Edited" / "3d • Visible to anyone" — the
              // age is the FIRST segment; trailing segments are modifiers.
              postData.relativeTime = rel ? (norm(rel.textContent).split('•')[0] || '').trim() || null : null;
            }

            // Text — public-profile text containers first.
            const TEXT_SELECTORS = [
              '.update-components-text',
              '.feed-shared-update-v2__description',
              '.feed-shared-inline-show-more-text',
              '.update-components-update-v2__commentary',
              '.break-words',
              'span[class*="_article-text"]',      // Sales Navigator
              'span[title][class*="_text"]',        // Sales Navigator
              'span[dir="ltr"]'
            ];

            let fullText = '';
            for (const sel of TEXT_SELECTORS) {
              const el = postEl.querySelector(sel);
              if (!el) continue;
              // A title attribute often holds the untruncated copy.
              const titleAttr = el.getAttribute && el.getAttribute('title');
              const elText = norm(el.innerText || el.textContent || '');
              if (titleAttr && norm(titleAttr).length > elText.length) {
                fullText = norm(titleAttr);
              } else if (elText.length > fullText.length) {
                fullText = elText;
              }
              if (fullText.length > 20) break;
            }

            // Last resort: the container's own text minus the action bar.
            if (!fullText || fullText.length < 20) {
              const stripped = wholeText
                .split('\n')
                .filter((line) => !/^(like|comment|repost|send|share|follow)$/i.test(line.trim()))
                .join(' ');
              if (stripped.length > fullText.length) fullText = norm(stripped);
            }

            postData.text = fullText
              .replace(/\s*…\s*$/, '')
              .replace(/\s*(see|show) more\s*$/i, '')
              .trim();

            // Image.
            const imgEl = postEl.querySelector(
              '.update-components-image img, .feed-shared-image img, img[data-delayed-url], img[class*="_article-image"], img[class*="article-image"]'
            );
            if (imgEl) {
              postData.hasImage = true;
              postData.imageUrl = imgEl.src || imgEl.getAttribute('data-delayed-url') || '';
              postData.imageAlt = imgEl.alt || '';
            } else {
              postData.hasImage = false;
            }

            // Engagement — public profile exposes these as social-counts nodes.
            postData.engagement = { reactions: 0, comments: 0 };

            const reactionEl = postEl.querySelector(
              '.social-details-social-counts__reactions-count, button[aria-label*="reaction"], span.social-details-social-counts__social-proof-text, span[aria-hidden="true"][class*="ml2"]'
            );
            if (reactionEl) {
              const n = parseInt(norm(reactionEl.getAttribute('aria-label') || reactionEl.textContent).replace(/[^\d]/g, ''), 10);
              if (!isNaN(n)) postData.engagement.reactions = n;
            }

            const commentEl = postEl.querySelector(
              '.social-details-social-counts__comments, li.social-details-social-counts__comments, button[aria-label*="comment"], span[class*="mlA"]'
            );
            if (commentEl) {
              const n = parseInt(norm(commentEl.getAttribute('aria-label') || commentEl.textContent).replace(/[^\d]/g, ''), 10);
              if (!isNaN(n)) postData.engagement.comments = n;
            }

            // Post permalink, when the container exposes one.
            const linkEl = postEl.querySelector('a[href*="/feed/update/"], a[href*="activity-"]');
            postData.postUrl = linkEl && linkEl.href ? linkEl.href.split('?')[0] : '';

            if (postData.text && postData.text.length > 10) {
              data.posts.push(postData);
            } else {
              POSTS_DBG.rejected++;
              console.log(`[POSTS] candidate ${i + 1} rejected — text length ${(postData.text || '').length} (needs > 10)`);
            }
          } catch (error) {
            POSTS_DBG.errors++;
            console.error(`[POSTS] error extracting post ${i + 1}:`, error);
          }
        }
      } else {
        // No Activity section anywhere — last-ditch page-wide sweep, because
        // some layouts render posts outside a recognisable <section>.
        const sweep = findPostCandidates(document, PUBLIC_POST_SELECTORS);
        POSTS_DBG.candidateCount = sweep.elements.length;
        POSTS_DBG.matchedSelector = sweep.matchedSelector;
        console.log('[POSTS] no activity section — page-wide sweep found', sweep.elements.length, 'candidate(s)');
        console.log('[POSTS] page-wide selector counts:',
          PUBLIC_POST_SELECTORS.map((s) => `${s}=${document.querySelectorAll(s).length}`).join(' | '));

        for (const postEl of sweep.elements.slice(0, 10)) {
          const text = norm(postEl.innerText || '');
          if (text.length > 20) {
            data.posts.push({
              text: text.slice(0, 5000),
              type: 'post',
              date: null,
              relativeTime: null,
              engagement: { reactions: 0, comments: 0 },
              hasImage: false,
              postUrl: ''
            });
          } else {
            POSTS_DBG.rejected++;
          }
        }

        if (data.posts.length === 0) {
          POSTS_DBG.reason = 'no Activity section found and no post containers anywhere on the page — the profile has no public activity, or posts are not publicly visible';
        }
      }
    } catch (postsError) {
      // Requirement 7: never fail the whole extraction because of posts.
      POSTS_DBG.errors++;
      POSTS_DBG.reason = 'posts extraction threw: ' + (postsError && postsError.message ? postsError.message : String(postsError));
      console.error('[POSTS] extraction error (returning empty array):', postsError);
      if (!Array.isArray(data.posts)) data.posts = [];
    }

    // ---- Posts debug summary ---------------------------------------------
    POSTS_DBG.extracted = data.posts.length;
    if (data.posts.length === 0 && !POSTS_DBG.reason) {
      if (!POSTS_DBG.activitySectionFound) {
        POSTS_DBG.reason = 'Activity section not found on this page';
      } else if (!POSTS_DBG.activitySectionLoaded) {
        POSTS_DBG.reason = `Activity section found but never hydrated within ${POSTS_DBG.hydrationWaitMs}ms (no post containers appeared)`;
      } else if (POSTS_DBG.candidateCount > 0) {
        POSTS_DBG.reason = `${POSTS_DBG.candidateCount} post container(s) found but all were rejected (text too short or unreadable); rejected=${POSTS_DBG.rejected}, errors=${POSTS_DBG.errors}`;
      } else {
        POSTS_DBG.reason = 'Activity section hydrated but contained no post containers (no public posts)';
      }
    }
    console.log('[POSTS] posts found:', data.posts.length);
    if (data.posts.length === 0) console.log('[POSTS] ZERO POSTS — reason:', POSTS_DBG.reason);
    console.log('[POSTS] summary:', POSTS_DBG);
    data.__postsDebug = POSTS_DBG;

    // TEMP VERIFICATION: attach per-field source map + page structure so the
    // panel can print a compact per-profile report. Remove once verified.
    //
    // Deterministic Experience diagnostic, returned as a FIRST-CLASS field on
    // the payload rather than logged.
    //
    // Why a separate top-level field and not just __diag.experience: the
    // extractor runs in the LinkedIn page context, so its own console output
    // lands in the page's console and is unreadable from the panel. This object
    // travels back through the executeScript() return value, so the panel can
    // state what happened with zero dependence on console context or filtering.
    // Flat and primitive-only so structured-clone across the frame boundary
    // cannot drop it.
    data.experienceDebug = {
      build: SCRAPER_BUILD,
      frameUrl: (window.location.href || '').slice(0, 120),
      isTopFrame: window.top === window.self,
      anchorPresent: !!document.getElementById('experience'),
      sectionFound: !!sections.experience,
      rowsDetected: EXP_DBG.rowsDetected || 0,
      liRows: sections.experience ? sections.experience.querySelectorAll('li').length : 0,
      parsed: Array.isArray(data.experiences) ? data.experiences.length : 0,
      scrollContainer: EXP_DBG.scrollContainer || '',
      scrollRounds: EXP_DBG.rounds || 0,
      finalScrollTop: EXP_DBG.scrollY || 0,
      finalScrollHeight: EXP_DBG.scrollHeight || 0,
      matchedSelectors: (EXP_DBG.selectorsMatched || []).slice(),
      failedSelectors: (EXP_DBG.selectorsFailed || []).slice(),
      parserReached: !!EXP_DBG.parserReached,
      parserResultCount: EXP_DBG.parserResultCount || 0,
      voyagerCount: EXP_DBG.voyagerCount || 0,
      scrollSectionFound: !!EXP_DBG.sectionFound,
      reason: EXP_DBG.reason || '',
      // Scroll-root survey — proves whether the document was scrollable at all,
      // how many real scroll containers existed, and whether the chosen one
      // actually moved when written to.
      docClientH: EXP_DBG.docClientH || 0,
      docScrollH: EXP_DBG.docScrollH || 0,
      bodyClientH: EXP_DBG.bodyClientH || 0,
      bodyScrollH: EXP_DBG.bodyScrollH || 0,
      innerH: EXP_DBG.innerH || 0,
      scrollableCount: EXP_DBG.scrollableCount || 0,
      rootCandidates: EXP_DBG.rootCandidates || 0,
      scrollVerifyBefore: EXP_DBG.scrollVerifyBefore || 0,
      scrollVerifyAfter: EXP_DBG.scrollVerifyAfter || 0,
      scrollVerifyMoved: !!EXP_DBG.scrollVerifyMoved,
      // "Experience" text presence over time. before=0 → after>0 proves lazy
      // rendering; before>0 with parsed=0 proves a detector gap, not absence.
      scanBeforeExpText: EXP_DBG.scanBeforeExpText || 0,
      scanBeforeExpExact: EXP_DBG.scanBeforeExpExact || 0,
      lastScanExpText: EXP_DBG.lastScanExpText || 0,
      lastScanExpExact: EXP_DBG.lastScanExpExact || 0,
      finalScanExpText: EXP_DBG.finalScanExpText || 0,
      finalScanExpExact: EXP_DBG.finalScanExpExact || 0,
      finalScanAbout: EXP_DBG.finalScanAbout || 0,
      // Titles/companies only — enough to prove identity, no private detail.
      titles: (Array.isArray(data.experiences) ? data.experiences : [])
        .map((e) => norm(e && e.jobTitle) || '(no title)').slice(0, 25),
      // Cross-checks for the "is this frame even the profile?" question.
      aboutLen: (data.about || '').length,
      hasFullName: !!data.fullName
    };
    data.__sources = fieldSources;
    data.__diag = {
      pageType: 'linkedin',
      build: SCRAPER_BUILD,
      isTopFrame: window.top === window.self,
      frameUrl: (window.location.href || '').slice(0, 120),
      counts: {
        h1: deepQueryAll('h1').length,
        code: deepQueryAll('code').length,
        jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
        ogTitle: document.querySelectorAll('meta[property="og:title"]').length
      },
      // Why Experience is empty, answered directly rather than inferred.
      lazy: LAZY_DBG,
      aboutLen: (data.about || '').length,
      experience: {
        anchorPresent: !!document.getElementById('experience'),
        sectionFound: !!sections.experience,
        // How many candidate rows the section held when parsed. 0 with
        // sectionFound=true means the section mounted but held no <li> rows;
        // anchorPresent=false means it never rendered at all.
        liRows: sections.experience
          ? sections.experience.querySelectorAll('li').length
          : 0,
        parsed: Array.isArray(data.experiences) ? data.experiences.length : 0,
        // The dedicated scroll-until-visible pass: container, rounds, scroll
        // position/height, rows detected, and which selectors hit or missed.
        scroll: EXP_DBG
      }
    };
    return data;
  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
}
