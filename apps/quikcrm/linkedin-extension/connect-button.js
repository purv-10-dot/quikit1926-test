/**
 * QuikCRM Connect — LinkedIn profile page content script.
 *
 * Injects a single "QuikCRM Connect" button beside LinkedIn's native Connect
 * button on member profile pages. Clicking it:
 *   1. Opens the QuikCRM side panel.
 *   2. Asks the panel to extract this profile and its posts.
 *   3. The panel populates its review form.
 *
 * EXTRACTION AND PREVIEW ONLY — this button performs NO persistence. Nothing
 * is written to the CRM until the user reviews the extracted data and clicks
 * "Save to CRM" in the panel, which is the sole owner of that write.
 *
 * This script owns only the button and the DOM observation. All network and
 * chrome.scripting work happens in the background service worker, because a
 * content script cannot call chrome.tabs/chrome.scripting and must not hold
 * the auth token.
 *
 * Defensive by design: every LinkedIn selector below is a guess about a UI we
 * do not control, so each lookup is multi-strategy and every failure degrades
 * to a clear toast rather than a thrown error or a false activity log.
 */
(function () {
  'use strict';

  // Guard against double-injection: SPA navigations, a manual re-inject, and
  // the manifest match can all run this file more than once in one page.
  if (window.__quikcrmConnectInjected) return;
  window.__quikcrmConnectInjected = true;

  const BUTTON_ID = 'quikcrm-connect-btn';

  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

  /**
   * Visible label of a control.
   *
   * Prefers innerText (respects CSS, so it ignores LinkedIn's visually-hidden
   * a11y spans) but falls back to textContent, which matters in two real
   * cases: elements inside a collapsed dropdown, where innerText is empty
   * because nothing is rendered, and LinkedIn's own `.artdeco-button__text`
   * span. Without the fallback, Connect inside a closed "More" menu is
   * invisible to every text match below.
   */
  function labelOf(el) {
    if (!el) return '';
    const inner = norm(el.innerText);
    if (inner) return inner;
    const span = el.querySelector && el.querySelector('.artdeco-button__text');
    if (span) {
      const s = norm(span.textContent);
      if (s) return s;
    }
    return norm(el.textContent);
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────
  // Every stage of the injection pipeline reports here, so a failure names its
  // exact cause instead of bailing silently. Set window.__qcrmDebug = false in
  // the console to quieten it.
  const log = (...args) => {
    if (window.__qcrmDebug === false) return;
    console.log('[QCRM]', ...args);
  };
  const fail = (reason, extra) => {
    console.warn(`[QCRM] Injection failed because ${reason}`, extra || '');
  };

  log('connect-button.js loaded', {
    url: window.location.href,
    readyState: document.readyState,
  });

  /**
   * Dump every button on the page with the attributes that identify it.
   * Exposed as window.__qcrmDumpButtons() so it can be re-run by hand after
   * expanding the "More" menu.
   */
  function dumpButtons() {
    const all = Array.from(document.querySelectorAll('button, a[role="button"]'));
    log(`document.querySelectorAll("button") → ${all.length} candidates`);
    const rows = all.map((b, i) => ({
      i,
      text: labelOf(b).slice(0, 40),
      ariaLabel: norm(b.getAttribute('aria-label')).slice(0, 60),
      cls: (b.className || '').toString().slice(0, 60),
      inMain: !!b.closest('main'),
      inAside: !!b.closest('aside'),
    }));
    if (console.table) console.table(rows);
    else log(rows);
    return all;
  }
  window.__qcrmDumpButtons = dumpButtons;

  /** Compact "tag.class#id" description, for logging an injection target. */
  function describeElement(el) {
    if (!el) return '(none)';
    const cls = (el.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  }

  /**
   * Count Connect buttons inside vs. outside the profile root.
   *
   * The "outside" figure is the whole point of the scoping rule: those are the
   * Connect buttons belonging to OTHER people ("More profiles for you", the
   * right rail, feed cards, ads). If our button ever lands next to one of
   * those, this log is what proves the scope leaked.
   */
  function countConnectButtons(root) {
    const isConnect = (b) =>
      /^connect$/i.test(labelOf(b)) ||
      /invite\b.*\bto connect/i.test(norm(b.getAttribute('aria-label')));

    const all = Array.from(document.querySelectorAll('button, a[role="button"]')).filter(
      (b) => b.id !== BUTTON_ID && isConnect(b),
    );
    const inside = root ? all.filter((b) => root.contains(b)) : [];
    const outside = all.filter((b) => !root || !root.contains(b));

    log('Connect button census', {
      insideProfileRoot: inside.length,
      outsideProfileRoot: outside.length,
      outsideIgnored: outside
        .slice(0, 8)
        .map((b) => norm(b.getAttribute('aria-label')) || labelOf(b)),
    });
    return { inside, outside };
  }
  window.__qcrmCountConnect = () => countConnectButtons(findProfileRoot());

  // ── Page predicate ─────────────────────────────────────────────────────────
  // Only member profile pages (/in/<slug>). Deliberately excludes the feed,
  // search, company pages, and our own /recent-activity/ scrape tabs — those
  // have Connect buttons for OTHER people, where a button labelled with this
  // page's profile would log the wrong prospect.
  function isProfilePage() {
    const { hostname, pathname } = window.location;
    if (!/(^|\.)linkedin\.com$/i.test(hostname)) return false;
    if (!/^\/in\/[^/]+\/?$/i.test(pathname)) return false;
    return true;
  }

  // ── Profile root discovery ─────────────────────────────────────────────────
  // EVERYTHING below is scoped to this element. The page is full of Connect
  // buttons that belong to OTHER people — "More profiles for you", the right
  // rail, feed cards, ads, suggested connections — and injecting next to one of
  // those puts our button on a stranger's card and would log the wrong
  // prospect. So we never query `document` for a Connect button, and a failure
  // to find the profile root means we do not inject at all.
  // NO LinkedIn CSS class names are used anywhere in this section. LinkedIn
  // ships hashed/obfuscated class names on the current UI and renames them
  // without notice, so the profile root and the action bar are both located
  // purely through DOM relationships: the name heading, the profile image, the
  // Contact info link, and the CTA buttons.

  /**
   * Buttons that identify the primary CTA row. Text/aria only — no classes.
   * Declared above its first use so no call path can hit the temporal dead
   * zone.
   */
  const CTA_TEXT_RE =
    /^(connect|message|follow|following|pending|more|more actions|invite|save in sales navigator)$/i;

  /**
   * The subset that proves a container is a PERSON's action bar.
   *
   * Deliberately WIDER than the visible-CTA set, because layout variants ship
   * action bars that contain none of Connect/Message/Follow:
   *   - Hiring / Open-to-work  → "View my services", "Show recruiters"
   *   - Creator mode           → "Follow" + "Message" (covered) but also
   *                              "View my newsletter"
   *   - Website-only profiles  → a single "Visit my website" anchor
   *   - Premium / Recruiter    → "Save in Sales Navigator", "Add note"
   * Requiring Connect/Message here is what made those layouts fall through to
   * "action bar not found", so the row is now identified by CTA-shape, and the
   * primary set only ranks candidates rather than gating them.
   */
  const PRIMARY_CTA_RE = /^(connect|message|following|follow)$/i;

  /**
   * Secondary CTA vocabulary — these DO identify a profile action row when no
   * primary CTA is present. Matched against text AND aria-label.
   */
  const SECONDARY_CTA_RE =
    /^(visit my website|visit website|website|view my services|my services|show recruiters|view my newsletter|newsletter|add note|save in sales navigator|save|contact info|open to|book an appointment|view portfolio|subscribe)/i;

  /** Visible = renders a box. Catches display:none and the sr-only H1. */
  function isVisible(el) {
    if (!el) return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return true;
    // jsdom and some hydration states report no rects at all; fall back to an
    // explicit hidden check rather than declaring the whole page invisible.
    if (typeof window.getComputedStyle === 'function') {
      const s = window.getComputedStyle(el);
      if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
      return true;
    }
    return true;
  }

  /**
   * The profile NAME heading.
   *
   * The current LinkedIn UI does not always render an <h1>, and the previous
   * implementation aborted outright when one was missing — that was the actual
   * cause of "profile root (top card) was not found". So h1 is only the
   * preferred case: we fall back to any heading element, then to an
   * aria-level heading, and finally to a heading-shaped element near the
   * avatar. Never a reason to fail on its own.
   */
  function findProfileHeading(scope) {
    // The sticky header repeats the name as its own heading, so it is filtered
    // out at every tier — otherwise the document-wide fallback could anchor the
    // root on the floating toolbar instead of the static card.
    const notSticky = (el) => !isStickyProfileHeader(el);

    const h1s = Array.from(scope.querySelectorAll('h1')).filter(notSticky);
    const visibleH1 = h1s.find((h) => isVisible(h) && norm(h.textContent));
    if (visibleH1) return { el: visibleH1, via: 'h1' };
    if (h1s.length) return { el: h1s[0], via: 'h1 (hidden)' };

    // No h1 on this layout — accept any real heading.
    const heads = Array.from(
      scope.querySelectorAll('h2, h3, [role="heading"], [aria-level]'),
    ).filter(notSticky);
    const head = heads.find((h) => isVisible(h) && norm(h.textContent));
    if (head) return { el: head, via: head.tagName.toLowerCase() + ' (no h1 on this layout)' };

    return null;
  }

  /** Alt/aria text that means "this is the banner", never the avatar. */
  const COVER_RE = /cover|banner|background/i;

  /**
   * The profile AVATAR — explicitly NOT the cover photo.
   *
   * The cover image is the first <img> in the top card and its alt reads
   * "Cover photo", which the previous generic detector happily matched. Every
   * strategy here excludes cover/banner/background images first.
   *
   * Ordered strongest → weakest, all class-free:
   *   1. img whose alt/aria names a profile photo (and is not a cover)
   *   2. img inside a link/button pointing at a member profile (/in/...)
   *   3. img rendered roughly square — an avatar is 1:1, a banner is wide
   */
  function findAvatar(scope) {
    const imgs = Array.from(scope.querySelectorAll('img')).filter((img) => {
      // The sticky header carries its own small avatar. Excluding it here keeps
      // the document-wide fallback from anchoring on the floating toolbar.
      if (isStickyProfileHeader(img)) return false;
      const alt = norm(img.getAttribute('alt'));
      const aria = norm(img.getAttribute('aria-label'));
      return !COVER_RE.test(alt) && !COVER_RE.test(aria);
    });

    // 1 — named as a profile photo.
    const named = imgs.find((img) => {
      const alt = norm(img.getAttribute('alt'));
      const aria = norm(img.getAttribute('aria-label'));
      return /profile photo|profile picture|avatar|photo of/i.test(alt + ' ' + aria);
    });
    if (named) return { el: named, via: 'alt/aria names a profile photo' };

    // 2 — wrapped in a control that targets a member profile.
    const wrapped = imgs.find((img) => img.closest('a[href*="/in/"], button[aria-label*="photo" i]'));
    if (wrapped) return { el: wrapped, via: 'img inside a /in/ link or photo button' };

    // 3 — square-ish geometry. A cover photo is markedly wider than tall.
    const square = imgs.find((img) => {
      const r = typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect() : null;
      const w = (r && r.width) || img.width || 0;
      const h = (r && r.height) || img.height || 0;
      if (!w || !h) return false;
      return w >= 40 && h >= 40 && Math.abs(w - h) / Math.max(w, h) < 0.2;
    });
    if (square) return { el: square, via: 'square-ish image (avatar geometry)' };

    return null;
  }

  /** Back-compat shim: some callers only need "is there an avatar in here". */
  function findProfileImage(el) {
    const a = findAvatar(el);
    return a ? a.el : null;
  }

  /**
   * Contact info link — a strong, class-free signal that we are on the
   * profile's own top card. Recommendation cards never carry one.
   */
  function findContactInfo(el) {
    const nodes = Array.from(el.querySelectorAll('a, button'));
    return (
      nodes.find((n) => {
        const t = labelOf(n);
        const aria = norm(n.getAttribute('aria-label'));
        const href = n.getAttribute('href') || '';
        return (
          /contact info/i.test(t) ||
          /contact info/i.test(aria) ||
          /overlay\/contact-info/i.test(href)
        );
      }) || null
    );
  }

  /**
   * Every clickable that could belong to a profile action row.
   *
   * Anchors are included WITHOUT requiring role="button": the "Visit my
   * website" CTA and creator-mode newsletter links are plain <a> elements, and
   * requiring the role excluded those layouts entirely.
   */
  function clickablesIn(el) {
    return Array.from(el.querySelectorAll('button, a[role="button"], a[href], [role="button"]'));
  }

  /**
   * Identity signals for one clickable, read from several independent sources so
   * no single LinkedIn change can blind the matcher.
   *
   * Class names are deliberately NOT consulted (requirement 3).
   */
  function ctaSignals(node) {
    const text = labelOf(node);
    const aria = norm(node.getAttribute('aria-label'));
    // Icon-only CTAs put the word in a nested aria-label or a title.
    const title = norm(node.getAttribute('title'));
    const inner = node.querySelector('[aria-label], [title]');
    const nested = inner
      ? norm(inner.getAttribute('aria-label') || inner.getAttribute('title'))
      : '';
    // LinkedIn's SDUI layouts carry the semantic name in data attributes.
    const dataName = norm(
      node.getAttribute('data-view-name') ||
        node.getAttribute('data-control-name') ||
        node.getAttribute('data-test-icon') ||
        '',
    );
    return { text, aria, title, nested, dataName };
  }

  /** True when any identity signal matches `re`. */
  function ctaMatches(node, re) {
    const s = ctaSignals(node);
    if (re.test(s.text)) return true;
    // aria-label is a sentence ("Invite Jane Doe to connect"), so anchor the
    // CTA verb at the start rather than requiring a whole-string match.
    const ariaVerb = s.aria.replace(/^(invite|send)\s+.*?\s+(to\s+)?/i, '');
    if (re.test(ariaVerb) || re.test(s.aria)) return true;
    if (s.title && re.test(s.title)) return true;
    if (s.nested && re.test(s.nested)) return true;
    if (s.dataName && re.test(s.dataName.replace(/[-_]/g, ' '))) return true;
    return false;
  }

  /** CTA buttons of a person's action bar, found inside `el`. */
  function ctaButtonsIn(el, re) {
    const rx = re || CTA_TEXT_RE;
    return clickablesIn(el).filter((b) => {
      if (b.id === BUTTON_ID) return false;
      if (b.closest('#' + BUTTON_ID)) return false;
      return ctaMatches(b, rx);
    });
  }

  /**
   * Any CTA that identifies a profile action row — primary OR secondary.
   * Used to recognise Website-only / Hiring / Creator layouts that carry no
   * Connect or Message control at all.
   */
  function anyProfileCtaIn(el) {
    return clickablesIn(el).filter((b) => {
      if (b.id === BUTTON_ID || b.closest('#' + BUTTON_ID)) return false;
      return ctaMatches(b, PRIMARY_CTA_RE) || ctaMatches(b, SECONDARY_CTA_RE);
    });
  }

  function containsCtaRow(el) {
    return anyProfileCtaIn(el).length > 0;
  }

  // findProfileRoot() runs on every mutation, so these log helpers fire only
  // when the resolved element actually changes.
  /**
   * Report WHERE the profile root was searched for — inside <main>, or via the
   * document-wide fallback used when the sticky header has displaced the card.
   *
   * Throttled to once per distinct value: findProfileRoot() runs on every
   * mutation, so logging unconditionally would flood the console.
   */
  let lastLoggedScope = '';
  function logScopeOnce(where) {
    if (where === lastLoggedScope) return;
    lastLoggedScope = where;
    log(`profile root scope: ${where}`);
  }

  let lastLoggedRoot = null;
  function logRootOnce(el, via, extra) {
    if (el === lastLoggedRoot) return;
    lastLoggedRoot = el;
    log('profile root found', {
      strategy: via,
      target: describeElement(el),
      ...(extra || {}),
    });
  }

  /**
   * Emit the required pre-failure diagnostic block.
   * Throttled to once per distinct page state so a mutation storm cannot spam.
   */
  let lastFailureKey = '';
  function reportRootFailure(main, headingEl, avatarEl) {
    const scope = main || document;
    const contact = main ? findContactInfo(main) : null;
    const buttons = main ? ctaButtonsIn(main) : [];
    const key = [!!headingEl, !!avatarEl, !!contact, buttons.length].join('|');
    if (key === lastFailureKey) return;
    lastFailureKey = key;

    const rootish = avatarEl || headingEl || scope;
    log('── profile root NOT found — diagnostic ──');
    log(
      'Heading:',
      headingEl
        ? `"${norm(headingEl.textContent).slice(0, 60)}" (${describeElement(headingEl)}) @ ${exactDomPath(headingEl)}`
        : 'NOT FOUND',
    );
    log(
      'Avatar:',
      avatarEl
        ? `${describeElement(avatarEl)} alt="${norm(avatarEl.getAttribute('alt')).slice(0, 40)}" @ ${exactDomPath(avatarEl)}`
        : 'NOT FOUND (cover/banner images are excluded by design)',
    );
    log('Contact info:', contact ? describeElement(contact) : 'NOT FOUND');
    log(
      'Buttons inside <main>:',
      buttons.length
        ? buttons.map((b) => labelOf(b) || norm(b.getAttribute('aria-label'))).join(' | ')
        : 'NONE',
    );
    log(
      'Root HTML snippet:',
      rootish && rootish.outerHTML ? rootish.outerHTML.slice(0, 600) : '(unavailable)',
    );
  }

  // ── Section boundaries ─────────────────────────────────────────────────────
  // Everything below the top card — About, Activity, Posts, Featured,
  // Experience, Recommendations — must be excluded. Activity in particular
  // contains its own "Follow" button, which is what previously pulled the
  // action bar out of the header and into the feed.
  const BELOW_HEADER_SECTION_RE =
    /^(about|activity|posts|featured|experience|education|skills|recommendations|interests|licenses|certifications|projects|courses|honors|organizations|publications|volunteering|causes|people also viewed|more profiles)/i;

  /**
   * The first section element that begins the below-the-header content.
   *
   * Identified by its heading text, not by class name. Returns the outermost
   * section/card wrapping that heading so containment tests are meaningful.
   */
  function findFirstBelowHeaderSection(main) {
    const heads = Array.from(
      main.querySelectorAll('h2, h3, [role="heading"], [aria-level="2"], [aria-level="3"]'),
    );
    for (const h of heads) {
      const text = norm(h.textContent);
      if (!text || !BELOW_HEADER_SECTION_RE.test(text)) continue;
      const section =
        h.closest('section') ||
        h.closest('[data-view-name]') ||
        h.closest('div.artdeco-card') ||
        h.parentElement;
      if (section && main.contains(section)) return { el: section, label: text.slice(0, 40) };
    }
    return null;
  }

  /**
   * Is `el` positioned before `boundary` in document order?
   * Uses compareDocumentPosition, so it is layout-independent.
   */
  function isBefore(el, boundary) {
    if (!el || !boundary) return true; // no boundary known → nothing to violate
    if (el.contains(boundary)) return false; // el swallows the boundary
    const pos = el.compareDocumentPosition(boundary);
    // FOLLOWING (4) = boundary comes after el → el is above it.
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  /** Nearest common ancestor of the avatar and the heading. */
  function nearestCommonAncestor(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const chain = new Set();
    for (let n = a; n; n = n.parentElement) chain.add(n);
    for (let n = b; n; n = n.parentElement) if (chain.has(n)) return n;
    return null;
  }

  /**
   * Exact DOM path of an element, from <body> down, with nth-child indices.
   * Logged so the chosen root can be verified against the live page.
   */
  function exactDomPath(el) {
    const parts = [];
    for (let n = el; n && n.tagName; n = n.parentElement) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'body' || tag === 'html') break;
      const parent = n.parentElement;
      let idx = '';
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
        if (sibs.length > 1) idx = `:nth-of-type(${sibs.indexOf(n) + 1})`;
      }
      parts.unshift(`${tag}${n.id ? '#' + n.id : ''}${idx}`);
    }
    return parts.join(' > ');
  }

  /**
   * The profile's top card, anchored on the AVATAR.
   *
   * Why the avatar and not the heading: on the current LinkedIn UI the profile
   * often has no <h1> at all, and the previous heading-anchored version
   * aborted outright when one was missing — that was the reported failure. The
   * avatar is always present on a profile page and, unlike the cover photo, is
   * structurally inside the top card.
   *
   * Algorithm:
   *   1. <main>
   *   2. first visible avatar (cover/banner images explicitly excluded)
   *   3. climb from the avatar to the first ancestor that ALSO contains the
   *      profile heading (h1 or any heading) AND the CTA buttons
   *   4. that ancestor is the profile root
   *
   * Fallbacks, weakest last — a missing heading is never fatal on its own:
   *   B. avatar + CTA (heading not yet rendered)
   *   C. heading + CTA (avatar not yet rendered — the old path, kept)
   *   D. up to 6 ancestors from the avatar/heading with >= 2 CTA buttons
   */
  /**
   * LinkedIn's STICKY profile header — a duplicate identity block (avatar,
   * name, headline, Connect/Message) that appears once the page is scrolled.
   *
   * Never a valid injection target: it is a floating toolbar, so a button
   * placed there would scroll away with it and would not be the profile's real
   * action bar. Excluded from every stage of root discovery.
   */
  function isStickyProfileHeader(el) {
    if (!el) return false;
    try {
      return !!el.closest(
        '.global-nav__sticky, [class*="global-nav"], [class*="scaffold-layout-toolbar"], ' +
          '[class*="pv-top-card--reorder"], [class*="sticky"]',
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * The scope to search for the profile top card.
   *
   * `<main>` first — that is where the card lives on a normally-rendered page,
   * and scoping there keeps the right rail's recommendation cards out of reach.
   *
   * But the card is NOT guaranteed to be inside `<main>`. When the page is
   * scrolled, LinkedIn swaps in a sticky header and the real top card can be
   * absent from `<main>` entirely — proven on /in/jeffseebinger/, where
   * `<main>` held 0 images, 0 h1s and 0 CTA buttons while the sticky bar held
   * all of them. findProfileRoot() then returned null and nothing was injected.
   *
   * So when `<main>` cannot supply the signals, fall back to the whole document
   * — with the sticky header excluded, so the fallback can only ever find the
   * static card.
   */
  function findProfileRootScope() {
    const main = document.querySelector('main');

    // "Can this scope actually produce a top card?" — NOT "does it contain a
    // heading?". On a scrolled profile <main> still holds the About/Activity
    // sections, so any h2 test passes and the fallback would never fire. The
    // avatar is the load-bearing signal: the identity block needs it, and only
    // the top card has one.
    if (main && findAvatar(main)) return { scope: main, where: 'inside <main>' };

    // Fallback: the static top card anywhere in the document. Sticky-header
    // elements are excluded inside findAvatar/findProfileHeading, so widening
    // the scope cannot latch onto the floating toolbar.
    if (document.body) return { scope: document.body, where: 'via fallback (outside <main>)' };
    return main ? { scope: main, where: 'inside <main>' } : null;
  }

  // ── Layer 4: candidate ranking ─────────────────────────────────────────────
  //
  // A profile page can present SEVERAL plausible action bars at once: the
  // static top card, the sticky header that swaps in on scroll, and (on some
  // layouts) a duplicated card inside a modal or the right rail.
  //
  // The old pipeline hard-returned the first structural match, so one bad pick
  // ended the attempt. This scores every candidate instead and takes the best,
  // which is what makes the engine layout-independent: a new LinkedIn layout
  // changes the SCORES, not the control flow.
  //
  // Static card always outranks the sticky header (requirement 4a). The sticky
  // header is still scored — and used when nothing else exists (requirement 4b)
  // — so a scrolled/virtualised page shows a button rather than nothing.

  /** True when the element is inside a modal, right rail, or feed surface. */
  function isDisqualifiedSurface(el) {
    if (!el) return true;
    try {
      return !!el.closest(
        'aside, [role="dialog"], [aria-modal="true"], [class*="scaffold-layout__aside"], ' +
          '[class*="browsemap"], [class*="discover"], [data-view-name*="feed"], ' +
          '[class*="msg-overlay"], [class*="artdeco-modal"]',
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Score a candidate action-bar container. Higher is better; a negative score
   * means "never use this".
   *
   * Signals are independent on purpose — losing any one of them degrades the
   * ranking instead of breaking discovery.
   */
  function scoreCandidate(cand, signals) {
    const el = cand.el;
    if (!el) return -Infinity;
    if (isDisqualifiedSurface(el)) return -Infinity;

    let score = 0;
    const notes = [];

    // — Static vs sticky (requirement 4). The static card is strongly
    //   preferred, but sticky remains usable as a last resort.
    if (isStickyProfileHeader(el)) {
      score -= 50;
      notes.push('sticky(-50)');
    } else {
      score += 50;
      notes.push('static(+50)');
    }

    // — Visibility: a rendered box beats a hydrating one.
    if (isVisible(el)) {
      score += 25;
      notes.push('visible(+25)');
    } else {
      score -= 25;
      notes.push('hidden(-25)');
    }

    // — Primary person CTAs present (Connect/Message/Follow).
    const primary = ctaButtonsIn(el, PRIMARY_CTA_RE);
    if (primary.length) {
      score += 20 + Math.min(primary.length, 3) * 5;
      notes.push(`primaryCta x${primary.length}(+${20 + Math.min(primary.length, 3) * 5})`);
    }

    // — Any profile CTA at all (covers Website-only / Hiring / Creator).
    const anyCta = anyProfileCtaIn(el);
    if (anyCta.length) {
      score += 10;
      notes.push('anyCta(+10)');
    } else {
      score -= 30;
      notes.push('noCta(-30)');
    }

    // — Identity adjacency: does this bar belong to the SAME card as the
    //   avatar/name we located? This is what keeps the button off other
    //   people's cards.
    if (signals.avatarEl && cand.root && cand.root.contains(signals.avatarEl)) {
      score += 30;
      notes.push('sharesAvatar(+30)');
    }
    if (signals.headingEl && cand.root && cand.root.contains(signals.headingEl)) {
      score += 15;
      notes.push('sharesHeading(+15)');
    }

    // — Inside <main> is the normal, highest-confidence placement.
    if (el.closest('main')) {
      score += 10;
      notes.push('inMain(+10)');
    }

    // — Tightness: a bar holding the whole card (avatar + heading inside the
    //   BAR itself) is too broad and risks landing next to the name.
    if (signals.avatarEl && el.contains(signals.avatarEl)) {
      score -= 20;
      notes.push('barSwallowsAvatar(-20)');
    }

    cand.notes = notes.join(' ');
    cand.score = score;
    return score;
  }

  /**
   * Layer 1 — every plausible profile top card, in preference order.
   *
   * Returns an ARRAY, not a single element. The previous single-root design
   * meant a root whose action bar was later rejected ended the whole attempt,
   * even when another valid card was sitting right there. Collecting them lets
   * Layer 2/3 try the next one.
   */
  function collectProfileRoots() {
    const roots = [];
    const seen = new Set();
    const push = (el, via) => {
      if (!el || seen.has(el)) return;
      if (isDisqualifiedSurface(el)) return;
      seen.add(el);
      roots.push({ el, via });
    };

    const scopes = [];
    const main = document.querySelector('main');
    if (main) scopes.push({ scope: main, where: 'inside <main>' });
    if (document.body) scopes.push({ scope: document.body, where: 'via fallback (outside <main>)' });

    for (const { scope, where } of scopes) {
      const avatar = findAvatar(scope);
      const heading = findProfileHeading(scope);
      const boundary = findFirstBelowHeaderSection(scope);
      const withinHeader = (el) =>
        !!el && (!boundary || (!el.contains(boundary.el) && isBefore(el, boundary.el)));

      // Identity block: tightest container holding avatar + name.
      if (avatar && heading) {
        const identity = nearestCommonAncestor(avatar.el, heading.el);
        if (identity && withinHeader(identity)) {
          let node = identity;
          for (let d = 0; node && d < 25 && withinHeader(node); d++) {
            if (containsCtaRow(node)) {
              push(node, `identity block (avatar+heading) → CTA row [${where}]`);
              break;
            }
            node = node.parentElement;
          }
        }
      }

      // Climb from the avatar.
      if (avatar) {
        let node = avatar.el.parentElement;
        for (let d = 0; node && d < 25 && withinHeader(node); d++) {
          if (containsCtaRow(node)) {
            push(node, `avatar → ancestor with CTA row [${where}]`);
            break;
          }
          node = node.parentElement;
        }
      }

      // Climb from the heading (avatar lazy or absent).
      if (heading) {
        let node = heading.el.parentElement;
        for (let d = 0; node && d < 25 && withinHeader(node); d++) {
          if (containsCtaRow(node)) {
            push(node, `heading → ancestor with CTA row [${where}]`);
            break;
          }
          node = node.parentElement;
        }
      }

      if (roots.length) break; // this scope produced candidates; don't widen
    }

    // Sticky header LAST (requirement 4b) — a real card always wins, but a
    // sticky-only page still gets a button instead of nothing.
    if (!roots.length) {
      const stickyCta = Array.from(
        document.querySelectorAll(
          '.global-nav__sticky, [class*="scaffold-layout-toolbar"], [class*="pv-top-card--reorder"]',
        ),
      ).find((el) => anyProfileCtaIn(el).length);
      if (stickyCta) {
        seen.add(stickyCta);
        roots.push({ el: stickyCta, via: 'sticky header (no static card available)' });
      }
    }

    return roots;
  }

  function findProfileRoot() {
    const picked = findProfileRootScope();
    if (!picked) return null;
    const main = picked.scope;
    logScopeOnce(picked.where);

    // Signals are read from the chosen scope. The right rail is excluded by
    // <main> scoping in the normal case; in the fallback case the sticky header
    // is excluded explicitly, and every candidate root must still satisfy the
    // action-bar and placement gates that follow.
    const avatar = findAvatar(main);
    const heading = findProfileHeading(main);

    logSignalsOnce(avatar, heading);

    // The top card ends where the first below-header section begins. Any
    // candidate root that reaches past this boundary has swallowed Activity /
    // Posts / About and is rejected — that is what put the button in the
    // Activity feed.
    const boundary = findFirstBelowHeaderSection(main);
    const withinHeader = (el) =>
      !!el && (!boundary || (!el.contains(boundary.el) && isBefore(el, boundary.el)));

    // ── Primary: the identity block — nearest common ancestor of avatar+heading.
    // This is the tightest container that still holds both, so it cannot
    // stretch down into Activity.
    if (avatar && heading) {
      const identity = nearestCommonAncestor(avatar.el, heading.el);
      if (identity && withinHeader(identity)) {
        // Climb only as far as the CTA row, never past the boundary.
        let node = identity;
        let depth = 0;
        while (node && node !== main.parentElement && depth < 25) {
          if (!withinHeader(node)) break; // crossed into About/Activity — stop
          if (containsCtaRow(node)) {
            logRootOnce(node, 'identity block (avatar+heading) → CTA row, above About', {
              avatar: describeElement(avatar.el),
              heading: describeElement(heading.el),
              boundary: boundary ? boundary.label : '(none found)',
              domPath: exactDomPath(node),
            });
            return node;
          }
          node = node.parentElement;
          depth++;
        }
      }
    }

    // ── Secondary: climb from the avatar, still bounded by the header. ──
    if (avatar) {
      let withCta = null;
      let node = avatar.el.parentElement;
      let depth = 0;
      while (node && node !== main.parentElement && depth < 25) {
        if (!withinHeader(node)) break; // never cross into About/Activity
        if (containsCtaRow(node)) {
          if (!withCta) withCta = node;
          // Full signal: this ancestor holds the avatar, the CTAs, and the
          // name heading.
          if (heading && node.contains(heading.el)) {
            logRootOnce(node, 'avatar → ancestor with heading + CTA row', {
              avatar: describeElement(avatar.el),
              heading: describeElement(heading.el),
              domPath: exactDomPath(node),
            });
            return node;
          }
        }
        node = node.parentElement;
        depth++;
      }
      if (withCta) {
        logRootOnce(withCta, 'avatar → ancestor with CTA row (heading not inside)', {
          avatar: describeElement(avatar.el),
          heading: heading ? describeElement(heading.el) : 'none',
          domPath: exactDomPath(withCta),
        });
        return withCta;
      }
    }

    // ── Tertiary: climb from the heading (avatar missing/lazy) ──
    if (heading) {
      let node = heading.el.parentElement;
      let depth = 0;
      while (node && node !== main.parentElement && depth < 25) {
        if (!withinHeader(node)) break; // never cross into About/Activity
        if (containsCtaRow(node)) {
          logRootOnce(node, 'heading → ancestor with CTA row (no avatar found)', {
            heading: describeElement(heading.el),
            domPath: exactDomPath(node),
          });
          return node;
        }
        node = node.parentElement;
        depth++;
      }
    }

    // ── Last resort: 6 ancestors from whichever anchor exists, >= 2 CTAs ──
    const anchor = (avatar && avatar.el) || (heading && heading.el) || null;
    if (anchor) {
      let node = anchor.parentElement;
      for (let i = 0; i < 6 && node && withinHeader(node); i++) {
        const btns = ctaButtonsIn(node);
        if (btns.length >= 2) {
          logRootOnce(node, `6-ancestor fallback (>=2 CTA buttons at depth ${i + 1})`, {
            buttons: btns.map((b) => labelOf(b)).join(' | '),
            domPath: exactDomPath(node),
          });
          return node;
        }
        node = node.parentElement;
      }
    }

    reportRootFailure(main, heading && heading.el, avatar && avatar.el);
    return null;
  }

  // Signal log fires once per distinct (avatar, heading) pair rather than on
  // every mutation.
  let lastSignalKey = '';
  function logSignalsOnce(avatar, heading) {
    const key =
      (avatar ? describeElement(avatar.el) : 'none') +
      '|' +
      (heading ? describeElement(heading.el) : 'none');
    if (key === lastSignalKey) return;
    lastSignalKey = key;
    log(
      'avatar found:',
      avatar
        ? `${describeElement(avatar.el)} [${avatar.via}] alt="${norm(
            avatar.el.getAttribute('alt'),
          ).slice(0, 40)}"`
        : 'NOT FOUND',
    );
    log(
      'profile heading found:',
      heading
        ? `"${norm(heading.el.textContent).slice(0, 50)}" (${describeElement(heading.el)}) [${heading.via}]`
        : 'NOT FOUND (not fatal — avatar anchors the search)',
    );
  }

  // ── Action bar discovery ───────────────────────────────────────────────────
  // Purely structural: the action bar is the closest common ancestor of the
  // profile's own CTA buttons, found INSIDE the root. No class selectors.

  /** Lowest common ancestor of two nodes, or null. */
  function commonAncestor(a, b) {
    if (!a || !b) return a || b;
    const chain = new Set();
    for (let n = a; n; n = n.parentElement) chain.add(n);
    for (let n = b; n; n = n.parentElement) if (chain.has(n)) return n;
    return null;
  }

  /**
   * Validate a candidate action bar against the header-only rules.
   *
   * The decisive checks are `isAboveAbout` and `containsAboutSection`: a
   * container that sits below the About heading, or that swallows it, belongs
   * to Activity/Posts/Experience and must be rejected no matter how many CTA
   * buttons it holds.
   */
  function validateActionBar(el, root, boundary, buttons) {
    // Signals are read from the SCOPE THE ROOT CAME FROM, not from <main>
    // unconditionally. When the root was found via the document-wide fallback,
    // <main> holds no avatar at all, so the old code validated against missing
    // signals and rejected a perfectly good bar.
    const scope = root.closest('main') || document.body || root;
    const avatar = findAvatar(scope);
    const heading = findProfileHeading(scope);

    const isAboveAbout = !boundary || (!el.contains(boundary.el) && isBefore(el, boundary.el));
    const containsAboutSection = !!boundary && el.contains(boundary.el);
    const inRoot = root.contains(el) || el === root;
    const inAside = !!el.closest('aside');

    // Adjacency: the bar must belong to the same identity block as the avatar
    // and name — i.e. share the root, not merely sit somewhere above About.
    const identity = avatar && heading ? nearestCommonAncestor(avatar.el, heading.el) : null;
    const adjacentToIdentity =
      !identity ||
      identity.contains(el) ||
      el.contains(identity) ||
      (identity.parentElement && identity.parentElement.contains(el));

    // Hard requirements only. "Which of several valid bars is BEST" is Layer
    // 4's job (scoreCandidate) — encoding preferences here as hard failures is
    // what made unusual-but-legitimate layouts inject nothing at all.
    const ok = isAboveAbout && !containsAboutSection && inRoot && !inAside;
    return {
      ok,
      isAboveAbout,
      containsAboutSection,
      inRoot,
      inAside,
      adjacentToIdentity,
      containsAvatar: !!(avatar && el.contains(avatar.el)),
      containsHeading: !!(heading && el.contains(heading.el)),
      buttonTexts: buttons.map((b) => labelOf(b) || norm(b.getAttribute('aria-label'))),
    };
  }

  // Throttled so the mutation observer cannot spam these.
  let lastActionBarKey = '';
  function logActionBar(el, boundary, buttons, v) {
    const key = exactDomPath(el) + '|' + v.ok;
    if (key === lastActionBarKey) return;
    lastActionBarKey = key;
    log(v.ok ? '── action bar validated ──' : '── action bar REJECTED ──', {
      actionBarDomPath: exactDomPath(el),
      isAboveAbout: v.isAboveAbout,
      containsAvatar: v.containsAvatar,
      containsHeading: v.containsHeading,
      containsAboutSection: v.containsAboutSection,
      adjacentToIdentity: v.adjacentToIdentity,
      inProfileRoot: v.inRoot,
      inAside: v.inAside,
      buttonTexts: v.buttonTexts,
      boundarySection: boundary ? boundary.label : '(none found)',
    });
  }

  let lastRejectionKey = '';
  function logActionBarRejection(reason, extra) {
    const key = reason + JSON.stringify(extra || {});
    if (key === lastRejectionKey) return;
    lastRejectionKey = key;
    log('action bar not usable:', reason, extra || '');
  }

  /**
   * The profile's primary action bar, searched ONLY within `root`.
   * Returns { el, selector } where `selector` describes how it was found.
   */
  function findActionBar(root) {
    if (!root) return null;

    const main = document.querySelector('main');
    const boundary = main ? findFirstBelowHeaderSection(main) : null;

    // Only buttons that live in the header. Activity/Posts carry their own
    // "Follow" button, which is exactly what previously dragged the action bar
    // down into the feed.
    const aboveAbout = (el) =>
      !boundary || (!boundary.el.contains(el) && isBefore(el, boundary.el));

    // Prefer the row holding the primary person-CTAs (Connect/Message/
    // Following). "More" alone is not enough to identify the row.
    let buttons = ctaButtonsIn(root, PRIMARY_CTA_RE).filter(aboveAbout);
    if (!buttons.length) buttons = ctaButtonsIn(root).filter(aboveAbout);
    if (!buttons.length) {
      logActionBarRejection('no CTA buttons above the About/Activity boundary', {
        boundary: boundary ? boundary.label : '(none found)',
      });
      return null;
    }

    // The container that holds them all — for a single button, its parent.
    let el = buttons[0].parentElement;
    for (let i = 1; i < buttons.length; i++) {
      el = commonAncestor(el, buttons[i].parentElement) || el;
    }
    if (!el || !root.contains(el)) el = buttons[0].parentElement;
    if (!el) return null;

    // With a single CTA button, `commonAncestor` degenerates to that button's
    // parent — but if that parent IS the button (or we later descend into it)
    // we would nest a <button> inside a <button>, which is invalid HTML and
    // collapses to a 0x0 box. Always inject as a SIBLING of the CTA buttons.
    if (el.tagName === 'BUTTON' || el.closest('button')) {
      const safe = (el.tagName === 'BUTTON' ? el : el.closest('button')).parentElement;
      if (safe) el = safe;
    }

    // A common ancestor of widely separated buttons can balloon into a
    // container that also holds the identity block or a section heading. Walk
    // back down to the tightest element that still holds every CTA button —
    // never descending into a button element itself.
    while (
      el.children &&
      el.children.length === 1 &&
      el.children[0].tagName !== 'BUTTON' &&
      buttons.every((b) => el.children[0].contains(b))
    ) {
      el = el.children[0];
    }

    const validation = validateActionBar(el, root, boundary, buttons);
    logActionBar(el, boundary, buttons, validation);
    if (!validation.ok) return null;

    return {
      el,
      selector: `structural: common ancestor of [${buttons
        .map((b) => labelOf(b))
        .join(', ')}] inside profile header`,
    };
  }

  /**
   * Layer 2 + Layer 3 — action-bar candidates inside one root.
   *
   * Layer 2 runs several INDEPENDENT strategies (not one selector), so a
   * LinkedIn markup change disables one strategy rather than the feature.
   * Layer 3 is the last strategy: when no known container shape matches, find
   * the nearest visible row of buttons instead.
   *
   * Returns an array of {el, via} — ranking happens in Layer 4.
   */
  function collectActionBars(root) {
    if (!root) return [];
    const out = [];
    const seen = new Set();
    const push = (el, via) => {
      if (!el || seen.has(el)) return;
      if (!root.contains(el) && el !== root) return;
      if (el.tagName === 'BUTTON' || el.closest('button')) return; // never nest
      seen.add(el);
      out.push({ el, via });
    };

    const scope = root.closest('main') || document.body || root;
    const boundary = findFirstBelowHeaderSection(scope);
    const aboveAbout = (el) =>
      !boundary || (!boundary.el.contains(el) && isBefore(el, boundary.el));

    // ── Strategy A: common ancestor of the PRIMARY person CTAs. ──
    const primary = ctaButtonsIn(root, PRIMARY_CTA_RE).filter(aboveAbout);
    if (primary.length) {
      let el = primary[0].parentElement;
      for (let i = 1; i < primary.length; i++) {
        el = commonAncestor(el, primary[i].parentElement) || el;
      }
      push(tightenBar(el, primary), 'common ancestor of primary CTAs (Connect/Message/Follow)');
    }

    // ── Strategy B: common ancestor of ANY profile CTA. Covers Website-only,
    //    Hiring, Creator-mode and Premium layouts with no Connect/Message. ──
    const anyCta = anyProfileCtaIn(root).filter(aboveAbout);
    if (anyCta.length) {
      let el = anyCta[0].parentElement;
      for (let i = 1; i < anyCta.length; i++) {
        el = commonAncestor(el, anyCta[i].parentElement) || el;
      }
      push(tightenBar(el, anyCta), 'common ancestor of any profile CTA (website/hiring/creator)');
    }

    // ── Strategy C: an explicit action-row landmark, by ROLE not class. ──
    Array.from(root.querySelectorAll('[role="toolbar"], [role="group"]'))
      .filter((el) => aboveAbout(el) && anyProfileCtaIn(el).length)
      .forEach((el) => push(el, 'role="toolbar"/"group" landmark'));

    // ── Strategy D (LAYER 3): nearest visible row of buttons. ──
    // No known shape matched. Group every visible clickable in the header by
    // its parent and take the parents holding two or more — that is what a
    // button row IS, independent of markup.
    if (!out.length) {
      const groups = new Map();
      clickablesIn(root)
        .filter((b) => b.id !== BUTTON_ID && aboveAbout(b) && isVisible(b))
        .forEach((b) => {
          const p = b.parentElement;
          if (!p) return;
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p).push(b);
        });
      Array.from(groups.entries())
        .filter(([, btns]) => btns.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3)
        .forEach(([p, btns]) =>
          push(p, `layer3: nearest visible button row (${btns.length} controls)`),
        );

      // Still nothing — a single lone CTA is a valid bar on minimal layouts.
      if (!out.length) {
        const lone = anyCta[0] || primary[0];
        if (lone && lone.parentElement) {
          push(lone.parentElement, 'layer3: single CTA parent (minimal layout)');
        }
      }
    }

    return out;
  }

  /**
   * Walk a ballooned common ancestor back down to the tightest element that
   * still holds every CTA, without descending into a button.
   */
  function tightenBar(el, buttons) {
    if (!el) return el;
    if (el.tagName === 'BUTTON' || el.closest('button')) {
      const safe = (el.tagName === 'BUTTON' ? el : el.closest('button')).parentElement;
      if (safe) el = safe;
    }
    while (
      el.children &&
      el.children.length === 1 &&
      el.children[0].tagName !== 'BUTTON' &&
      buttons.every((b) => el.children[0].contains(b))
    ) {
      el = el.children[0];
    }
    return el;
  }

  /**
   * The layout-detection engine: Layers 1-4 combined.
   *
   * Enumerates every (root, bar) pair, scores them all, and returns the winner.
   * This replaces the old serial pipeline where any single rejection aborted
   * injection — the reason individual profiles needed individual fixes.
   */
  function resolveInjectionTarget() {
    const roots = collectProfileRoots();
    if (!roots.length) return null;

    const scope = document.querySelector('main') || document.body;
    const avatar = findAvatar(scope);
    const heading = findProfileHeading(scope);
    const signals = {
      avatarEl: avatar && avatar.el,
      headingEl: heading && heading.el,
    };

    const candidates = [];
    for (const r of roots) {
      for (const bar of collectActionBars(r.el)) {
        const cand = { el: bar.el, root: r.el, via: bar.via, rootVia: r.via };
        scoreCandidate(cand, signals);
        if (cand.score > -Infinity) candidates.push(cand);
      }
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => b.score - a.score);
    logCandidatesOnce(candidates);

    // Published for verify-live.js / __qcrmVerify(), so the live report states
    // the engine's actual decision instead of inferring it from the DOM.
    try {
      window.__qcrmLastDecision = {
        winner: describeElement(candidates[0].el),
        score: candidates[0].score,
        via: candidates[0].via,
        rootVia: candidates[0].rootVia,
        signals: candidates[0].notes,
        candidateCount: candidates.length,
        usedStickyFallback: /sticky header/.test(candidates[0].rootVia || ''),
      };
    } catch (e) {
      /* diagnostics must never break injection */
    }
    return candidates[0];
  }

  let lastCandidateKey = '';
  function logCandidatesOnce(cands) {
    const key = cands.map((c) => exactDomPath(c.el) + ':' + c.score).join('|');
    if (key === lastCandidateKey) return;
    lastCandidateKey = key;
    log('── layout detection: ranked action-bar candidates ──');
    cands.slice(0, 5).forEach((c, i) => {
      log(
        `  ${i === 0 ? '→ WINNER' : '        '} score=${c.score} ${describeElement(c.el)}` +
          `  [${c.via}]  ${c.notes}`,
      );
    });
  }

  /**
   * Locate the native Connect control.
   *
   * Returns { button, location } where location is 'top-card' | 'overflow' |
   * null. A null button is NOT an error — it means this profile offers no
   * Connect action (already connected / Following-only), and the click handler
   * reports that to the user rather than the button refusing to appear.
   *
   * 'overflow' means Connect lives inside the "More" dropdown; the click
   * handler opens that menu before looking for it, because the menu items are
   * not in the DOM until it is expanded.
   */
  function findNativeConnectButton(root) {
    // Scope is the profile root — NEVER the document. Without a root there is
    // nothing safe to search, so report "not found" rather than falling back to
    // a global query that would match a sidebar recommendation.
    if (!root) return { button: null, location: null };

    const bar = findActionBar(root);
    const scope = bar ? bar.el : root;
    const candidates = Array.from(
      scope.querySelectorAll('button, a[role="button"]'),
    ).filter((b) => b.id !== BUTTON_ID);

    // Strategy 1 — aria-label "Invite <name> to connect" (stable, localised).
    const byAria = candidates.find((b) =>
      /invite\b.*\bto connect/i.test(norm(b.getAttribute('aria-label'))),
    );
    if (byAria) {
      log('native Connect found in top card via aria-label', {
        ariaLabel: norm(byAria.getAttribute('aria-label')),
      });
      return { button: byAria, location: 'top-card' };
    }

    // Strategy 2 — visible text exactly "Connect".
    const byText = candidates.find((b) => /^connect$/i.test(labelOf(b)));
    if (byText) {
      log('native Connect found in top card via text match');
      return { button: byText, location: 'top-card' };
    }

    // The profile's own "More" button, if it has one.
    const moreBtn = candidates.find(
      (b) =>
        /^more$/i.test(labelOf(b)) ||
        /more actions/i.test(norm(b.getAttribute('aria-label'))),
    );

    // Strategy 3 — Connect inside an ALREADY-OPEN overflow menu.
    //
    // Menus are the one thing that cannot be root-scoped: artdeco renders the
    // dropdown content in a portal, often outside the top card. So instead of
    // scoping by ancestry we anchor to THIS profile's More button — via its
    // own dropdown container, else via aria-controls. A menu we cannot tie
    // back to that button is somebody else's and is ignored.
    if (moreBtn) {
      const dropdown = moreBtn.closest('.artdeco-dropdown');
      const controlledId = moreBtn.getAttribute('aria-controls');
      const menu =
        (dropdown && dropdown.querySelector('.artdeco-dropdown__content')) ||
        (controlledId ? document.getElementById(controlledId) : null);

      if (menu) {
        const inMenu = Array.from(
          menu.querySelectorAll('li, [role="menuitem"], .artdeco-dropdown__item, button'),
        ).find((el) => /^connect$/i.test(labelOf(el)));
        if (inMenu) {
          log('native Connect found inside this profile\'s open "More" menu');
          return { button: inMenu, location: 'overflow', moreButton: moreBtn };
        }
      }

      // Strategy 4 — the menu is closed, so Connect may be inside it. Do not
      // open it here: discovery runs on every mutation and must stay
      // side-effect free. The click handler opens it on demand.
      log('no top-card Connect; "More" menu present — Connect may be inside it');
      return { button: null, location: 'overflow', moreButton: moreBtn };
    }

    log('no native Connect control on this profile');
    return { button: null, location: null };
  }

  /**
   * The element our button is inserted directly after.
   *
   * Preference order, all resolved INSIDE the action bar:
   *   1. the native Connect button  (requirement 5)
   *   2. Message, then More         (requirement 6, when Connect isn't visible)
   *
   * Returns { el, after } describing the chosen sibling, or null when the bar
   * holds none of them — in which case the caller appends to the bar itself.
   *
   * When LinkedIn wraps each CTA in its own element we return that wrapper, so
   * our button becomes a sibling of the whole control rather than landing
   * inside a dropdown's internals.
   */
  function findAnchor(actionBarEl, nativeConnect) {
    const wrap = (el) => {
      const wrapper = el.closest('.artdeco-dropdown, .pvs-profile-actions__action');
      // Only use the wrapper while it is still within the action bar.
      return wrapper && actionBarEl.contains(wrapper) ? wrapper : el;
    };

    const buttons = Array.from(
      actionBarEl.querySelectorAll('button, a[role="button"]'),
    ).filter((b) => b.id !== BUTTON_ID);

    // 1 — LAST position in the row: immediately after the three-dot "More"
    // menu, so the order reads Connect / Message / Visit my website / ⋯ /
    // QuikCRM Connect. Anchoring on More's `.artdeco-dropdown` WRAPPER (not the
    // trigger button) is what puts us outside the dropdown rather than inside
    // its internals, where the menu markup would hide us.
    const more = buttons.find(
      (b) =>
        /^more$/i.test(labelOf(b)) ||
        /more actions/i.test(norm(b.getAttribute('aria-label'))),
    );
    if (more) return { el: wrap(more), after: 'More' };

    // 2 — no overflow menu on this layout. Fall back to the previous
    // preference order so every profile that has a button today still gets
    // one: beside native Connect, else after Message.
    if (nativeConnect && actionBarEl.contains(nativeConnect)) {
      return { el: wrap(nativeConnect), after: 'Connect' };
    }

    const message = buttons.find((b) => /^message$/i.test(labelOf(b)));
    if (message) return { el: wrap(message), after: 'Message' };

    return null;
  }

  /** Readable DOM path from <main>, for verifying where the button landed. */
  function domPath(el) {
    const parts = [];
    let node = el;
    while (node && node.tagName && node.tagName.toLowerCase() !== 'main') {
      parts.unshift(describeElement(node));
      node = node.parentElement;
    }
    return 'main > ' + parts.join(' > ');
  }

  // ── Profile facts read from the live page ──────────────────────────────────
  // Only the few fields the activity payload needs. The rich extraction (posts,
  // experiences, company enrichment) is the panel extractor's job and runs in
  // the background worker — this is not a second scraper.
  // Both readers are scoped to the profile root for the same reason as the
  // button placement: a sidebar recommendation card carries someone else's
  // name and company, and these values become the prospect record and the
  // activity metadata. Reading the wrong one would log the wrong person.
  function readProfileName(root) {
    const scope = root || findProfileRoot();
    const h1 = scope ? scope.querySelector('h1') : null;
    const fromH1 = norm(h1 && h1.innerText);
    if (fromH1) return fromH1;
    // Fallback: document.title is "(3) Jane Doe | LinkedIn". Always this
    // profile's own name, so it is safe even without a root.
    return norm(
      (document.title || '')
        .replace(/^\(\d+\+?\)\s*/, '')
        .replace(/\s*[|·]\s*LinkedIn.*$/i, ''),
    );
  }

  function readCompany(root) {
    const scope = root || findProfileRoot();
    if (!scope) return '';
    const el =
      scope.querySelector('[aria-label*="Current company"]') ||
      scope.querySelector('button[aria-label*="Current company"]') ||
      scope.querySelector('.pv-text-details__right-panel-item-text');
    return norm(el && el.innerText);
  }

  /** Canonical profile URL without tracking/query noise. */
  function readProfileUrl() {
    const { origin, pathname } = window.location;
    return `${origin}${pathname.replace(/\/$/, '')}`;
  }

  // ── Toasts ─────────────────────────────────────────────────────────────────
  // Self-contained so the content script never depends on the side panel's
  // markup (linkedIn.html is a different document).
  function showToast(message, type) {
    const existing = document.getElementById('quikcrm-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'quikcrm-toast';
    el.className = `quikcrm-toast quikcrm-toast--${type || 'info'}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = message;
    document.body.appendChild(el);

    // Next frame, so the transition runs instead of applying instantly.
    requestAnimationFrame(() => el.classList.add('quikcrm-toast--visible'));
    setTimeout(() => {
      el.classList.remove('quikcrm-toast--visible');
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  // The native LinkedIn Connect flow (clicking Connect, confirming the
  // invitation modal, and logging a LINKEDIN_CONNECTION_SENT activity) was
  // removed when this button became extraction-and-preview only. The backend
  // endpoint POST /api/linkedin/activity and its activity-type registry remain
  // in place and tested, ready to be driven from a future entry point.

  // ── Orphaned-context detection ─────────────────────────────────────────────
  // Reloading the extension does NOT remove content scripts already injected
  // into open tabs. Those copies keep running with a dead chrome.runtime
  // connection: every sendMessage fails with "Extension context invalidated",
  // so the button can never work again in that tab. This is unrecoverable from
  // inside the page — the only fix is a reload, so say so explicitly instead of
  // echoing Chrome's opaque error (which reads like the button is stuck).
  const ORPHAN_RE = /extension context invalidated|message port closed|receiving end does not exist/i;

  /**
   * Positively DEAD context, as opposed to "not provably alive".
   *
   * `chrome.runtime.id` is undefined once the context is invalidated, but it
   * is also absent under other harnesses/embeddings. Reporting orphaned on a
   * merely-missing id would break a working page, so this returns true only
   * when the messaging API itself is gone — and otherwise we attempt the call
   * and classify the real error. sendMessage's lastError/throw handling is the
   * authoritative signal.
   */
  function isContextDead() {
    try {
      return !(chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function');
    } catch (e) {
      return true; // touching chrome.runtime threw — definitively orphaned
    }
  }

  const ORPHAN_MESSAGE =
    'QuikCRM was updated or reloaded. Refresh this LinkedIn page to reconnect.';

  /** Marks the button so an orphaned tab shows why it cannot work. */
  function markOrphaned(button) {
    log('extension context is invalidated — this content script is orphaned');
    showToast(ORPHAN_MESSAGE, 'error');
    if (button) {
      button.disabled = true;
      button.title = ORPHAN_MESSAGE;
      const lbl = button.querySelector('.quikcrm-connect-btn__label');
      if (lbl) lbl.textContent = 'Refresh page';
    }
  }

  // ── Background messaging ───────────────────────────────────────────────────
  function sendMessage(message) {
    return new Promise((resolve) => {
      // Fail fast only when the messaging API is definitively gone; otherwise
      // attempt the call and let lastError/throw classify the failure.
      if (isContextDead()) {
        resolve({ success: false, error: ORPHAN_MESSAGE, orphaned: true });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || 'Extension unavailable';
            resolve({
              success: false,
              error: ORPHAN_RE.test(msg) ? ORPHAN_MESSAGE : msg,
              orphaned: ORPHAN_RE.test(msg),
            });
            return;
          }
          resolve(response || { success: false, error: 'No response from extension' });
        });
      } catch (e) {
        const msg = (e && e.message) || 'Extension unavailable';
        resolve({
          success: false,
          error: ORPHAN_RE.test(msg) ? ORPHAN_MESSAGE : msg,
          orphaned: ORPHAN_RE.test(msg),
        });
      }
    });
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  // Guards against a double-click while one request is in flight. This lock is
  // released in the `finally` below on EVERY path — success, error, early
  // return, and orphaned context — so it can never wedge the button.
  let inFlight = false;

  async function onQuikcrmConnectClick(button) {
    if (inFlight) {
      log('click ignored — a request is already in flight (lock held)');
      return;
    }
    inFlight = true;
    log('lock acquired');

    const label = button.querySelector('.quikcrm-connect-btn__label');
    const originalText = label ? label.textContent : '';
    const setLabel = (t) => {
      if (label) label.textContent = t;
    };

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('quikcrm-connect-btn--busy');

    // Set when the tab is orphaned, so `finally` leaves the button disabled
    // with the "Refresh page" label instead of restoring it.
    let orphaned = false;

    try {
      // EXTRACTION AND PREVIEW ONLY — this path performs NO persistence.
      // It opens the side panel and asks it to extract the profile + posts
      // into the review form. The prospect is created/updated only when the
      // user clicks "Save to CRM" in the panel.
      log('extraction requested');
      setLabel('Opening…');
      const result = await sendMessage({ action: 'quikcrm:openPanelAndExtract' });

      if (result && result.orphaned) {
        // Unrecoverable in this tab: the content script outlived its extension.
        orphaned = true;
        markOrphaned(button);
        return;
      }

      if (!result || !result.success) {
        throw new Error((result && result.error) || 'Could not open the QuikCRM panel');
      }

      // The panel acknowledges as soon as it starts; extraction (including the
      // posts pipeline) continues there and reports its own progress.
      if (result.alreadyRunning) {
        log('panel reported alreadyRunning — an extraction is still in progress there');
      } else {
        log('extraction started in the panel');
      }
      showToast(
        result.alreadyRunning
          ? 'Extraction already in progress — check the QuikCRM panel.'
          : 'Extracting profile… review it in the QuikCRM panel, then click Save to CRM.',
        'success',
      );
    } catch (error) {
      const msg = (error && error.message) || 'Something went wrong.';
      if (ORPHAN_RE.test(msg)) {
        orphaned = true;
        markOrphaned(button);
      } else {
        console.error('[QuikCRM Connect] extraction failed', error);
        showToast(msg, 'error');
      }
    } finally {
      // The lock is ALWAYS released here — this is the only place it is
      // cleared, and no path can bypass it.
      inFlight = false;
      log('lock released');
      button.removeAttribute('aria-busy');
      button.classList.remove('quikcrm-connect-btn--busy');
      if (!orphaned) {
        setLabel(originalText);
        button.disabled = false;
      }
    }
  }

  // ── Injection ──────────────────────────────────────────────────────────────
  function buildButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    // artdeco-button classes make it match LinkedIn's own secondary CTA; the
    // quikcrm-* class carries only our brand tint.
    button.className =
      'artdeco-button artdeco-button--2 artdeco-button--secondary quikcrm-connect-btn';
    button.setAttribute('aria-label', 'Connect on LinkedIn and log the activity in QuikCRM');

    const label = document.createElement('span');
    label.className = 'artdeco-button__text quikcrm-connect-btn__label';
    label.textContent = 'QuikCRM Connect';
    button.appendChild(label);

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQuikcrmConnectClick(button);
    });
    return button;
  }

  function injectButton() {
    if (!isProfilePage()) {
      // Not a failure — the observer fires on every LinkedIn page.
      return;
    }
    // Single-button guarantee. If the existing one is still in the document,
    // there is nothing to do. Checked BEFORE any logging so the mutation
    // observer's steady-state calls stay silent.
    const existing = document.getElementById(BUTTON_ID);
    if (existing && document.contains(existing)) return;
    if (existing) existing.remove();

    log('profile page detected — locating the profile root…', {
      path: window.location.pathname,
    });

    // STEP 1+2 — layout detection engine (Layers 1-4). Enumerates every
    // plausible (top card, action bar) pair, scores them, and picks the best.
    const target = resolveInjectionTarget();
    if (target) {
      const root = target.root;
      const bar = { el: target.el, selector: target.via };
      log('action bar selected by layout engine', {
        score: target.score,
        how: target.via,
        rootVia: target.rootVia,
        signals: target.notes,
        target: describeElement(bar.el),
        domPath: exactDomPath(bar.el),
      });

      countConnectButtons(root);
      const found = findNativeConnectButton(root);
      log('native Connect found', { found: !!found.button, location: found.location || 'none' });

      const anchor = findAnchor(bar.el, found.button);
      const button = buildButton();
      if (anchor && anchor.el.parentElement) {
        anchor.el.parentElement.insertBefore(button, anchor.el.nextSibling);
      } else {
        bar.el.appendChild(button);
      }

      if (!verifyPlacement(button, root, bar)) {
        button.remove();
        return;
      }
      log('Button injected successfully', { domPath: domPath(button) });
      diagnoseRendering(button);
      return;
    }

    // Legacy serial path — retained as a safety net so a bug in the ranking
    // engine degrades to the previously shipped behaviour instead of no button.
    const root = findProfileRoot();
    if (!root) {
      // NOT an error, and deliberately not reported as one.
      //
      // LinkedIn is an SPA: `readyState` reaches "complete" BEFORE the top card
      // hydrates, so this branch is hit on every normal page load. The old code
      // called fail() here, which Chrome's Extensions page collects into its
      // Errors list — producing "profile root (top card) was not found" on
      // profiles where the button then injected successfully a moment later.
      //
      // The MutationObserver retries on every DOM change, and the 10s watchdog
      // in start() is the single place that reports a GENUINE failure (no button
      // after the page has had time to settle). So this stays a debug log.
      log('profile root not found yet — waiting for hydration (observer will retry)');
      return;
    }

    // STEP 2 — the primary CTA row, inside that root.
    const bar = findActionBar(root);
    if (!bar) {
      // Same reasoning as STEP 1: the CTA row mounts after the card. The
      // watchdog reports it if it never appears.
      log('action bar not found yet — waiting for hydration (observer will retry)');
      return;
    }
    log('action bar found', {
      how: bar.selector,
      target: describeElement(bar.el),
      domPath: exactDomPath(bar.el),
    });

    // Proof that scoping worked: how many Connect buttons live inside the
    // profile root vs. elsewhere on the page. The "outside" count is exactly
    // the set we must never touch ("More profiles for you", right rail, feed).
    countConnectButtons(root);

    // Connect is looked up for POSITIONING and diagnostics only — its absence
    // must never stop injection, since many profiles show Following/Message/
    // More with no Connect at all.
    const found = findNativeConnectButton(root);
    log('native Connect found', {
      found: !!found.button,
      location: found.location || 'none',
    });

    // STEP 3 — inject, and ONLY into this action bar. Anchor preference is
    // Connect → Message → More; with none of them present we append to the bar.
    const anchor = findAnchor(bar.el, found.button);
    const button = buildButton();
    if (anchor && anchor.el.parentElement) {
      anchor.el.parentElement.insertBefore(button, anchor.el.nextSibling);
    } else {
      bar.el.appendChild(button);
    }

    // STEP 4 — verify placement, and undo it if anything is off. A button in
    // the wrong container is worse than no button: it would attribute the
    // activity to whoever owns that card.
    if (!verifyPlacement(button, root, bar)) {
      button.remove();
      return;
    }

    log('injection target', {
      insertedAfter: anchor ? anchor.after : '(appended — no Connect/Message/More)',
      target: describeElement(anchor ? anchor.el.parentElement : bar.el),
      note:
        found.location === 'overflow'
          ? 'Connect is inside the "More" menu; the click handler will open it'
          : undefined,
    });
    log('Button injected successfully', { domPath: domPath(button) });

    // Rendering diagnostics. The button is in the DOM at this point — this
    // reports whether it is actually PAINTED and where.
    diagnoseRendering(button);
  }

  /**
   * Post-injection visual diagnostics.
   *
   * Injection succeeding in the DOM does not mean the button is visible: a
   * zero-size box, a clipped ancestor, display:none from an inherited rule, or
   * a container scrolled out of view all present as "injected but not there".
   * This reports the computed box and every ancestor that could be hiding it.
   *
   * Log-only — it never mutates the button's styling or scrolls the page. Set
   * `window.__qcrmDebug = false` to silence the logs.
   */
  function diagnoseRendering(button) {
    try {
      const cs =
        typeof window.getComputedStyle === 'function' ? window.getComputedStyle(button) : null;
      const rect =
        typeof button.getBoundingClientRect === 'function'
          ? button.getBoundingClientRect()
          : null;

      log('── rendering diagnostic ──');
      if (cs) {
        log('computed style:', {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          zIndex: cs.zIndex,
          width: cs.width,
          height: cs.height,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          font: cs.font || `${cs.fontSize} ${cs.fontFamily}`,
        });
      } else {
        log('computed style: (getComputedStyle unavailable)');
      }

      log(
        'getBoundingClientRect():',
        rect
          ? {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              left: Math.round(rect.left),
            }
          : '(unavailable)',
      );
      log('offsetParent:', button.offsetParent ? describeElement(button.offsetParent) : 'NULL (button or an ancestor is display:none)');
      log('offsetWidth x offsetHeight:', `${button.offsetWidth} x ${button.offsetHeight}`);

      // Is the box actually on screen and non-degenerate?
      if (rect) {
        const zeroSized = rect.width === 0 || rect.height === 0;
        const offscreen =
          rect.bottom < 0 ||
          rect.right < 0 ||
          rect.top > (window.innerHeight || 0) ||
          rect.left > (window.innerWidth || 0);
        if (zeroSized) log('⚠ button has ZERO SIZE — it is in the DOM but paints nothing');
        if (offscreen) log('⚠ button is OUTSIDE the viewport', {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        });
        // What actually paints at the button's centre? If it is not our button
        // or one of its descendants, something is covering it.
        if (!zeroSized && !offscreen && typeof document.elementFromPoint === 'function') {
          const hit = document.elementFromPoint(
            Math.round(rect.left + rect.width / 2),
            Math.round(rect.top + rect.height / 2),
          );
          const covered = hit && hit !== button && !button.contains(hit);
          log(
            'elementFromPoint(centre):',
            hit ? describeElement(hit) : 'null',
            covered ? '⚠ SOMETHING IS COVERING THE BUTTON' : '(button is the top element)',
          );
        }
      }

      // Every ancestor that could clip, hide, or collapse the button.
      const ancestors = [];
      for (let n = button.parentElement, i = 0; n && i < 12; n = n.parentElement, i++) {
        const s = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(n) : null;
        const r = typeof n.getBoundingClientRect === 'function' ? n.getBoundingClientRect() : null;
        ancestors.push({
          i,
          el: describeElement(n),
          display: s ? s.display : '?',
          visibility: s ? s.visibility : '?',
          opacity: s ? s.opacity : '?',
          overflow: s ? `${s.overflowX}/${s.overflowY}` : '?',
          position: s ? s.position : '?',
          size: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '?',
        });
      }
      if (console.table) console.table(ancestors);
      else log('ancestors:', ancestors);

      const suspicious = ancestors.filter(
        (a) =>
          a.display === 'none' ||
          a.visibility === 'hidden' ||
          a.opacity === '0' ||
          a.size === '0x0' ||
          /hidden|clip/.test(a.overflow),
      );
      if (suspicious.length) {
        log('⚠ ancestors that could be hiding the button:', suspicious);
      }

      log('button.outerHTML:', button.outerHTML);
      log(
        'button.parentElement.outerHTML:',
        button.parentElement ? button.parentElement.outerHTML.slice(0, 1200) : '(no parent)',
      );

    } catch (e) {
      log('rendering diagnostic failed', e && e.message);
    }
  }

  /**
   * Post-injection assertions (requirement 9). Returns false if the button
   * landed anywhere other than this profile's action bar.
   */
  function verifyPlacement(button, root, bar) {
    const sameMain = button.closest('main') === root.closest('main');
    const inActionBar = bar.el.contains(button);
    const inRoot = root.contains(button);

    // A recommendation card is the failure we are actually guarding against.
    const inRecommendationCard = !!button.closest(
      'aside, [class*="scaffold-layout__aside"], [class*="pv-browsemap"], ' +
        '[class*="browsemap"], [class*="discover"], [data-view-name*="feed"]',
    );

    if (sameMain && inActionBar && inRoot && !inRecommendationCard) {
      log('placement verified', {
        'button.closest(main) === profileRoot.closest(main)': true,
        insideActionBar: true,
      });
      return true;
    }

    fail('the injected button failed placement verification — removing it', {
      sameMain,
      inActionBar,
      inRoot,
      inRecommendationCard,
      domPath: domPath(button),
    });
    return false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  // LinkedIn is a client-rendered SPA: the CTA row mounts after first paint and
  // re-mounts on in-app navigation without a page load. A debounced observer
  // re-checks on every mutation; injectButton() is idempotent, so extra calls
  // are cheap no-ops.
  let debounce = null;
  function scheduleInject() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(injectButton, 300);
  }

  /** The /in/<slug> identity of the current page, or null off-profile. */
  function profileSlug() {
    const m = window.location.pathname.match(/^\/in\/([^/]+)/);
    return m ? m[1] : null;
  }

  let lastPath = window.location.pathname;
  let lastSlug = profileSlug();

  /**
   * Requirement 6+7: exactly one button at all times, and never removed unless
   * the profile itself is left.
   *
   * Removal is keyed on the PROFILE SLUG, not the raw path. LinkedIn pushes
   * sub-paths (/in/x/recent-activity/all/, /details/experience/) for the same
   * person — treating those as navigation dropped a perfectly good button and
   * forced a re-inject race. Duplicates are pruned on every pass.
   */
  function reconcile() {
    const slug = profileSlug();
    const path = window.location.pathname;

    if (path !== lastPath) {
      const changedPerson = slug !== lastSlug;
      log('SPA navigation detected', {
        from: lastPath,
        to: path,
        samePerson: !changedPerson,
        action: changedPerson ? 'dropping stale button' : 'keeping button (same profile)',
      });
      lastPath = path;

      // Drop the button only when the PERSON changed, or we left /in/ entirely.
      if (changedPerson) {
        lastSlug = slug;
        document.querySelectorAll('#' + BUTTON_ID).forEach((b) => b.remove());
        lastLoggedRoot = null;
        lastCandidateKey = '';
        lastActionBarKey = '';
      }
    }

    // Single-button guarantee: prune any extra, keep the first still-attached.
    const all = Array.from(document.querySelectorAll('#' + BUTTON_ID));
    if (all.length > 1) {
      log(`pruning ${all.length - 1} duplicate button(s)`);
      all.slice(1).forEach((b) => b.remove());
    }

    scheduleInject();
  }

  const observer = new MutationObserver(reconcile);

  // LinkedIn's client router does not always mutate <body> on navigation, so
  // history events are watched directly rather than inferred from mutations.
  window.addEventListener('popstate', reconcile);
  ['pushState', 'replaceState'].forEach((fn) => {
    const orig = history[fn];
    if (typeof orig !== 'function') return;
    history[fn] = function patched() {
      const r = orig.apply(this, arguments);
      try {
        reconcile();
      } catch (e) {
        /* never break navigation */
      }
      return r;
    };
  });

  function start() {
    log('starting — first injection attempt + MutationObserver');
    injectButton();
    // LinkedIn hydrates the CTA row after first paint, so the observer is what
    // actually lands the button on a cold load; the call above usually no-ops.
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety net: if the action bar never matched (LinkedIn changed its DOM),
    // say so once instead of leaving the user with a silent no-op.
    setTimeout(() => {
      if (!document.getElementById(BUTTON_ID) && isProfilePage()) {
        fail(
          'no button after 10s — the action bar never matched. ' +
            'Run __qcrmDumpButtons() in this console to inspect the live DOM.',
        );
        dumpButtons();
      }
    }, 10000);
  }

  // ── Panel-triggered injection ──────────────────────────────────────────────
  // The side panel asks for an injection the moment it opens, so the button
  // appears without the user clicking "Extract Profile Data" first.
  //
  // This is a nudge, not a second injection path: it calls the same idempotent
  // injectButton(), so an existing button is left exactly where it is. If the
  // action bar has not rendered yet, the MutationObserver started above is
  // already watching and will inject as soon as it appears — so the panel gets
  // an honest "pending" answer rather than a false failure.
  // Guarded: if the messaging API is unavailable (extension context
  // invalidated by a reload), registering would throw and take down the
  // observer with it — losing the autonomous injection path too.
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(onPanelInjectRequest);
  }

  function onPanelInjectRequest(message, sender, sendResponse) {
    if (!message || message.action !== 'quikcrm:injectConnectButton') return undefined;

    log('injection requested by the side panel');

    if (!isProfilePage()) {
      // Feed, search, jobs, messaging, company pages — nothing to do.
      log('injection skipped — not a LinkedIn profile page', {
        path: window.location.pathname,
      });
      sendResponse({ success: false, reason: 'not-a-profile-page' });
      return undefined;
    }

    const before = document.getElementById(BUTTON_ID);
    if (before && document.contains(before)) {
      log('button already exists — not injecting a duplicate');
      sendResponse({ success: true, alreadyPresent: true });
      return undefined;
    }

    injectButton();

    const after = document.getElementById(BUTTON_ID);
    if (after) {
      log('injection completed (panel request)');
      sendResponse({ success: true, alreadyPresent: false });
    } else {
      // The action bar has not mounted yet. The observer will land it shortly.
      log('action bar not ready — MutationObserver will inject when it appears');
      sendResponse({ success: false, reason: 'pending-action-bar' });
    }
    return undefined;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
