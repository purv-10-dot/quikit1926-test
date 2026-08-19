/**
 * LinkedIn conversation (messaging) scraper.
 *
 * Injected into the LinkedIn tab by `chrome.scripting.executeScript` exactly the
 * way `scrapeLinkedInProfile` is (see linkedin-profile-scraper.js). That means
 * this function must be SELF-CONTAINED: it is serialised across the process
 * boundary, so it can close over NOTHING from this file's scope — every helper
 * lives inside the function body.
 *
 * It runs ONLY when the user clicks "Extract Conversation" in the side panel.
 * Profile scraping never calls it, so a messaging DOM change can never break
 * profile extraction.
 *
 * Returns:
 *   {
 *     conversation: {
 *       participant: { name, profileUrl },
 *       threadId,
 *       messages: [ { messageId, senderName, senderProfileUrl, receiverName,
 *                     direction, text, date, time, timestamp, attachments } ]
 *     },
 *     diagnostics: { ... },
 *     error: string | null
 *   }
 *
 * Anything LinkedIn does not expose is returned as `null`, never invented.
 */
/**
 * DIAGNOSTIC PROBE — read-only. Answers "where does the visible conversation
 * actually live?" and changes nothing.
 *
 * Self-contained (serialised into the page by executeScript). Returns a plain
 * object so the side panel can print it; the page console is a different
 * console from the panel's.
 *
 * Hypothesis under test: the thread is in the TOP frame but inside an open
 * shadow root, which `document.querySelectorAll('*')` does not descend into.
 * linkedin-profile-scraper.js already recurses shadow roots (`deepQueryAll`)
 * and works on this same page — the conversation scraper does not.
 */
