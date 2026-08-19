/**
 * Live self-verification for the QuikCRM Connect button.
 *
 * Fixtures cannot prove this works — LinkedIn's real DOM is hashed, SDUI-driven
 * and auth-walled, so it is unreachable from CI or any headless run. This script
 * runs the checks in the real page instead, and prints one row per gate.
 *
 * USAGE — on a LinkedIn profile tab, open DevTools → Console and paste:
 *     await __qcrmVerify()
 *
 * It reports every gate, then actively scrolls and simulates SPA navigation to
 * confirm the button is neither lost nor duplicated. Read-only: it never clicks
 * Connect and never writes to the CRM.
 */
(function () {
  'use strict';

  const BTN_ID = 'quikcrm-connect-btn';
  const STICKY_SEL =
    '.global-nav__sticky, [class*="global-nav"], [class*="scaffold-layout-toolbar"], ' +
    '[class*="pv-top-card--reorder"], [class*="sticky"]';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = () => Array.from(document.querySelectorAll('#' + BTN_ID));
  const one = () => document.getElementById(BTN_ID);

  function pathOf(el) {
    if (!el) return null;
    const seg = [];
    let n = el;
    while (n && n.nodeType === 1 && seg.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (n.className && typeof n.className === 'string') {
        const c = n.className.trim().split(/\s+/)[0];
        if (c) s += '.' + c;
      }
      seg.unshift(s);
      n = n.parentElement;
    }
    return seg.join(' > ');
  }

  /**
   * Wait for the button, but bounded — a profile that legitimately has no
   * Connect CTA (your own profile, an existing connection) must not hang.
   */
  async function waitForButton(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (one()) return true;
      await sleep(250);
    }
    return !!one();
  }

  window.__qcrmVerify = async function __qcrmVerify() {
    const rows = [];
    const add = (gate, pass, detail) => rows.push({ gate, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });

    console.log('%c[QCRM] live verification — ' + location.pathname, 'font-weight:bold');

    // ── Gate 0: script present ──
    const loaded = typeof window.__qcrmDumpButtons === 'function';
    add('content script loaded', loaded, loaded ? '' : 'connect-button.js did not run — reload the extension');

    await waitForButton(12000);

    // ── Gates 1-3: profile root + scope + sticky ──
    const btn = one();
    const bar = btn ? btn.parentElement : null;
    const rootish = btn ? btn.closest('main') : null;

    add('profile root found', !!bar, bar ? pathOf(bar) : 'no button — root or action bar never resolved');

    // Prefer the engine's recorded decision over inferring from the DOM.
    const decision = window.__qcrmLastDecision || null;
    const scope = decision
      ? `${decision.rootVia} | score=${decision.score} | candidates=${decision.candidateCount}`
      : btn
        ? rootish
          ? 'inside <main>'
          : 'via fallback (outside <main>)'
        : 'n/a';
    add('root scope', !!btn, scope);
    if (decision) add('layout engine signals', true, decision.signals);

    const inSticky = btn ? !!btn.closest(STICKY_SEL) : false;
    // Sticky is a LEGITIMATE target when no static card exists (requirement 4b),
    // so it is only a failure when a static card was available and lost the vote.
    const stickyIsFallback = !!(decision && decision.usedStickyFallback);
    add('sticky header ignored', !!btn && (!inSticky || stickyIsFallback),
      !inSticky
        ? 'button is in the static card'
        : stickyIsFallback
          ? 'sticky used as intentional fallback — no static card on this page'
          : 'BUTTON IS IN THE STICKY BAR while a static card existed — wrong target');

    // ── Gate 4: action bar is the real CTA row (holds Connect/Message) ──
    const barLabels = bar
      ? Array.from(bar.querySelectorAll('button, a'))
          .map(
            (e) =>
              (e.innerText || e.textContent || '').trim().split('\n')[0] ||
              (e.getAttribute('aria-label') || '').trim(),
          )
          .filter(Boolean)
      : [];
    // Matches the engine's CTA vocabulary, so Website-only / Hiring / Creator
    // layouts are recognised as valid action bars instead of reported as FAIL.
    const hasRealCta = barLabels.some((l) =>
      /connect|message|follow|following|pending|more|website|services|recruiters|newsletter|note|sales navigator|subscribe|appointment|portfolio|contact/i.test(
        l,
      ),
    );
    add('action bar found', !!bar && hasRealCta, barLabels.join(' | ') || 'no sibling CTAs');

    // ── Gate 5: placement ──
    const rect = btn ? btn.getBoundingClientRect() : null;
    const visible = !!rect && rect.width > 0 && rect.height > 0;
    const notInAside = btn ? !btn.closest('aside') : false;
    add('verifyPlacement (visible box)', visible, rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'no box');
    add('not in right-rail recommendations', notInAside, notInAside ? '' : 'button drifted into <aside>');

    // ── Gate 6-7: injected, exactly once ──
    add('button injected', !!btn);
    add('exactly one button', all().length === 1, 'count=' + all().length);

    // ── Gate 8: scrolling ──
    const before = all().length;
    const y0 = window.scrollY;
    window.scrollTo(0, 1200);
    await sleep(1500);
    window.scrollTo(0, 2400);
    await sleep(1500);
    window.scrollTo(0, y0);
    await sleep(1200);
    const after = all().length;
    const stickyAfter = one() ? !!one().closest(STICKY_SEL) : false;
    add('scroll: not removed', !!one(), 'count after scroll=' + after);
    add('scroll: not duplicated', after === before && after <= 1, `before=${before} after=${after}`);
    add('scroll: still outside sticky bar', !stickyAfter);

    // ── Gate 9: SPA navigation ──
    // Leave the profile and come back through the client router, which is what
    // breaks naive injectors: the observer must re-fire on the new subtree.
    let spaOk = 'skipped';
    try {
      const origin = location.pathname;
      history.pushState({}, '', '/feed/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(1200);
      history.pushState({}, '', origin);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(2500);
      const c = all().length;
      spaOk = c === 1 ? 'PASS' : 'FAIL';
      add('SPA navigation: exactly one button after round trip', c === 1, 'count=' + c);
    } catch (e) {
      add('SPA navigation', false, 'threw: ' + e.message);
    }

    // Layout context, so a "no Connect" profile is not misread as a failure.
    const pageCtas = Array.from(document.querySelectorAll('main button, main a[href]'))
      .map((e) => (e.innerText || e.textContent || '').trim().split('\n')[0])
      .filter((t) => /^(connect|message|follow|following|pending)$/i.test(t));
    console.log('[QCRM] layout context — primary CTAs on page: ' +
      (pageCtas.length ? pageCtas.join(', ') : 'none (already-connected / own profile / website-only)'));

    console.table(rows);
    const failed = rows.filter((r) => r.result === 'FAIL');
    if (!failed.length) {
      console.log('%c[QCRM] ALL GATES PASS on ' + location.pathname, 'color:green;font-weight:bold');
    } else {
      console.log('%c[QCRM] ' + failed.length + ' GATE(S) FAILED on ' + location.pathname,
        'color:red;font-weight:bold');
      failed.forEach((f) => console.log('   ✗ ' + f.gate + ' — ' + f.detail));
      console.log('Run __qcrmDumpButtons() next to dump the live DOM.');
    }
    return { profile: location.pathname, scope, pass: !failed.length, rows, spa: spaOk };
  };

  console.log('[QCRM] verify-live.js ready — run: await __qcrmVerify()');
})();