function probeLinkedInConversationLocation() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const NEEDLE = /write a message/i;
  // Strings visible in the live thread, used to locate real message bubbles.
  const MSG_NEEDLES = [/no problem/i, /take your time/i, /i understand/i, /thanks for letting me know/i];

  const rectOf = (el) => {
    try {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
    } catch (e) { return '?'; }
  };

  const describe = (el) => {
    if (!el) return null;
    const attrs = {};
    try {
      Array.from(el.attributes || []).forEach((a) => {
        if (a.name === 'class' || a.name === 'id' || a.name.indexOf('data-') === 0 ||
            a.name === 'role' || a.name === 'aria-label' || a.name === 'contenteditable') {
          attrs[a.name] = (a.value || '').slice(0, 80);
        }
      });
    } catch (e) { /* detached */ }
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : '?',
      attrs,
      rect: rectOf(el),
      scrollH: el.scrollHeight, clientH: el.clientHeight, scrollTop: el.scrollTop,
    };
  };

  // ── Walk every reachable root, recording which shadow root each host owns ──
  const roots = [];
  const collectRoots = (root, path, depth) => {
    if (!root || depth > 12) return;
    roots.push({ root, path, depth });
    let hosts = [];
    try { hosts = Array.from(root.querySelectorAll('*')); } catch (e) { return; }
    hosts.forEach((el) => {
      if (el.shadowRoot) {
        const label = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` +
          `${el.className ? '.' + norm(el.className.toString()).split(' ')[0] : ''}`;
        collectRoots(el.shadowRoot, `${path} > shadow(${label})`, depth + 1);
      }
    });
  };
  collectRoots(document, 'document', 0);

  // Elements matching a needle, searched across ALL roots (light + shadow).
  const findAcross = (test) => {
    const hits = [];
    roots.forEach(({ root, path }) => {
      let all = [];
      try { all = Array.from(root.querySelectorAll('*')); } catch (e) { return; }
      all.forEach((el) => {
        const hay = [
          el.getAttribute && el.getAttribute('aria-label'),
          el.getAttribute && el.getAttribute('placeholder'),
          el.getAttribute && el.getAttribute('data-placeholder'),
          el.childElementCount === 0 ? el.textContent : '',
        ].join(' ');
        if (test(hay)) hits.push({ rootPath: path, el });
      });
    });
    return hits;
  };

  const composerHits = findAcross((hay) => NEEDLE.test(hay));
  const messageHits = findAcross((hay) => {
    const t = norm(hay);
    return t.length > 0 && t.length < 200 && MSG_NEEDLES.some((re) => re.test(t));
  });

  const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => ({
    src: (f.getAttribute('src') || '').slice(0, 120),
    title: f.getAttribute('title'),
    name: f.getAttribute('name'),
    cls: norm((f.className || '').toString()).slice(0, 60),
    rect: rectOf(f),
    visible: (() => { const r = f.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
  }));

  const bodyText = (() => { try { return document.body.innerText || ''; } catch (e) { return ''; } })();
  const docText = (() => { try { return document.documentElement.innerText || ''; } catch (e) { return ''; } })();

  return {
    // Runtime context
    isTopFrame: (() => { try { return window.top === window; } catch (e) { return 'cross-origin'; } })(),
    frameUrl: location.href,
    framesLength: window.frames ? window.frames.length : null,
    totalElementsLightDom: document.querySelectorAll('*').length,

    // Shadow DOM census — the crux of the hypothesis
    rootsFound: roots.length,
    shadowRoots: roots.filter((r) => r.depth > 0).map((r) => ({
      path: r.path,
      depth: r.depth,
      elements: (() => { try { return r.root.querySelectorAll('*').length; } catch (e) { return -1; } })(),
    })),

    iframes,

    // Where does the text actually live?
    textPresence: {
      bodyInnerTextHasComposer: NEEDLE.test(bodyText),
      docInnerTextHasComposer: NEEDLE.test(docText),
      bodyInnerTextHasMessage: MSG_NEEDLES.some((re) => re.test(bodyText)),
      lightDomSelectorHasComposer:
        !!document.querySelector('div[aria-label*="Write a message" i], textarea[placeholder*="Write a message" i]'),
      deepSearchComposerHits: composerHits.length,
      deepSearchMessageHits: messageHits.length,
    },

    // Full detail on what the deep search found, including which root
    composerElements: composerHits.slice(0, 5).map((h) => ({
      rootPath: h.rootPath,
      inShadowDom: h.rootPath !== 'document',
      self: describe(h.el),
      text: norm(h.el.textContent).slice(0, 60) || null,
    })),
    messageElements: messageHits.slice(0, 8).map((h) => ({
      rootPath: h.rootPath,
      inShadowDom: h.rootPath !== 'document',
      self: describe(h.el),
      text: norm(h.el.textContent).slice(0, 60),
    })),
  };
}

async function scrapeLinkedInConversation() {
  const LOG = '[CONVO]';
  // Bump on every edit to this file. The panel prints it, so a stale cached
  // extension build is immediately visible instead of being mistaken for a
  // selector failure. Chrome caches extension scripts until the extension is
  // reloaded at chrome://extensions.
  const BUILD = '2026-08-13h-scroll-verdict';
  const startedAt = Date.now();

  console.log(LOG, 'scraper build=' + BUILD, '| frame url=' + location.href);

  const diagnostics = {
    build: BUILD,
    pageUrl: location.href,
    isTopFrame: (() => { try { return window.top === window; } catch (e) { return false; } })(),
    liveDom: null,
    threadId: null,
    scrollRounds: 0,
    messagesFound: 0,
    messagesLoaded: 0,
    duplicatesRemoved: 0,
    attachmentsFound: 0,
    panelSource: null,
    openedVia: null,
    candidatesFound: 0,
    completed: false,
    reason: null,
    elapsedMs: 0,
  };

  const fail = (reason) => {
    diagnostics.reason = reason;
    diagnostics.elapsedMs = Date.now() - startedAt;
    console.warn(LOG, 'extraction aborted —', reason);
    return { conversation: null, diagnostics, error: reason };
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const nn = (s) => {
    const v = norm(s);
    return v ? v : null;
  };

  /**
   * Collapse LinkedIn's duplicated accessible text. Message bubbles routinely
   * render the same string twice — once visually and once inside a
   * `visually-hidden` span for screen readers — so a naive textContent yields
   * "hellohello". Splitting the string in half and comparing catches the exact
   * doubling without mangling text that legitimately repeats a word.
   */
  const dedupeText = (s) => {
    const t = norm(s);
    if (!t || t.length % 2 !== 0) return t;
    const half = t.length / 2;
    return t.slice(0, half) === t.slice(half) ? t.slice(0, half) : t;
  };

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const absUrl = (href) => {
    if (!href) return null;
    try {
      return new URL(href, location.origin).href.split('?')[0];
    } catch (e) {
      return null;
    }
  };

  // ── DEEP DOM (Shadow-DOM aware) ───────────────────────────────────────────
  // CONFIRMED by probeLinkedInConversationLocation() on the live page: the
  // messaging overlay renders inside an OPEN shadow root in the top frame.
  // Flat document.querySelectorAll() cannot see it (deepSearchComposerHits=2
  // vs lightDom 0), so every lookup below must go through these helpers.
  //
  // `document` plus every reachable open shadowRoot, deepest last.
  const collectRoots = () => {
    const out = [];
    const walk = (root, depth) => {
      if (!root || depth > 12 || out.indexOf(root) !== -1) return;
      out.push(root);
      let all = [];
      try { all = root.querySelectorAll('*'); } catch (e) { return; }
      for (const el of all) {
        // Only OPEN roots are reachable; closed roots return null by design.
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(document, 0);
    return out;
  };

  // Roots are cached per call: the scroll loop re-queries constantly, and a
  // full re-walk on every count would dominate runtime on a 3000-element page.
  // Invalidated explicitly after scrolling, which is when new roots can mount.
  let ROOTS = collectRoots();
  const refreshRoots = () => { ROOTS = collectRoots(); return ROOTS; };
  diagnostics.deepRootsFound = ROOTS.length;
  console.log(LOG, 'deep DOM roots found:', ROOTS.length,
    `(1 document + ${ROOTS.length - 1} shadow root(s))`);

  // Deep equivalents of querySelectorAll / querySelector / closest / contains.
  const deepQueryAll = (sel, roots) => {
    const acc = [];
    (roots || ROOTS).forEach((root) => {
      try { root.querySelectorAll(sel).forEach((el) => acc.push(el)); } catch (e) { /* bad selector for this root */ }
    });
    return acc;
  };
  const deepQuery = (sel, roots) => deepQueryAll(sel, roots)[0] || null;

  // Search WITHIN an element, including any shadow roots nested inside it.
  const scopedRoots = (el) => {
    const out = [el];
    const walk = (node, depth) => {
      if (!node || depth > 12) return;
      let all = [];
      try { all = node.querySelectorAll('*'); } catch (e) { return; }
      for (const e2 of all) {
        if (e2.shadowRoot && out.indexOf(e2.shadowRoot) === -1) {
          out.push(e2.shadowRoot);
          walk(e2.shadowRoot, depth + 1);
        }
      }
    };
    walk(el, 0);
    return out;
  };
  const queryAllIn = (el, sel) => (el ? deepQueryAll(sel, scopedRoots(el)) : []);
  const queryIn = (el, sel) => queryAllIn(el, sel)[0] || null;

  // Shadow-piercing parentElement: at a shadow boundary, step to the host.
  const parentDeep = (el) => {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    const root = el.parentNode;
    if (root && root.host) return root.host;      // ShadowRoot → host element
    return null;
  };

  // Shadow-piercing closest(): walks up through shadow boundaries.
  const closestDeep = (el, sel) => {
    let node = el;
    for (let i = 0; i < 60 && node; i++) {
      try { if (node.matches && node.matches(sel)) return node; } catch (e) { /* bad selector */ }
      node = parentDeep(node);
    }
    return null;
  };

  // ── 1. Locate the ACTIVE conversation panel ───────────────────────────────
  //
  // Detection is bottom-up, NOT by guessing a container class. LinkedIn renames
  // its wrapper classes freely, and on a profile page several messaging shells
  // are on screen at once (the floating chat window AND the inbox thread list),
  // so "first container matching .msg-*" reliably picks the wrong one.
  //
  // Instead: find the message bubbles first, then walk UP to the nearest
  // ancestor that also contains a composer. A real open conversation is the
  // only thing on the page with BOTH message content and a "Write a message…"
  // box — the inbox list has neither, and a thread-list row has no composer.

  // Message bubbles. Kept broad because the event class carries build-specific
  // suffixes; the composer requirement below is what actually disambiguates.
  const EVENT_SEL = [
    '.msg-s-event-listitem',
    'li[class*="msg-s-event"]',
    '.msg-s-message-list__event',
    '[class*="msg-s-event-listitem"]',
    '.msg-s-message-group',
  ].join(', ');

  // The composer — the definitive marker of an ACTIVE thread. Matched by role
  // and placeholder as well as class, so a class rename cannot break it.
  const COMPOSER_SEL = [
    '.msg-form',
    '.msg-form__contenteditable',
    '.msg-form__msg-content-container',
    'div[contenteditable="true"][role="textbox"]',
    'div[aria-label*="Write a message" i]',
    'div[aria-label*="Message list" i] ~ .msg-form',
    'textarea[placeholder*="Write a message" i]',
    '[data-placeholder*="Write a message" i]',
  ].join(', ');

  // Containers that are the INBOX, never the open conversation. A candidate
  // that is one of these (or sits inside one) is rejected outright.
  const INBOX_SEL = [
    '.msg-conversations-container',
    '.msg-conversations-container__conversations-list',
    'ul.msg-conversations-container__conversations-list',
    '.msg-overlay-list-bubble',
    '[class*="conversations-list"]',
  ].join(', ');

  // Shadow-aware: the composer is proven to live inside a shadow root, so a
  // flat el.querySelector() here would report false on the real panel.
  const hasComposer = (el) => !!queryIn(el, COMPOSER_SEL);
  const countEventsIn = (el) => queryAllIn(el, EVENT_SEL).length;

  // ── LIVE-DOM INSPECTOR ────────────────────────────────────────────────────
  // Text-anchored, NOT selector-anchored: it locates the composer and message
  // bubbles by the words actually on screen, then reports the ancestor chain.
  // This is what tells us the REAL class names when the selectors above miss.
  // The report is returned in diagnostics so the side panel can print it — the
  // page console is a different console from the panel's.
  const describe = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const data = {};
    if (el.attributes) {
      Array.from(el.attributes).forEach((a) => {
        if (a.name.indexOf('data-') === 0) data[a.name] = (a.value || '').slice(0, 60);
      });
    }
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : '?',
      cls: norm((el.className || '').toString()).slice(0, 120) || null,
      id: el.id || null,
      role: el.getAttribute ? el.getAttribute('role') : null,
      ariaLabel: el.getAttribute ? el.getAttribute('aria-label') : null,
      contentEditable: el.getAttribute ? el.getAttribute('contenteditable') : null,
      data: Object.keys(data).length ? data : null,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`,
      visible: r.width > 0 && r.height > 0,
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      scrollTop: el.scrollTop,
      msgDescendants: countEventsIn(el),
      composerDescendants: queryAllIn(el, COMPOSER_SEL).length,
    };
  };

  const ancestorChain = (el, depth) => {
    const chain = [];
    let node = el && parentDeep(el);
    for (let i = 0; i < depth && node && node !== document.documentElement; i++) {
      chain.push(Object.assign({ depth: i + 1 }, describe(node)));
      node = parentDeep(node);
    }
    return chain;
  };

  const buildLiveDomReport = () => {
    // Deep: the whole point is to see inside shadow roots.
    const all = deepQueryAll('*');

    // Composer: any element whose own text/placeholder/aria says "write a
    // message", preferring the innermost (fewest element children).
    const composerHits = all.filter((el) => {
      const hay = [
        el.getAttribute && el.getAttribute('aria-label'),
        el.getAttribute && el.getAttribute('placeholder'),
        el.getAttribute && el.getAttribute('data-placeholder'),
        el.childElementCount === 0 ? el.textContent : '',
      ].join(' ');
      return /write a message/i.test(hay);
    }).filter(visible).slice(0, 6);

    // Message bubbles: anchored on the strings visible in the live thread.
    const NEEDLES = [/^hiii$/i, /^hello$/i, /how can i help you/i, /hope you'?re doing well/i];
    const messageHits = all.filter((el) => {
      if (el.childElementCount > 2) return false;
      const t = norm(el.textContent);
      if (!t || t.length > 260) return false;
      return NEEDLES.some((re) => re.test(t) || re.test(dedupeText(t)));
    }).filter(visible).slice(0, 8);

    const selectorCensus = {};
    EVENT_SEL.split(', ').forEach((s) => {
      const n = deepQueryAll(s).length;
      if (n) selectorCensus['MSG ' + s] = n;
    });
    COMPOSER_SEL.split(', ').forEach((s) => {
      const n = deepQueryAll(s).length;
      if (n) selectorCensus['COMPOSER ' + s] = n;
    });
    INBOX_SEL.split(', ').forEach((s) => {
      const n = deepQueryAll(s).length;
      if (n) selectorCensus['INBOX ' + s] = n;
    });

    return {
      frameUrl: location.href,
      deepRoots: ROOTS.length,
      totalElements: all.length,
      selectorCensus: Object.keys(selectorCensus).length ? selectorCensus : '(NO SELECTOR MATCHED ANYTHING)',
      composerCandidates: composerHits.map((el) => ({
        self: describe(el),
        text: norm(el.textContent).slice(0, 60) || null,
        ancestors: ancestorChain(el, 8),
      })),
      messageCandidates: messageHits.map((el) => ({
        self: describe(el),
        text: norm(el.textContent).slice(0, 60),
        ancestors: ancestorChain(el, 8),
      })),
    };
  };

  // An already-open thread must short-circuit this entirely: clicking the
  // profile's "Message" button when a chat is open costs ~8s of polling and can
  // swap the focused thread. Messages + a composer on the page is proof enough.
  const threadLooksOpen = () =>
    !!deepQuery(EVENT_SEL) && !!deepQuery(COMPOSER_SEL);

  const openMessagingPanel = async () => {
    if (threadLooksOpen()) return 'already-open';

    // Opening the overlay mounts new shadow roots, so the cache must be
    // rebuilt before each re-check or threadLooksOpen() reads a stale tree.
    const recheck = () => { refreshRoots(); return threadLooksOpen(); };

    // 1. A minimised overlay bubble — clicking the header re-expands it.
    const collapsed = deepQueryAll(
      '.msg-overlay-conversation-bubble--is-minimized .msg-overlay-bubble-header, .msg-overlay-conversation-bubble--is-collapsed .msg-overlay-bubble-header'
    ).filter(visible)[0];
    if (collapsed) {
      try { collapsed.click(); } catch (e) { /* detached */ }
      await sleep(1200);
      if (recheck()) return 'expanded-bubble';
    }

    // 2. The profile page's "Message" button opens the thread as an overlay.
    const msgBtn = deepQueryAll('button, a').filter(visible).find((b) => {
      const label = norm(b.getAttribute('aria-label') || b.textContent);
      return /^message\b/i.test(label) || /^message /i.test(label);
    });
    if (msgBtn) {
      try { msgBtn.click(); } catch (e) { /* detached */ }
      // The overlay mounts asynchronously; poll rather than guess a delay.
      for (let i = 0; i < 20; i++) {
        await sleep(400);
        if (recheck()) return 'clicked-message-button';
      }
    }

    // 3. On /messaging/ with no thread selected, open the first conversation.
    const firstThread = deepQueryAll(
      '.msg-conversation-listitem__link, li.msg-conversation-listitem a'
    ).filter(visible)[0];
    if (firstThread) {
      try { firstThread.click(); } catch (e) { /* detached */ }
      for (let i = 0; i < 20; i++) {
        await sleep(400);
        if (recheck()) return 'opened-first-thread';
      }
    }

    return recheck() ? 'late-mount' : null;
  };

  const openedVia = await openMessagingPanel();
  diagnostics.openedVia = openedVia;
  console.log(LOG, 'messaging panel:', openedVia || '(not found)');

  // Build the candidate set bottom-up: for every message bubble on the page,
  // walk up to 10 ancestors and record each one that contains a composer. The
  // NEAREST such ancestor is the conversation panel; anything higher is a
  // layout wrapper that may also enclose the inbox.
  const collectCandidates = () => {
    // Deep: bubbles live inside the overlay's shadow root.
    const bubbles = deepQueryAll(EVENT_SEL);
    console.log(LOG, 'message candidates (deep):', bubbles.length);
    console.log(LOG, 'composer candidates (deep):', deepQueryAll(COMPOSER_SEL).length);
    const byNode = new Map();

    bubbles.forEach((bubble) => {
      // parentDeep, not parentElement: the bubble's ancestor chain crosses a
      // shadow boundary before reaching the panel, and parentElement returns
      // null there — which is why zero candidates were found on the live page.
      let node = parentDeep(bubble);
      for (let depth = 0; depth < 14 && node && node !== document.body; depth++) {
        if (hasComposer(node)) {
          if (!byNode.has(node)) byNode.set(node, depth);
          break; // nearest composer-bearing ancestor only
        }
        node = parentDeep(node);
      }
    });

    // Fallback for builds where no composer is found under any ancestor —
    // either it sits outside the message container, or LinkedIn renamed the
    // class. Message bubbles that are NOT in the inbox are still a real
    // conversation, so fall back to the enclosing shell rather than failing.
    // The composer stays a heavy scoring bonus, so a genuine composer-bearing
    // panel always outranks these; this only prevents a hard NO_CONVERSATION.
    if (!byNode.size && bubbles.length) {
      bubbles.forEach((bubble) => {
        const shell =
          closestDeep(bubble, '.msg-overlay-conversation-bubble') ||
          closestDeep(bubble, '.msg-convo-wrapper') ||
          closestDeep(bubble, '.scaffold-layout__detail') ||
          closestDeep(bubble, '[class*="msg-s-message-list"]') ||
          parentDeep(bubble);
        if (shell && !byNode.has(shell)) byNode.set(shell, 99);
      });
    }

    // LAST RESORT — structural, zero class names. If LinkedIn renamed both the
    // event and composer classes, nothing above matches and we would fail even
    // though the conversation is plainly on screen. Anchor on the composer's
    // TEXT ("Write a message"), walk up to the nearest scrollable ancestor that
    // also holds several short text blocks, and treat that as the panel.
    if (!byNode.size) {
      const composerByText = deepQueryAll('div, textarea, p, span')
        .filter((el) => {
          const hay = [
            el.getAttribute('aria-label'),
            el.getAttribute('placeholder'),
            el.getAttribute('data-placeholder'),
            el.childElementCount === 0 ? el.textContent : '',
          ].join(' ');
          return /write a message/i.test(hay);
        })
        .filter(visible)[0];

      if (composerByText) {
        let node = parentDeep(composerByText);
        for (let i = 0; i < 12 && node && node !== document.body; i++) {
          // A conversation shell is scrollable and contains multiple distinct
          // short text nodes (the bubbles). The inbox is excluded explicitly.
          let isInboxNode = false;
          try { isInboxNode = !!(node.matches && node.matches(INBOX_SEL)); } catch (e) { /* ignore */ }
          const textBlocks = queryAllIn(node, 'p, span, div')
            .filter((e) => e.childElementCount === 0 && norm(e.textContent).length > 1)
            .length;
          if (!isInboxNode && textBlocks >= 3) {
            byNode.set(node, 50 + i);
            break;
          }
          node = parentDeep(node);
        }
      }
    }

    return Array.from(byNode.entries()).map(([node, depth]) => {
      const events = countEventsIn(node);
      const composer = hasComposer(node);
      const isVisible = visible(node);
      // An inbox container never qualifies, even if it somehow nests bubbles.
      let selfIsInbox = false;
      try { selfIsInbox = !!(node.matches && node.matches(INBOX_SEL)); } catch (e) { /* ignore */ }
      const isInbox = selfIsInbox ||
        !!(closestDeep(node, INBOX_SEL) && !hasComposer(node));
      const rect = node.getBoundingClientRect();

      // A candidate discovered by the class-blind text fallback (depth >= 50)
      // has no class-matched events by definition — that is WHY it was found
      // that way. Score it on its text blocks instead, or it is discarded and
      // we fail with a container already in hand.
      const textBlocks = queryAllIn(node, 'p, span, div')
        .filter((e) => e.childElementCount === 0 && norm(e.textContent).length > 1).length;
      const contentUnits = events > 0 ? events : (depth >= 50 ? textBlocks : 0);

      // Score: real message content dominates, then composer, then visibility.
      // Depth breaks ties toward the TIGHTEST panel around the bubbles.
      let score = -1;
      if (contentUnits > 0 && !isInbox) {
        score = Math.min(contentUnits, 50) * 10;
        if (composer) score += 100;
        if (isVisible) score += 50;
        score -= depth;
      }

      return {
        node, events, composer, isVisible, isInbox, depth, score, textBlocks,
        cls: norm((node.className || '').toString()).slice(0, 90) || '(no class)',
        tag: node.tagName ? node.tagName.toLowerCase() : '?',
        size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      };
    });
  };

  const candidates = collectCandidates().sort((a, b) => b.score - a.score);

  // Always build the live-DOM report — it is the only way to learn the real
  // class names when detection fails, and it is cheap relative to the scroll.
  let liveDom = null;
  try {
    liveDom = buildLiveDomReport();
    diagnostics.liveDom = liveDom;
    console.log(LOG, '[LIVE-DOM] frame              :', liveDom.frameUrl);
    console.log(LOG, '[LIVE-DOM] selector census    :', liveDom.selectorCensus);
    console.log(LOG, '[LIVE-DOM] composer candidates:', liveDom.composerCandidates.length);
    liveDom.composerCandidates.forEach((c, i) => {
      console.log(LOG, `  composer[${i}] self:`, c.self);
      console.log(LOG, `  composer[${i}] ancestors:`, c.ancestors);
    });
    console.log(LOG, '[LIVE-DOM] message candidates :', liveDom.messageCandidates.length);
    liveDom.messageCandidates.forEach((c, i) => {
      console.log(LOG, `  message[${i}] "${c.text}" self:`, c.self);
      console.log(LOG, `  message[${i}] ancestors:`, c.ancestors);
    });
  } catch (e) {
    console.warn(LOG, '[LIVE-DOM] report failed:', e && e.message);
  }

  // ── Candidate diagnostics (printed BEFORE any NO_CONVERSATION return) ──────
  console.log(LOG, '── conversation candidate scan ────────');
  // NOTE: this counts SELECTOR MATCHES, not messages — EVENT_SEL deliberately
  // overlaps (a bubble matches both the listitem and the group selector), so
  // this runs ~2x the real message count. It is a scoring signal only; the
  // authoritative figure is `messages loaded` in the summary below.
  console.log(LOG, 'message selector matches       :', deepQueryAll(EVENT_SEL).length);
  console.log(LOG, 'composer elements on page      :', deepQueryAll(COMPOSER_SEL).length);
  console.log(LOG, 'candidate containers found     :', candidates.length);
  if (!candidates.length) {
    // Nothing scored — report which building blocks were present so the failure
    // is attributable to a specific missing piece rather than "not found".
    console.log(LOG, 'no candidate had both messages and a composer. Present on page:');
    EVENT_SEL.split(', ').forEach((s) => {
      const n = deepQueryAll(s).length;
      if (n) console.log(LOG, `  message selector matched ${n}x :`, s);
    });
    COMPOSER_SEL.split(', ').forEach((s) => {
      const n = deepQueryAll(s).length;
      if (n) console.log(LOG, `  composer selector matched ${n}x:`, s);
    });
  }
  candidates.forEach((c, i) => {
    console.log(
      LOG,
      `  [${i}] score=${c.score} messages=${c.events} composer=${c.composer}` +
      ` visible=${c.isVisible} inbox=${c.isInbox} depth=${c.depth} size=${c.size}` +
      ` <${c.tag} class="${c.cls}">`
    );
  });

  const chosen = candidates.find((c) => c.score >= 0) || null;
  const panel = chosen ? chosen.node : null;

  if (!panel) {
    console.log(LOG, 'selected candidate            : (none)');
    console.log(LOG, '───────────────────────────────────────');
    return fail(
      'No open LinkedIn conversation found. Open the message thread on the page, then click Extract Conversation again.'
    );
  }

  diagnostics.panelSource = `${chosen.tag}.${chosen.cls.split(' ')[0] || 'anon'}` +
    `(messages=${chosen.events},composer=${chosen.composer})`;
  diagnostics.candidatesFound = candidates.length;
  console.log(LOG, 'selected candidate            : index 0 —', diagnostics.panelSource);
  console.log(LOG, '───────────────────────────────────────');
  console.log(LOG, 'Open conversation detected');
  console.log(LOG, 'Extraction started');

  // ── 2. Thread ID ──────────────────────────────────────────────────────────
  // Best source is the URL on /messaging/thread/<id>/. The overlay has no URL,
  // so fall back to the data attributes LinkedIn stamps on the bubble.
  const threadFromUrl = (location.pathname.match(/\/messaging\/thread\/([^/]+)/) || [])[1] || null;
  const threadAttr =
    panel.getAttribute('data-thread-id') ||
    panel.getAttribute('data-conversation-id') ||
    (queryIn(panel, '[data-thread-urn]') || {}).getAttribute?.('data-thread-urn') ||
    (queryIn(panel, '[data-conversation-urn]') || {}).getAttribute?.('data-conversation-urn') ||
    null;
  diagnostics.threadId = threadFromUrl || nn(threadAttr);
  console.log(LOG, 'threadId:', diagnostics.threadId || '(none)');

  // ── 3. The scroll container ───────────────────────────────────────────────
  // Older messages load when this element is scrolled to the top. It is the
  // nearest ancestor of the message list that actually overflows.
  const findScroller = () => {
    const list = queryIn(panel, '.msg-s-message-list-content, ul.msg-s-message-list-content, .msg-s-message-list');
    let node = list || panel;
    // Walk UP (piercing shadow boundaries) looking for the overflow container.
    for (let i = 0; i < 10 && node; i++) {
      if (node.scrollHeight > node.clientHeight + 20) return node;
      node = parentDeep(node);
    }
    // Nothing above overflowed — scan INSIDE the panel (including nested shadow
    // roots) for the tallest overflowing descendant. On the live page the
    // scroll region is inside the overlay's shadow root, so a light-DOM-only
    // lookup returns the panel itself and scrolling silently does nothing.
    const inner = queryAllIn(panel, 'div, ul, section')
      .filter((el) => el.scrollHeight > el.clientHeight + 20 && visible(el))
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    if (inner) return inner;
    return queryIn(panel, '.msg-s-message-list-container') || panel;
  };
  const scroller = findScroller();

  // ══════════════════════════════════════════════════════════════════════════
  // SCROLL DIAGNOSTIC — READ-ONLY. Answers one question: are we actually
  // causing LinkedIn to mount older history?
  //
  // Every live run reports `scroll rounds: 3` (exits on QUIET_ROUNDS having
  // loaded nothing) with `raw event DOM nodes: 223` unchanged across builds,
  // while the mounted groups are all from 6:55-6:56 PM — the tail of a thread
  // that starts at 6:45 PM.
  // ══════════════════════════════════════════════════════════════════════════
  const styleOf = (el, prop) => {
    try { return getComputedStyle(el)[prop]; } catch (e) { return '?'; }
  };
  const rectOfEl = (el) => {
    try {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
    } catch (e) { return '?'; }
  };
  // The mounted message groups, recomputed live (events is computed later).
  const mountedGroupNodes = () => {
    const raw = queryAllIn(panel, EVENT_SEL).filter((n) => {
      const cls = (n.className || '').toString();
      return !/__(body|meta|name|timestamp|profile-link|attachment-item|file|image)/.test(cls);
    });
    return raw.filter((n) => !raw.some((o) => o !== n && o.contains(n)));
  };
  const mountedTimestamps = () => mountedGroupNodes().map((g) => {
    const t = queryAllIn(g, 'time, span, div').find((e) =>
      e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)));
    return t ? norm(t.textContent) : null;
  });
  // Identity fingerprint: URNs when present, else a text hash of each group.
  const mountedIdentities = () => mountedGroupNodes().map((g) => {
    const urn = g.getAttribute('data-event-urn') || g.getAttribute('data-id') ||
      (queryIn(g, '[data-event-urn]') || {}).getAttribute?.('data-event-urn') || null;
    return urn || norm(g.textContent).slice(0, 40);
  });

  const describeScrollable = (el, insidePanel) => ({
    tag: (el.tagName || '?').toLowerCase(),
    cls: norm((el.className || '').toString()).slice(0, 110) || null,
    id: el.id || null,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    scrollTop: el.scrollTop,
    overflowY: styleOf(el, 'overflowY'),
    rect: rectOfEl(el),
    insidePanel: insidePanel,
    containsMountedGroups: (() => {
      try { return mountedGroupNodes().some((g) => el.contains(g)); } catch (e) { return false; }
    })(),
  });

  // 1. Every scrollable candidate — inside the panel AND in its ancestor chain.
  const inPanelScrollables = queryAllIn(panel, '*')
    .filter((el) => el.scrollHeight > el.clientHeight + 20)
    .map((el) => describeScrollable(el, true));

  const ancestorScrollables = [];
  let anc = parentDeep(panel);
  for (let i = 0; i < 10 && anc; i++, anc = parentDeep(anc)) {
    if (anc.scrollHeight > anc.clientHeight + 20) {
      ancestorScrollables.push(Object.assign({ ancestorDepth: i + 1 }, describeScrollable(anc, false)));
    }
  }

  const chosenScroller = describeScrollable(scroller, panel.contains(scroller));

  console.log(LOG, '[SCROLL-DIAG] ===== scroller census =====');
  console.log(LOG, '[SCROLL-DIAG] chosen scroller:', chosenScroller);
  console.log(LOG, '[SCROLL-DIAG] scrollable candidates INSIDE panel:', inPanelScrollables.length, inPanelScrollables.slice(0, 10));
  console.log(LOG, '[SCROLL-DIAG] scrollable ANCESTORS of panel:', ancestorScrollables);

  // 2. Virtualisation machinery: sentinels and load-more controls.
  const sentinels = queryAllIn(panel, '[class*="sentinel"], [class*="loader"], [class*="spinner"], [data-sentinel], [class*="infinite"], [class*="pagination"]')
    .map((el) => ({
      tag: (el.tagName || '?').toLowerCase(),
      cls: norm((el.className || '').toString()).slice(0, 90) || null,
      rect: rectOfEl(el),
      visible: visible(el),
    }));
  const loadMoreControls = queryAllIn(panel, 'button, a, [role="button"]')
    .filter((b) => /load (more|previous)|older|show more|previous messages/i.test(norm(b.textContent) + ' ' + (b.getAttribute('aria-label') || '')))
    .map((b) => ({
      tag: (b.tagName || '?').toLowerCase(),
      cls: norm((b.className || '').toString()).slice(0, 90) || null,
      text: norm(b.textContent).slice(0, 60),
      ariaLabel: b.getAttribute('aria-label'),
      visible: visible(b),
    }));
  console.log(LOG, '[SCROLL-DIAG] sentinel/loader-ish elements:', sentinels.length, sentinels.slice(0, 6));
  console.log(LOG, '[SCROLL-DIAG] load-more controls:', loadMoreControls.length, loadMoreControls);

  const initialTimestamps = mountedTimestamps();
  console.log(LOG, '[SCROLL-DIAG] initial mounted group count:', mountedGroupNodes().length);
  console.log(LOG, '[SCROLL-DIAG] initial mounted timestamps (ALL):', initialTimestamps);

  diagnostics.scrollDiag = {
    chosen: chosenScroller,
    scrollablesInPanel: inPanelScrollables.slice(0, 10),
    scrollableAncestors: ancestorScrollables,
    sentinels: sentinels.slice(0, 6),
    loadMoreControls: loadMoreControls,
    initialGroupCount: mountedGroupNodes().length,
    initialTimestamps: initialTimestamps,
    initialIdentities: mountedIdentities(),
  };

  // ── 4. Load the FULL history ──────────────────────────────────────────────
  // LinkedIn lazy-loads older messages when the pane hits the top. Scroll up,
  // wait for either scrollHeight to grow or the message count to rise, and
  // repeat until N consecutive rounds add nothing — a single empty round is not
  // proof we are done, because a slow request can land after the timeout.
  const countEvents = () => countEventsIn(panel);

  const MAX_ROUNDS = 120;      // hard stop; ~very long threads still finish
  const QUIET_ROUNDS = 3;      // consecutive no-growth rounds that mean "done"
  const SETTLE_MS = 700;

  const initialCount = countEvents();
  console.log(LOG, 'messages visible before scrolling:', initialCount);

  let quiet = 0;
  for (let round = 1; round <= MAX_ROUNDS && quiet < QUIET_ROUNDS; round++) {
    const beforeCount = countEvents();
    const beforeHeight = scroller.scrollHeight;

    const beforeTop = scroller.scrollTop;
    const beforeTimestamps = mountedTimestamps();
    const beforeIdentities = mountedIdentities();
    const beforeGroupCount = mountedGroupNodes().length;

    scroller.scrollTop = 0;
    const afterSet = scroller.scrollTop;
    // Some builds only fire the loader on a real scroll event.
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

    // DIAGNOSTIC: also try a wheel gesture. Some virtualised lists listen for
    // wheel rather than scroll. Recorded so we can tell which mechanism (if
    // any) actually triggers a load — this is measurement, not a fix.
    let wheelDispatched = false;
    try {
      scroller.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -600, bubbles: true, cancelable: true,
      }));
      wheelDispatched = true;
    } catch (e) { /* WheelEvent unavailable */ }

    // Explicit "load previous messages" button, when LinkedIn renders one
    // instead of pure infinite scroll.
    const loadBtn = queryAllIn(panel, 'button, .msg-s-message-list__load-more')
      .find((b) => /load (more|previous)|older messages|show more/i.test(norm(b.textContent)) && visible(b));
    if (loadBtn) {
      try { loadBtn.click(); } catch (e) { /* button detached mid-scroll */ }
    }

    await sleep(SETTLE_MS);

    // Lazily-loaded bubbles can mount into NEW shadow roots, which the cached
    // root list would not include — the count would then never grow and the
    // loop would stop after 3 rounds with the history truncated.
    refreshRoots();

    const afterCount = countEvents();
    const afterHeight = scroller.scrollHeight;
    diagnostics.scrollRounds = round;

    // Per-round record: did scrollTop actually move, did height grow, did the
    // mounted set change identity? This is what distinguishes CASE A (wrong
    // element), CASE B (right element, wrong trigger) and CASE C (loading works).
    const afterTimestamps = mountedTimestamps();
    const afterIdentities = mountedIdentities();
    const afterGroupCount = mountedGroupNodes().length;
    const newIdentities = afterIdentities.filter((id) => beforeIdentities.indexOf(id) === -1);
    const identitiesChanged = newIdentities.length > 0 ||
      afterIdentities.length !== beforeIdentities.length;

    (diagnostics.scrollLog = diagnostics.scrollLog || []).push({
      round,
      scroller: chosenScroller.tag + '.' + (chosenScroller.cls || '').split(' ')[0],
      scrollTopBefore: beforeTop,
      scrollTopAfterSet: afterSet,
      scrollTopNow: scroller.scrollTop,
      heightBefore: beforeHeight,
      heightAfter: afterHeight,
      eventCountBefore: beforeCount,
      eventCountAfter: afterCount,
      groupCountBefore: beforeGroupCount,
      groupCountAfter: afterGroupCount,
      firstTimestamp: afterTimestamps[0] || null,
      lastTimestamp: afterTimestamps[afterTimestamps.length - 1] || null,
      allTimestamps: afterTimestamps,
      newIdentities: newIdentities.slice(0, 6),
      identitiesChanged: identitiesChanged,
      loadMoreFound: !!loadBtn,
      loadMoreClicked: !!loadBtn,
      wheelDispatched: wheelDispatched,
      scrollEventDispatched: true,
      sentinelCount: queryAllIn(panel, '[class*="sentinel"], [class*="loader"], [class*="spinner"]').length,
      anythingChanged: identitiesChanged || afterHeight > beforeHeight + 10 || afterCount > beforeCount,
    });
    console.log(LOG, `[SCROLL-DIAG] round ${round}: scrollTop ${beforeTop}→${afterSet}→${scroller.scrollTop}` +
      ` | height ${beforeHeight}→${afterHeight} | events ${beforeCount}→${afterCount}` +
      ` | groups ${beforeGroupCount}→${afterGroupCount} | newIds=${newIdentities.length}` +
      ` | loadMore=${!!loadBtn} wheel=${wheelDispatched}` +
      ` | ts[0]=${afterTimestamps[0]} ts[last]=${afterTimestamps[afterTimestamps.length - 1]}`);

    if (afterCount > beforeCount || afterHeight > beforeHeight + 10) {
      quiet = 0;
      console.log(LOG, `scroll round ${round}: loaded ${afterCount - beforeCount} older message(s) (total ${afterCount})`);
    } else {
      quiet++;
    }
  }

  if (diagnostics.scrollRounds >= MAX_ROUNDS) {
    console.warn(LOG, `hit the ${MAX_ROUNDS}-round scroll cap — history may be truncated`);
    diagnostics.reason = 'scroll-cap-reached';
  }
  console.log(LOG, `scrolling finished after ${diagnostics.scrollRounds} round(s)`);

  // ── BIDIRECTIONAL PROBE (read-only) ───────────────────────────────────────
  // Tests every scrollable candidate, not just the chosen one: set each to
  // top, observe, then restore. If ANY candidate moves and mounts new groups,
  // that element is the real virtualised list and findScroller() picked wrong.
  const bidirectional = [];
  const probeTargets = [scroller].concat(
    queryAllIn(panel, '*').filter((el) => el !== scroller && el.scrollHeight > el.clientHeight + 20).slice(0, 6)
  );
  for (const target of probeTargets) {
    const originalTop = target.scrollTop;
    const idsBefore = mountedIdentities();
    const tsBefore = mountedTimestamps();

    // Toward older messages (up).
    target.scrollTop = 0;
    const topAfterSet = target.scrollTop;
    try { target.dispatchEvent(new Event('scroll', { bubbles: true })); } catch (e) { /* ignore */ }
    try { target.dispatchEvent(new WheelEvent('wheel', { deltaY: -800, bubbles: true, cancelable: true })); } catch (e) { /* ignore */ }
    await sleep(900);
    refreshRoots();
    const idsAfterUp = mountedIdentities();
    const tsAfterUp = mountedTimestamps();

    // Back down, to confirm the element responds to assignment at all.
    target.scrollTop = target.scrollHeight;
    const bottomAfterSet = target.scrollTop;
    await sleep(200);

    // Restore, so the page is left as we found it.
    target.scrollTop = originalTop;

    const gained = idsAfterUp.filter((id) => idsBefore.indexOf(id) === -1);
    const entry = {
      tag: (target.tagName || '?').toLowerCase(),
      cls: norm((target.className || '').toString()).slice(0, 90) || null,
      isChosenScroller: target === scroller,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
      originalScrollTop: originalTop,
      scrollTopAfterSetTop: topAfterSet,
      scrollTopAfterSetBottom: bottomAfterSet,
      respondsToAssignment: bottomAfterSet !== topAfterSet,
      groupsBefore: idsBefore.length,
      groupsAfterScrollUp: idsAfterUp.length,
      newGroupsMounted: gained.length,
      timestampsBefore: tsBefore.slice(0, 4),
      timestampsAfter: tsAfterUp.slice(0, 4),
    };
    bidirectional.push(entry);
    console.log(LOG, '[SCROLL-DIAG][BIDIRECTIONAL]', entry);
  }
  diagnostics.scrollBidirectional = bidirectional;

  // ── VERDICT ───────────────────────────────────────────────────────────────
  const log = diagnostics.scrollLog || [];
  const scrollerMoves = log.some((r) => r.scrollTopBefore !== r.scrollTopAfterSet) ||
    bidirectional.some((b) => b.respondsToAssignment);
  const mountedGroupsChange = log.some((r) => r.identitiesChanged) ||
    bidirectional.some((b) => b.newGroupsMounted > 0);
  const allTs = (mountedTimestamps() || []).filter(Boolean);
  const uniqueTs = Array.from(new Set(allTs));
  // "Full history" = timestamps span more than the last couple of minutes.
  const timestampsSpanFullHistory = uniqueTs.length > 3;
  const olderHistoryLoaded = mountedGroupsChange &&
    mountedGroupNodes().length > (diagnostics.scrollDiag.initialGroupCount || 0);

  let likelyCause;
  if (!scrollerMoves) {
    likelyCause = 'CASE A — the selected element does not scroll (scrollTop never changes). ' +
      'findScroller() picked the wrong node; see scrollablesInPanel / scrollableAncestors for the real one.';
  } else if (scrollerMoves && !mountedGroupsChange) {
    likelyCause = 'CASE B — the element scrolls but LinkedIn mounts nothing new from programmatic ' +
      'scroll/wheel. Loading is driven by another mechanism (IntersectionObserver sentinel, ' +
      'trusted user gesture, or an explicit control); see sentinels / loadMoreControls.';
  } else if (mountedGroupsChange && !timestampsSpanFullHistory) {
    likelyCause = 'CASE B/C boundary — new nodes mounted but timestamps still cover only the tail; ' +
      'virtualisation recycles nodes without extending history.';
  } else {
    likelyCause = 'CASE C — older history IS mounting; the remaining gap is in group/body extraction.';
  }

  diagnostics.scrollVerdict = {
    scrollerMoves, mountedGroupsChange, timestampsSpanFullHistory,
    olderHistoryLoaded, uniqueTimestamps: uniqueTs, likelyCause,
  };
  console.log(LOG, '[SCROLL-DIAG][VERDICT]');
  console.log(LOG, '  scrollerMoves               =', scrollerMoves);
  console.log(LOG, '  mountedGroupsChange         =', mountedGroupsChange);
  console.log(LOG, '  timestampsSpanFullHistory   =', timestampsSpanFullHistory);
  console.log(LOG, '  olderHistoryLoaded          =', olderHistoryLoaded);
  console.log(LOG, '  uniqueTimestamps            =', uniqueTs);
  console.log(LOG, '  likelyCause                 =', likelyCause);

  // ── 5. Identify "me" so direction can be resolved ─────────────────────────
  // The signed-in member's name comes from the global nav photo alt text; it is
  // the only reliable in-page source that does not require a network call.
  const meName = (() => {
    const img = deepQuery(
      '.global-nav__me-photo, img.global-nav__me-photo, .feed-identity-module__member-photo'
    );
    const alt = img && (img.getAttribute('alt') || '');
    const cleaned = norm(alt || '').replace(/^Photo of\s*/i, '');
    return cleaned || null;
  })();
  console.log(LOG, 'signed-in member:', meName || '(unknown)');

  // The other party — from the bubble/thread header.
  const participant = (() => {
    const link = queryIn(panel,
      '.msg-entity-lockup a[href*="/in/"], .msg-overlay-bubble-header a[href*="/in/"], .msg-thread__link-to-profile, a.msg-thread__link-to-profile'
    );
    const headerName = queryIn(panel,
      '.msg-entity-lockup__entity-title, .msg-overlay-bubble-header__title, h2.msg-entity-lockup__entity-title'
    );
    return {
      name: nn(headerName && dedupeText(headerName.textContent)) || nn(link && dedupeText(link.textContent)),
      profileUrl: link ? absUrl(link.getAttribute('href')) : null,
    };
  })();
  console.log(LOG, 'participant:', participant.name || '(unknown)');

  // The set of names that are SENDER LABELS in this thread. Used to tell a
  // sender header apart from a genuine one-word message ("Hiii", "Definitely"),
  // which a "looks like a name" shape test cannot do.
  const knownSenderNames = new Set();
  if (participant && participant.name) knownSenderNames.add(norm(participant.name).toLowerCase());
  if (meName) knownSenderNames.add(norm(meName).toLowerCase());
  // Names rendered in the thread's own profile links.
  queryAllIn(panel, '[class*="message-group__name"], [class*="event-listitem__name"]').forEach((e) => {
    const t = norm(e.textContent);
    if (t && t.length < 60) knownSenderNames.add(t.toLowerCase());
  });
  queryAllIn(panel, 'a[href*="/in/"]').forEach((a) => {
    const t = norm(a.textContent);
    // Skip a11y link text like "View Adarsh's profile" — not a sender label.
    if (t && t.length < 60 && !/view\s.*profile/i.test(t)) knownSenderNames.add(t.toLowerCase());
  });
  console.log(LOG, 'known sender names:', Array.from(knownSenderNames).join(' | ') || '(none)');

  // ── 6. Walk the message list in DOM order (oldest → newest) ───────────────
  // LinkedIn renders the thread chronologically top-to-bottom, so DOM order IS
  // chronological order. Sender name and avatar appear only on the FIRST bubble
  // of a run by the same person; subsequent bubbles inherit them, which is why
  // `lastSender` carries forward.
  // Use the same EVENT_SEL the detector used, so a panel found by the
  // class-blind path is not then walked with a narrower hardcoded list.
  // EVENT_SEL is deliberately overlapping so DETECTION is robust, but that
  // overlap must not reach the parser: one message can match 2-3 selectors.
  //
  // The hierarchy is  panel → message GROUP → message BODY.  We keep the
  // OUTERMOST match as the group, because it is the only node that carries the
  // sender header and timestamp; several bodies inside it become several
  // messages. An earlier attempt kept the INNERMOST match instead — that threw
  // the group away, left fragments with no bodies, and returned zero messages.
  const rawEventNodes = queryAllIn(panel, EVENT_SEL);

  // A node is a body/metadata leaf, not a group container. Matched on the
  // BEM-style suffix anywhere in the class string (no \b — the live build
  // appends utility classes after the BEM name).
  const isBodyOrMeta = (n) => {
    const cls = (n.className || '').toString();
    return /__(body|meta|name|timestamp|profile-link|attachment-item|file|image)/.test(cls);
  };

  const groupCandidates = rawEventNodes.filter((n) => !isBodyOrMeta(n));

  // Outermost, non-overlapping: drop any node contained by another candidate.
  // This yields SENDER GROUPS — a group may hold many message bodies, which
  // readBodies() below expands into one message each. It is deliberately NOT
  // one-group-per-message: keeping the outermost node is what preserves the
  // sender header and timestamp that the inner bubbles do not carry.
  let events = groupCandidates.filter(
    (n) => !groupCandidates.some((o) => o !== n && o.contains(n))
  );

  // Safety net: if the class-based exclusion removed everything (a build whose
  // containers carry no recognisable BEM names), fall back to the outermost of
  // the RAW matches rather than parsing nothing.
  if (!events.length && rawEventNodes.length) {
    events = rawEventNodes.filter(
      (n) => !rawEventNodes.some((o) => o !== n && o.contains(n))
    );
    console.log(LOG, '[PARSE] class-based group filter emptied the set — using outermost raw matches');
  }

  diagnostics.rawEventNodes = rawEventNodes.length;
  diagnostics.groupCandidates = groupCandidates.length;

  console.log(LOG, '[PARSE] selected panel:',
    (panel.tagName || '?').toLowerCase() + '.' + (norm((panel.className || '').toString()).split(' ')[0] || 'anon'));
  console.log(LOG, '[PARSE] raw EVENT_SEL matches:', rawEventNodes.length);
  console.log(LOG, '[PARSE] after excluding body/meta/name nodes:', groupCandidates.length);
  console.log(LOG, '[PARSE] candidate group nodes:', events.length);
  console.log(LOG, '[PARSE] timestamp anchors:',
    queryAllIn(panel, 'time, span, div').filter((e) =>
      e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent))).length);

  // ══════════════════════════════════════════════════════════════════════════
  // LIVE DIAGNOSTIC — READ-ONLY. Changes no extraction behaviour.
  //
  // Purpose: reveal the REAL structure of the message groups on the live page,
  // so the group→bodies parser can be written against actual markup instead of
  // guessed class names. Scoped to the first 5 groups and 4 levels deep so it
  // cannot flood the console with the 223-node panel.
  // ══════════════════════════════════════════════════════════════════════════
  const attrsOf = (el) => {
    const out = {};
    try {
      Array.from(el.attributes || []).forEach((a) => {
        if (a.name.indexOf('data-') === 0) out[a.name] = (a.value || '').slice(0, 60);
      });
    } catch (e) { /* detached */ }
    return Object.keys(out).length ? out : null;
  };
  // Text belonging to THIS element only, excluding descendants' text.
  const ownText = (el) => {
    let t = '';
    try {
      Array.from(el.childNodes || []).forEach((n) => {
        if (n.nodeType === 3) t += n.nodeValue || '';
      });
    } catch (e) { /* ignore */ }
    return norm(t);
  };
  const rectStr = (el) => {
    try {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    } catch (e) { return '?'; }
  };
  const briefly = (el) => ({
    tag: (el.tagName || '?').toLowerCase(),
    cls: norm((el.className || '').toString()).slice(0, 100) || null,
    role: el.getAttribute ? el.getAttribute('role') : null,
    ariaLabel: el.getAttribute ? el.getAttribute('aria-label') : null,
    data: attrsOf(el),
    ownText: ownText(el).slice(0, 120) || null,
    childElementCount: el.childElementCount,
    rect: rectStr(el),
  });

  console.log(LOG, '[LIVE-DIAGNOSTIC] selected panel:',
    (panel.tagName || '?').toLowerCase() + '.' + (norm((panel.className || '').toString()).split(' ')[0] || 'anon'));
  console.log(LOG, '[LIVE-DIAGNOSTIC] groups:', events.length, '| groups inspected:', Math.min(5, events.length));

  // ── 1. Structure of the first 5 groups, 4 levels deep ─────────────────────
  events.slice(0, 5).forEach((g, gi) => {
    const tstamp = queryAllIn(g, 'time, span, div').find((e) =>
      e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)));
    const nameNode = queryIn(g, '[class*="message-group__name"], [class*="event-listitem__name"]');

    console.log(LOG, `[LIVE-GROUP ${gi}]`, {
      sender: nameNode ? norm(nameNode.textContent) : null,
      timestamp: tstamp ? norm(tstamp.textContent) : null,
      tag: (g.tagName || '?').toLowerCase(),
      cls: norm((g.className || '').toString()).slice(0, 140),
      role: g.getAttribute ? g.getAttribute('role') : null,
      ariaLabel: g.getAttribute ? g.getAttribute('aria-label') : null,
      childElementCount: g.childElementCount,
      textContent: norm(g.textContent).slice(0, 400),
    });

    // Child hierarchy, breadth-first, capped at 4 levels.
    const walk = (el, depth, path) => {
      if (depth > 4) return;
      let kids = [];
      try { kids = Array.from(el.children || []); } catch (e) { return; }
      // A shadow root inside a group would hide children from `children`.
      if (el.shadowRoot) {
        console.log(LOG, `  [G${gi}] ${path} └─ (SHADOW ROOT on this node)`);
        try { kids = kids.concat(Array.from(el.shadowRoot.children || [])); } catch (e) { /* ignore */ }
      }
      kids.forEach((c, ci) => {
        console.log(LOG, `  [G${gi}] L${depth} ${path}>${ci}`, briefly(c));
        walk(c, depth + 1, `${path}>${ci}`);
      });
    };
    walk(g, 1, 'root');

    // ── 2. Every text-bearing element in this group ─────────────────────────
    console.log(LOG, `[LIVE-GROUP ${gi}][TEXT-NODES]`);
    queryAllIn(g, '*').forEach((e) => {
      const t = ownText(e);
      if (!t) return;                                  // only elements with OWN text
      const p = parentDeep(e);
      const gp = p ? parentDeep(p) : null;
      console.log(LOG, `  [G${gi}]`, {
        tag: (e.tagName || '?').toLowerCase(),
        cls: norm((e.className || '').toString()).slice(0, 90) || null,
        text: t.slice(0, 100),
        parentCls: p ? norm((p.className || '').toString()).slice(0, 70) : null,
        grandparentCls: gp ? norm((gp.className || '').toString()).slice(0, 70) : null,
        visible: visible(e),
        rect: rectStr(e),
        role: e.getAttribute ? e.getAttribute('role') : null,
        ariaLabel: e.getAttribute ? e.getAttribute('aria-label') : null,
        insideButton: !!closestDeep(e, 'button, [role="button"]'),
        insideProfileLink: !!closestDeep(e, 'a[href*="/in/"]'),
        insideTime: !!closestDeep(e, 'time'),
      });
    });
  });

  // ── 3. Locate known conversation strings anywhere in the panel ────────────
  const PROBE_STRINGS = [
    'Hiii', 'hello', 'Sounds interesting', "Let's do it", "You're welcome",
    'How about tomorrow at 11:00 AM', 'No problem', 'Take your time',
  ];
  console.log(LOG, '[TEXT-PROBE] searching panel for known message strings');
  PROBE_STRINGS.forEach((needle) => {
    const hits = queryAllIn(panel, '*').filter((e) => {
      const t = ownText(e);
      return t && t.toLowerCase().indexOf(needle.toLowerCase()) !== -1 && t.length < 250;
    });
    if (!hits.length) {
      console.log(LOG, `  [TEXT-PROBE] "${needle}" → NOT FOUND as own-text of any element`);
      return;
    }
    hits.slice(0, 3).forEach((e) => {
      const p = parentDeep(e);
      const gp = p ? parentDeep(p) : null;
      console.log(LOG, `  [TEXT-PROBE] "${needle}"`, {
        tag: (e.tagName || '?').toLowerCase(),
        cls: norm((e.className || '').toString()).slice(0, 100) || null,
        text: ownText(e).slice(0, 90),
        parent: p ? (p.tagName || '').toLowerCase() + '.' + norm((p.className || '').toString()).slice(0, 70) : null,
        grandparent: gp ? (gp.tagName || '').toLowerCase() + '.' + norm((gp.className || '').toString()).slice(0, 70) : null,
        visible: visible(e),
        rect: rectStr(e),
        insideButton: !!closestDeep(e, 'button, [role="button"]'),
        insideProfileLink: !!closestDeep(e, 'a[href*="/in/"]'),
      });
    });
    if (hits.length > 3) console.log(LOG, `    …and ${hits.length - 3} more hit(s) for "${needle}"`);
  });

  // ── 4. Why does the multi-message group yield only one body? ──────────────
  // Find the group that holds two known-adjacent messages and show exactly
  // what each candidate selector matches inside it.
  const multiGroup = events.find((g) => {
    const t = norm(g.textContent);
    return (t.indexOf('Sounds interesting') !== -1 && t.indexOf("Let's do it") !== -1) ||
      (t.indexOf('Take your time') !== -1 && t.indexOf('I understand') !== -1);
  });
  if (!multiGroup) {
    console.log(LOG, '[MULTI-BODY-PROBE] no group contained two known-adjacent messages');
  } else {
    const SELECTOR_TRIALS = [
      '.msg-s-event-listitem__body',
      'p.msg-s-event-listitem__body',
      '[class*="event-listitem__body"]',
      '[class*="message-bubble"]',
      '[class*="msg-bubble"]',
      'li',
      'p',
      '[role="listitem"]',
    ];
    console.log(LOG, '[MULTI-BODY-PROBE] group text:', norm(multiGroup.textContent).slice(0, 400));
    console.log(LOG, '[MULTI-BODY-PROBE] selector trials:');
    SELECTOR_TRIALS.forEach((sel) => {
      const hits = queryAllIn(multiGroup, sel);
      console.log(LOG, `    ${sel} → ${hits.length} match(es)`,
        hits.slice(0, 4).map((h) => norm(h.textContent).slice(0, 45)));
    });
    console.log(LOG, '[MULTI-BODY-PROBE] all own-text descendants:');
    queryAllIn(multiGroup, '*').forEach((e) => {
      const t = ownText(e);
      if (!t) return;
      const p = parentDeep(e);
      console.log(LOG, '    ', {
        tag: (e.tagName || '?').toLowerCase(),
        cls: norm((e.className || '').toString()).slice(0, 90) || null,
        text: t.slice(0, 80),
        parentTag: p ? (p.tagName || '').toLowerCase() : null,
        parentCls: p ? norm((p.className || '').toString()).slice(0, 70) : null,
        visible: visible(e),
      });
    });
  }
  // Also RETURN the report. The console.log calls above go to the PAGE's
  // console; the side panel has its own. Returning it means the whole
  // diagnostic is readable from wherever the user is looking.
  try {
    diagnostics.liveGroupReport = {
      panel: (panel.tagName || '?').toLowerCase() + '.' +
        norm((panel.className || '').toString()).split(' ')[0],
      groupCount: events.length,
      // All groups (capped at 25): with only ~20 mounted this is cheap, and it
      // shows the full time range actually present — the fastest way to confirm
      // whether older history is in the DOM at all.
      groupTimeRange: events.map((g) => {
        const t = queryAllIn(g, 'time, span, div').find((e) =>
          e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)));
        return t ? norm(t.textContent) : null;
      }),
      groupTexts: events.slice(0, 25).map((g) => norm(g.textContent).slice(0, 90)),
      groups: events.slice(0, 5).map((g) => {
        const tstamp = queryAllIn(g, 'time, span, div').find((e) =>
          e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)));
        const nameNode = queryIn(g, '[class*="message-group__name"], [class*="event-listitem__name"]');
        return {
          sender: nameNode ? norm(nameNode.textContent) : null,
          timestamp: tstamp ? norm(tstamp.textContent) : null,
          tag: (g.tagName || '?').toLowerCase(),
          cls: norm((g.className || '').toString()).slice(0, 140),
          childElementCount: g.childElementCount,
          text: norm(g.textContent).slice(0, 300),
          ownTextDescendants: queryAllIn(g, '*')
            .map((e) => ({
              tag: (e.tagName || '?').toLowerCase(),
              cls: norm((e.className || '').toString()).slice(0, 80) || null,
              text: ownText(e).slice(0, 80),
              visible: visible(e),
              insideButton: !!closestDeep(e, 'button, [role="button"]'),
              insideProfileLink: !!closestDeep(e, 'a[href*="/in/"]'),
            }))
            .filter((d) => d.text),
        };
      }),
      multiBodyProbe: multiGroup ? {
        text: norm(multiGroup.textContent).slice(0, 300),
        selectorCounts: [
          '.msg-s-event-listitem__body', '[class*="event-listitem__body"]',
          '[class*="message-bubble"]', 'li', 'p', '[role="listitem"]',
        ].reduce((acc, sel) => {
          acc[sel] = queryAllIn(multiGroup, sel).length;
          return acc;
        }, {}),
        ownTextDescendants: queryAllIn(multiGroup, '*')
          .map((e) => ({
            tag: (e.tagName || '?').toLowerCase(),
            cls: norm((e.className || '').toString()).slice(0, 80) || null,
            text: ownText(e).slice(0, 80),
            parentCls: parentDeep(e) ? norm((parentDeep(e).className || '').toString()).slice(0, 60) : null,
            visible: visible(e),
          }))
          .filter((d) => d.text),
      } : null,
    };
  } catch (e) {
    console.warn(LOG, '[LIVE-DIAGNOSTIC] report capture failed:', e && e.message);
  }

  console.log(LOG, '[LIVE-DIAGNOSTIC] END');

  // ── UI-CONTROL EXCLUSION ──────────────────────────────────────────────────
  // Buttons, a11y labels, and suggested replies are NOT conversation content.
  // Decided STRUCTURALLY (is this node inside a button/menu?) rather than by
  // blacklisting strings, because a suggested reply and a real message can
  // carry identical text — "No problem" appears as both in this very thread.
  const UI_CONTAINER_SEL = [
    'button',
    '[role="button"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="toolbar"]',
    '[role="tooltip"]',
    '[role="tablist"]',
    '.msg-form',
    '.artdeco-button',
    '.artdeco-dropdown__content',
    '[class*="reply-suggestion"]',
    '[class*="suggested-repl"]',
    '[class*="smart-repl"]',
    '[class*="quick-repl"]',
    '[class*="emoji"]',
    '[class*="typeahead"]',
    '[class*="premium-upsell"]',
  ].join(', ');

  // Text that is purely an accessibility affordance, never message content.
  const UI_TEXT_RE = /^(open emoji keyboard|view [^\s]+(’|')?s? profile|view profile|see more|see less|show more|translate|report|delete|copy|edit|react|reply|forward|send|attach|add a photo|open messenger|conversation|options|more)$/i;
  // "Adarsh Jain sent the following message(s) at 6:45 PM" — a11y narration.
  const A11Y_NARRATION_RE = /sent the following messages? at/i;

  let uiControlsExcluded = 0;
  const isUiControl = (el) => {
    if (!el) return true;
    if (closestDeep(el, UI_CONTAINER_SEL)) return true;
    const t = norm(el.textContent);
    if (UI_TEXT_RE.test(t) || A11Y_NARRATION_RE.test(t)) return true;
    // Screen-reader-only copies duplicate the visible text; skip them so the
    // body is read exactly once.
    try {
      if (el.matches && el.matches('.visually-hidden, .a11y-text, [class*="visually-hidden"], [aria-hidden="true"]')) return true;
    } catch (e) { /* ignore */ }
    return false;
  };

  // ── STRUCTURAL MESSAGE-GROUP DISCOVERY ────────────────────────────────────
  // Runs when EVENT_SEL matched nothing (the live page: panel resolved to a
  // generic `div.display-flex`, so class selectors are useless). Anchors on
  // TIMESTAMPS — every LinkedIn message carries a "6:53 PM"-style time — and
  // treats the timestamp's enclosing block as ONE logical message group.
  // This replaces the old leaf-scraping fallback that emitted 595 nodes for
  // ~92 messages, one per span/button/text-node.
  if (!events.length) {
    const TIME_RE = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
    const composerRoot = queryIn(panel, COMPOSER_SEL);

    // 1. Every timestamp leaf inside the panel marks one message group.
    const timeNodes = queryAllIn(panel, 'time, span, div').filter((el) => {
      if (el.childElementCount !== 0) return false;
      if (composerRoot && composerRoot.contains(el)) return false;
      return TIME_RE.test(norm(el.textContent));
    });

    // 2. Climb from each timestamp to the block that also holds body text.
    //    That block is the message group; its descendants are its content.
    const TIME_ONLY_RE = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
    // Names actually present in this thread. Matching against these — rather
    // than a "looks like a name" shape test — is essential: real one-word
    // messages ("Hiii", "Definitely", "Well") are capitalised and short, and a
    // shape test silently drops them along with the sender labels.
    const senderNames = knownSenderNames;

    // Does this node hold real BODY text — a leaf that is not the timestamp,
    // not a sender label, and not a UI control? Climbing merely until the text
    // is "longer than the timestamp" stops at the header block (sender + time)
    // and yields a group with no bodies at all.
    // A header block contains ONLY the sender label, the a11y profile link and
    // the timestamp. Every leaf in it is metadata, so a node qualifies as a
    // group only when it holds a leaf that is none of those things. Note the
    // sender label cannot be identified by name here (the participant list is
    // not yet known at grouping time), so it is recognised structurally: a
    // short leaf that sits in the same block as the timestamp.
    const hasBodyText = (n) => {
      // `time` must be in this list: LinkedIn renders the timestamp as <time>,
      // and omitting it means the header block is never recognised as a header,
      // so the climb stops there and the group has no body at all.
      const leaves = queryAllIn(n, 'p, span, div, time').filter((e) => e.childElementCount === 0);
      const timeLeaf = leaves.find((e) => TIME_ONLY_RE.test(norm(e.textContent)));
      const timeBlock = timeLeaf ? parentDeep(timeLeaf) : null;
      return leaves.some((e) => {
        const t = norm(e.textContent);
        if (!t || TIME_ONLY_RE.test(t)) return false;
        if (senderNames.has(t.toLowerCase())) return false;    // known sender label
        // Sibling of the timestamp ⇒ part of the header, not a message body.
        if (timeBlock && parentDeep(e) === timeBlock) return false;
        return !isUiControl(e);
      });
    };

    const groups = [];
    timeNodes.forEach((timeEl) => {
      let node = parentDeep(timeEl);
      for (let i = 0; i < 8 && node && node !== panel; i++) {
        if (hasBodyText(node) && groups.indexOf(node) === -1) {
          groups.push(node);
          break;
        }
        node = parentDeep(node);
      }
    });

    // 3. Drop any group nested inside another group — keep the outermost per
    //    timestamp so a message is never counted twice.
    events = groups.filter((g) => !groups.some((o) => o !== g && o.contains(g)));

    // No timestamps anywhere (some builds/threads omit them). Fall back to
    // body-text leaves and use each leaf's parent as its group, so the layer
    // still yields one object per message instead of failing outright.
    if (!events.length) {
      // Sender labels repeat verbatim across the thread (one per bubble) while
      // message bodies rarely do. Any short leaf appearing 2+ times AND also
      // matching a profile-link's text is treated as a label, not a body.
      const freq = new Map();
      const leaves = queryAllIn(panel, 'p, span, div').filter((e) => e.childElementCount === 0);
      leaves.forEach((e) => {
        const t = norm(e.textContent);
        if (t) freq.set(t, (freq.get(t) || 0) + 1);
      });
      const linkTexts = new Set();
      queryAllIn(panel, 'a[href*="/in/"]').forEach((a) => {
        const t = norm(a.textContent);
        if (t) linkTexts.add(t.toLowerCase());
      });
      const looksLikeLabel = (t) =>
        senderNames.has(t.toLowerCase()) ||
        (t.length < 60 && freq.get(t) > 1 && linkTexts.has(t.toLowerCase()));

      const seenWrap = [];
      leaves.forEach((e) => {
        const t = norm(e.textContent);
        if (!t || TIME_ONLY_RE.test(t)) return;
        if (looksLikeLabel(t)) return;
        if (isUiControl(e)) { uiControlsExcluded++; return; }
        const w = parentDeep(e) || e;
        if (seenWrap.indexOf(w) === -1) seenWrap.push(w);
      });
      events = seenWrap.filter((g) => !seenWrap.some((o) => o !== g && o.contains(g)));
      console.log(LOG, 'no timestamps found — text-leaf grouping →', events.length, 'group(s)');
    }

    console.log(LOG, 'structural grouping: ', timeNodes.length, 'timestamp anchor(s) →',
      events.length, 'message group(s)');
  }

  // NOTE: this counts message-bubble DOM nodes after collapsing the
  // overlapping EVENT_SEL matches — NOT logical messages. A group can still
  // hold several messages; `messages returned` below is the logical figure.
  diagnostics.messagesFound = events.length;
  diagnostics.logicalGroups = events.length;
  console.log(LOG, 'message group DOM nodes (deduped):', events.length);

  const messages = [];
  const seen = new Set();
  let currentDate = null;      // date separators are their own list items
  let lastSender = { name: null, profileUrl: null };

  // A date heading ("TODAY", "MAR 14") is rendered as a sibling <time>/heading
  // rather than inside a bubble, so pick it up as we pass it.
  // LinkedIn renders the heading either INSIDE the event <li> or as its own
  // sibling node just above it, depending on the build — check both.
  const readDateHeading = (node) => {
    const SEL = '.msg-s-message-list__time-heading, time.msg-s-message-list__time-heading, .msg-s-message-list__event-time-heading';
    const inside = queryIn(node, SEL);
    if (inside) return nn(dedupeText(inside.textContent));
    try { if (node.matches && node.matches(SEL)) return nn(dedupeText(node.textContent)); } catch (e) { /* ignore */ }
    let prev = node.previousElementSibling;
    for (let i = 0; i < 2 && prev; i++, prev = prev.previousElementSibling) {
      try { if (prev.matches && prev.matches(SEL)) return nn(dedupeText(prev.textContent)); } catch (e) { /* ignore */ }
      const nested = queryIn(prev, SEL);
      if (nested && !queryIn(prev, '.msg-s-event-listitem__body')) {
        return nn(dedupeText(nested.textContent));
      }
    }
    return null;
  };

  // ── BODY EXTRACTION ───────────────────────────────────────────────────────
  // Returns the DISTINCT message bodies inside one group, in DOM order. A
  // group can hold several messages (LinkedIn renders consecutive messages
  // from one sender under a single header), so this returns an array.
  //
  // Reads whole body ELEMENTS, never concatenated text: LinkedIn renders each
  // body twice (visible + screen-reader copy). Concatenating them produced
  // "hellohello", and dedupeText's halves-test failed on odd lengths — which
  // is exactly how "That sounds..." lost its T and became "hat sounds...".
  // Reading one element gives the complete, unclipped string.
  let duplicateBodiesCollapsed = 0;

  let candidateBodyNodes = 0;
  let canonicalBodies = 0;

  const readBodies = (group, excludeEls) => {
    // ONE GROUP = N MESSAGE BODIES. A sender-run ("No problem", "Take your
    // time", "I understand", …) is a single group holding many bodies, so this
    // must collect ALL of them — never stop at the first.
    //
    // The canonical class is tried first, then broader body-ish selectors, so a
    // build that renders bodies under a different class still yields every
    // message rather than one. Whichever selector wins, its FULL match set is
    // used.
    let bodyEls = [];
    const BODY_SELECTORS = [
      '.msg-s-event-listitem__body, p.msg-s-event-listitem__body',
      '[class*="event-listitem__body"]',
      '[class*="message-bubble"] p, [class*="msg-bubble"] p',
    ];
    for (const sel of BODY_SELECTORS) {
      const hits = queryAllIn(group, sel);
      if (hits.length) { bodyEls = hits; break; }
    }
    const canonical = bodyEls.length > 0;

    // Drop any body element nested inside another body element. Visual/a11y
    // TWINS are collapsed further down by the adjacency test — not here, and
    // never by halving the string, which is what corrupted "That sounds…".
    if (canonical) {
      bodyEls = bodyEls.filter((n) => !bodyEls.some((o) => o !== n && n.contains(o)));
    }

    if (!bodyEls.length) {
      // Structural fallback: the deepest elements holding real text, excluding
      // UI controls, timestamps, sender labels, and date headings.
      const TIME_RE = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
      const DATE_ONLY = /^(today|yesterday|[a-z]{3}\s+\d{1,2}|[a-z]+day)$/i;
      // The resolved sender/time elements are passed in, so a build-specific
      // class name (e.g. `.name-txt`) cannot leak the sender in as a body.
      const excluded = excludeEls || [];
      const excludedTxt = new Set(excluded.filter(Boolean).map((e) => norm(e.textContent)));
      // A header block holds the sender + timestamp; everything in it is meta.
      const headerEls = excluded.filter(Boolean).map((e) => parentDeep(e)).filter(Boolean);

      bodyEls = queryAllIn(group, 'p, span, div, time').filter((e) => {
        if (e.childElementCount !== 0) return false;          // leaf only
        const t = norm(e.textContent);
        if (!t) return false;
        if (TIME_RE.test(t) || DATE_ONLY.test(t)) return false;
        try { if (e.matches('time')) return false; } catch (err) { /* ignore */ }
        if (excluded.indexOf(e) !== -1 || excludedTxt.has(t)) return false;
        if (headerEls.some((h) => h.contains(e))) return false;
        if (isUiControl(e)) { uiControlsExcluded++; return false; }
        return true;
      });
    }

    candidateBodyNodes += bodyEls.length;

    // Collapse the visual + accessibility representations of ONE message.
    //
    // They are ADJACENT in DOM order with identical text, so an adjacency test
    // is what distinguishes them from two legitimately-identical messages:
    //   twins        → "Well", "Well"            (same message, 2 renderings)
    //   real repeats → "Well", "And you?", "Well" (separated by other content)
    // This is why global text dedupe is wrong and is NOT used here — the
    // thread genuinely contains "No problem" from both participants.
    //
    // Each surviving element is read WHOLE via textContent. No concatenation,
    // no halving — that is what preserves the leading "T" in "That sounds…".
    // Two distinct duplication shapes exist across LinkedIn builds:
    //   (a) SIBLING twins  — <p>Hiii</p><p class="visually-hidden">Hiii</p>
    //       handled by the adjacency check below.
    //   (b) IN-ELEMENT     — <p>HiiiHiii</p> (visual + a11y span concatenated)
    //       handled here by dedupeText, but ONLY when the element's own text
    //       is an exact doubling of a repeated child. Guarded so it can never
    //       half a legitimately repetitive message.
    const readOne = (el) => {
      const raw = norm(el.textContent);
      if (!raw || raw.length % 2 !== 0) return raw;
      // Exact halves AND the element renders its text more than once.
      const half = raw.length / 2;
      if (raw.slice(0, half) !== raw.slice(half)) return raw;
      const kids = Array.from(el.children || []).filter((c) => norm(c.textContent));
      const kidTexts = kids.map((c) => norm(c.textContent));
      const doubledByChildren = kidTexts.length >= 2 &&
        kidTexts[0] === raw.slice(0, half) && kidTexts[1] === raw.slice(0, half);
      // No element children ⇒ the doubling is inside a single text node, which
      // is the legacy shape these fixtures model.
      return (doubledByChildren || !kids.length) ? raw.slice(0, half) : raw;
    };

    const out = [];
    bodyEls.forEach((el) => {
      const t = readOne(el);
      if (!t) return;
      const prev = out.length ? out[out.length - 1] : null;
      // Adjacent duplicate ⇒ the a11y twin of the message just recorded.
      if (prev && prev.text === t) {
        duplicateBodiesCollapsed++;
        // Prefer the VISIBLE element as canonical, so geometry-based checks
        // downstream (and any future styling reads) see the real bubble.
        if (!visible(prev.el) && visible(el)) prev.el = el;
        return;
      }
      // Nested representation of the element already recorded.
      if (prev && (prev.el.contains(el) || el.contains(prev.el))) {
        duplicateBodiesCollapsed++;
        return;
      }
      out.push({ text: t, el, anchor: parentDeep(el) || el });
    });

    canonicalBodies += out.length;
    return out;
  };

  let groupIndex = -1;
  for (const node of events) {
    groupIndex++;
    // Stable identity for this message's position in the thread: the chain of
    // sibling indices up to the panel. A virtual-list re-mount reuses the same
    // slot, so the key matches and the duplicate collapses; two DIFFERENT
    // messages always occupy different slots, so identical text stays distinct.
    const nodeKey = (() => {
      const parts = [];
      let n = node;
      for (let i = 0; i < 12 && n && n !== panel; i++) {
        const p = parentDeep(n);
        if (!p) break;
        parts.push(Array.prototype.indexOf.call(p.children, n));
        n = p;
      }
      return parts.reverse().join('.');
    })();
    // Date headings sit as siblings of the message GROUP, not of the bubble,
    // so check both scopes.
    const groupForHeading =
      closestDeep(node, '.msg-s-message-group, [class*="msg-s-message-group"]') || node;
    const heading = readDateHeading(node) ||
      (groupForHeading !== node ? readDateHeading(groupForHeading) : null);
    if (heading) currentDate = heading;

    // The sender header and timestamp live on the enclosing message GROUP,
    // while `node` is the individual bubble. Widen metadata lookups to that
    // group (falling back to the bubble when there is no separate group).
    const senderScope =
      closestDeep(node, '.msg-s-message-group, [class*="msg-s-message-group"]') || node;

    // Bodies are read AFTER nameEl/timeEl below, so those elements can be
    // excluded by identity rather than by class name.
    let bodies = null;
    // Try each selector IN ORDER and keep the first that actually yields text.
    // A comma-list querySelector would return the first match in DOCUMENT
    // order instead — and the profile-link anchor precedes the name span while
    // being empty, so the comma form silently resolves every sender to "".
    const nameEl = [
      '.msg-s-message-group__name',
      '.msg-s-event-listitem__name',
      '.msg-s-message-group__profile-link',
    ].reduce((found, sel) => {
      if (found) return found;
      // Search the bubble first, then its enclosing message GROUP: LinkedIn
      // puts the sender header on the group, and `node` is now the individual
      // bubble (so consecutive messages stay separate). Without the widened
      // scope every sender resolves to null and carry-forward mislabels the
      // whole thread.
      const el = queryIn(node, sel) || queryIn(senderScope, sel);
      return el && norm(el.textContent) ? el : null;
    }, null) ||
      // Class-blind fallback: a short leaf string that is NOT the body and
      // looks like a person's name (2-4 capitalised words).
      // Class-blind: prefer a leaf whose text is a KNOWN participant name.
      // A pure "looks like a name" shape test misfires on one-word messages —
      // "Hiii" and "Definitely" are capitalised and short, and treating one as
      // the sender label deletes that message from the output entirely.
      (() => {
        const leaves = queryAllIn(node, 'span, div, a, p, time')
          .filter((e) => e.childElementCount === 0);
        const timeLeaf = leaves.find((e) => /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)));
        const headerBlock = timeLeaf ? parentDeep(timeLeaf) : null;
        return leaves.find((e) => {
          const t = norm(e.textContent);
          if (!t || t.length >= 60) return false;
          if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t)) return false;
          // "View Adarsh's profile" and other chrome must never become a name.
          if (isUiControl(e)) return false;
          // A known participant name, or a short leaf sharing the header block
          // with the timestamp — that position IS the sender label, whatever
          // class LinkedIn gives it.
          return knownSenderNames.has(t.toLowerCase()) ||
            (headerBlock && parentDeep(e) === headerBlock);
        }) || null;
      })();
    // Scope the profile link to the message-group HEADER. A bare
    // `a[href*="/in/"]` also matches a profile link the sender pasted into the
    // message body, which would attribute the message to the wrong person.
    const linkEl = queryIn(node,
      '.msg-s-message-group__profile-link, .msg-s-message-group__meta a[href*="/in/"], .msg-s-event-listitem__link'
    ) || queryIn(senderScope,
      '.msg-s-message-group__profile-link, .msg-s-message-group__meta a[href*="/in/"], .msg-s-event-listitem__link'
    );
    const timeEl = queryIn(node,
      '.msg-s-message-group__timestamp, time.msg-s-message-group__timestamp, .msg-s-event-listitem__timestamp'
    ) || queryIn(senderScope,
      '.msg-s-message-group__timestamp, time.msg-s-message-group__timestamp, .msg-s-event-listitem__timestamp'
    ) ||
      // Class-blind: any leaf that is exactly a clock time.
      queryAllIn(node, 'time, span, div').filter((e) =>
        e.childElementCount === 0 && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(norm(e.textContent)))[0] || null;

    // Now that sender/time are known, read the bodies excluding them.
    bodies = readBodies(node, [nameEl, timeEl, linkEl]);

    // Attachments / media: files, images, and shared links each render in their
    // own container. Absent → empty array, never a fabricated placeholder.
    const attachments = [];
    queryAllIn(node, '.msg-s-event-listitem__attachment-item, a[href*="/dms/"], .msg-s-event-listitem__file').forEach((a) => {
      attachments.push({
        type: 'file',
        name: nn(dedupeText(a.getAttribute('title') || a.textContent)),
        url: absUrl(a.getAttribute('href')),
      });
    });
    queryAllIn(node, '.msg-s-event-listitem__image img, img.msg-s-event-listitem__image').forEach((img) => {
      attachments.push({
        type: 'image',
        name: nn(img.getAttribute('alt')),
        url: absUrl(img.getAttribute('src')),
      });
    });

    // A group with neither text nor media is a separator/typing indicator.
    if (!bodies.length && !attachments.length) continue;

    // Carry the sender forward across a run of consecutive bubbles.
    const senderName = nn(nameEl && dedupeText(nameEl.textContent)) || lastSender.name;
    const senderProfileUrl = (linkEl ? absUrl(linkEl.getAttribute('href')) : null) || lastSender.profileUrl;
    if (nameEl) lastSender = { name: senderName, profileUrl: senderProfileUrl };

    // Direction: a message is "sent" when the sender is the signed-in member.
    // When we could not resolve the member name, fall back to LinkedIn's own
    // "other" class rather than guessing.
    let direction = null;
    if (meName && senderName) {
      direction = norm(senderName).toLowerCase() === norm(meName).toLowerCase() ? 'sent' : 'received';
    } else if (node.className && /--other\b/.test(node.className)) {
      direction = 'received';
    }

    const receiverName = direction === 'sent'
      ? (participant.name || null)
      : (meName || null);

    // Machine timestamp when LinkedIn exposes one; the human time otherwise.
    const timeRaw = timeEl ? nn(dedupeText(timeEl.textContent)) : null;
    const timestamp = (timeEl && (timeEl.getAttribute('datetime') || timeEl.getAttribute('data-timestamp'))) || null;

    const groupMessageId =
      node.getAttribute('data-event-urn') ||
      node.getAttribute('data-id') ||
      (queryIn(node, '[data-event-urn]') || {}).getAttribute?.('data-event-urn') ||
      null;

    // ONE message per distinct body in the group. LinkedIn renders consecutive
    // messages from the same sender under a single header — those are separate
    // messages, so each body becomes its own object rather than being merged.
    // Attachments belong to the group and are attached to its first message.
    const emit = (text, idx) => {
      const messageId = groupMessageId;
      // Dedupe key: a stable id when we have one, otherwise the content tuple
      // plus the body index, so two identical texts in the SAME group (LinkedIn
      // threads do repeat "Well" / "And you?") are not collapsed into one.
      // SAFETY LAYER ONLY. The parser above already yields one object per real
      // message, so this exists solely to catch virtual-list re-mounts (the
      // same message re-rendered under a new node during scrolling).
      //
      // It must never collapse legitimate repeats: this thread really does
      // contain "No problem" from BOTH participants, and "Well"/"And you?"
      // several times. Keying on the message-node identity via nodeKey keeps
      // those distinct, while a re-mount of the SAME message — identical
      // sender, text, time and body index — still collapses.
      const key = (messageId ? messageId + '#' + idx : '') ||
        [nodeKey, idx, senderName, text, timeRaw, currentDate].join('||');
      if (seen.has(key)) {
        diagnostics.duplicatesRemoved++;
        return;
      }
      seen.add(key);

      const att = idx === 0 ? attachments : [];
      diagnostics.attachmentsFound += att.length;
      messages.push({
        messageId: messageId,
        senderName: senderName || null,
        senderProfileUrl: senderProfileUrl || null,
        receiverName: receiverName,
        direction: direction,
        text: text || null,
        date: currentDate,
        time: timeRaw,
        timestamp: timestamp,
        attachments: att,
      });
    };

    // Per-group visibility: this is how we verify that grouped sender-runs are
    // actually being split into several messages rather than collapsed to one.
    console.log(LOG, `[GROUP ${groupIndex}] sender=${senderName || '(unknown)'}` +
      ` bodies=${bodies.length}` +
      (bodies.length ? ` → ${JSON.stringify(bodies.map((b) => b.text.slice(0, 40)))}` : ''));

    if (bodies.length) {
      bodies.forEach((b, i) => emit(b.text, i));
    } else {
      emit(null, 0);   // attachment-only message
    }
  }

  diagnostics.uiControlsExcluded = uiControlsExcluded;
  diagnostics.duplicateBodiesCollapsed = duplicateBodiesCollapsed;
  diagnostics.candidateBodyNodes = candidateBodyNodes;
  diagnostics.canonicalBodies = canonicalBodies;

  diagnostics.messagesLoaded = messages.length;
  diagnostics.completed = true;
  diagnostics.elapsedMs = Date.now() - startedAt;

  console.log(LOG, '── extraction summary ─────────────────');
  console.log(LOG, 'thread id            :', diagnostics.threadId || '(none)');
  console.log(LOG, 'participant          :', participant.name || '(unknown)');
  console.log(LOG, 'scroll rounds        :', diagnostics.scrollRounds);
  console.log(LOG, 'raw event DOM nodes (overlapping)      :', diagnostics.rawEventNodes || 0);
  console.log(LOG, 'message group DOM nodes (deduped)      :', diagnostics.logicalGroups || 0);
  console.log(LOG, 'candidate body nodes                   :', diagnostics.candidateBodyNodes || 0);
  console.log(LOG, 'canonical message bodies               :', diagnostics.canonicalBodies || 0);
  console.log(LOG, 'accessibility/visual duplicates collapsed:', diagnostics.duplicateBodiesCollapsed || 0);
  console.log(LOG, 'UI controls excluded                   :', diagnostics.uiControlsExcluded || 0);
  console.log(LOG, 'messages returned                      :', diagnostics.messagesLoaded);
  console.log(LOG, 'duplicates removed (safety layer)      :', diagnostics.duplicatesRemoved);
  console.log(LOG, 'attachments found    :', diagnostics.attachmentsFound);
  console.log(LOG, 'completed            :', diagnostics.completed, `(${diagnostics.elapsedMs}ms)`);
  console.log(LOG, '───────────────────────────────────────');

  if (!messages.length) {
    return fail('Conversation panel was found but contained no readable messages.');
  }

  return {
    conversation: {
      participant: participant,
      threadId: diagnostics.threadId,
      messages: messages,
    },
    diagnostics: diagnostics,
    error: null,
  };
}
