/**
 * Scroll-back pagination + scroll-to-unread-divider, in a real browser.
 *
 * WHY THIS EXISTS RATHER THAN MORE JSDOM TESTS. The unit tests in
 * `components/chat/MessageList.test.tsx` and `lib/use-older-messages.test.ts`
 * cover cursor advancement, end-of-history, the concurrency guard and the
 * divider surviving a prepend. They cannot cover the two behaviours that decide
 * whether this feature is usable, because jsdom has no layout engine:
 *
 *   1. SCROLL ANCHORING. `scrollHeight` / `clientHeight` / `scrollTop` are all 0
 *      in jsdom unless a test stubs them, so asserting the anchoring arithmetic
 *      there means checking a formula against its own fixture. Whether the
 *      viewport actually stays on the message the reader was looking at is only
 *      observable where boxes have real geometry.
 *   2. THE UNREAD LINE BEING ON SCREEN. `scrollIntoView` is a no-op stub in
 *      jsdom; the unit test can prove it was CALLED on the right element, not
 *      that anything moved.
 *
 * Both are asserted here against real bounding boxes.
 *
 * Hygiene, same posture as last-seen.spec.ts: there is no isolated E2E tenant
 * for QuikChat, so this seeds into the shared dev workspace and removes exactly
 * its own rows in `afterAll`, including on a mid-run failure.
 */

import { expect, test } from "@playwright/test";
import {
  closeDb,
  findDmChannelId,
  getLastReadAt,
  purgeSeededHistory,
  resolveIdentity,
  seedChannelHistory,
  setLastReadAt,
  signInAs,
  type Identity,
} from "../fixtures/auth";

const READER = "pravin";
const SENDER = "dhwani";

/** Tag for this spec's rows so cleanup can be exact. */
const MARKER = "[e2e-scrollback]";

/** Must match MESSAGES_PAGE_SIZE in lib/api.ts. */
const PAGE_SIZE = 30;

/** 3+ pages at the app's 30-per-page, so paging happens more than once. */
const SEEDED = 95;

const LIST = '[data-testid="message-list"]';

/**
 * Where to park the scroller to request older history. NON-ZERO on purpose, and
 * this is the single most important line in the file.
 *
 * `NEAR_TOP_PX` in MessageList is 200, so 120 is comfortably inside the paging
 * trigger while being clearly away from 0. Driving to exactly 0 — which this
 * test originally did — hides a real bug: browsers SUPPRESS native CSS scroll
 * anchoring at scrollTop 0, so at 0 the app's manual anchoring correction is
 * the only one applied and the test passes. Anywhere else, Chrome applies its
 * own correction too, both fire, the prepend is counted twice and the reader is
 * clamped to the bottom of the conversation. Every real scroll-up lands at a
 * non-zero offset, so the passing test was describing a position no user is
 * ever in. Do not "simplify" this back to 0.
 */
const NEAR_TOP_PROBE = 120;

let reader: Identity;
let sender: Identity;
let dmId: string;
let seededIds: string[] = [];
/** The reader's real unread watermark, restored in afterAll. */
let originalLastReadAt: Date | null | undefined;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  reader = await resolveIdentity(READER);
  sender = await resolveIdentity(SENDER);
  dmId = await findDmChannelId(reader, sender);

  originalLastReadAt = await getLastReadAt(dmId, reader);
  expect(
    originalLastReadAt,
    `${reader.displayName} has no membership row in ${dmId}`,
  ).not.toBeUndefined();

  await purgeSeededHistory(MARKER); // in case a previous run died mid-test
  seededIds = await seedChannelHistory(dmId, reader.orgId, sender.userId, SEEDED, MARKER);
  expect(seededIds).toHaveLength(SEEDED);
});

test.afterAll(async () => {
  // Restore the shared dev workspace even if the run bailed halfway: leaving a
  // rewound watermark would show this person a permanent phantom unread badge.
  if (originalLastReadAt !== undefined) {
    await setLastReadAt(dmId, reader, originalLastReadAt);
  }
  await purgeSeededHistory(MARKER);
  await closeDb();
});

test("scroll-up loads older pages without moving the message being read", async ({ browser }) => {
  const { page, context } = await signInAs(browser, READER);
  await page.goto(`/dashboard?channel=${dmId}`);

  const list = page.locator(LIST);
  // Generous: `webServer` runs `next dev`, so the FIRST navigation of a run pays
  // a route compile that comfortably exceeds the 10s default expect timeout.
  await expect(list).toBeVisible({ timeout: 60_000 });

  // Only the newest page is loaded on open — that is the bug being fixed.
  await expect
    .poll(async () => list.locator("[data-message-id]").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
  const initialCount = await list.locator("[data-message-id]").count();
  expect(initialCount).toBeLessThan(SEEDED);

  await test.step("1 — scrolling to the top loads an older page", async () => {
    await list.evaluate((el, top) => {
      el.scrollTop = top;
    }, NEAR_TOP_PROBE);
    await expect
      .poll(async () => list.locator("[data-message-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(initialCount);
  });

  await test.step("2 — the message being read does not move (scroll anchoring)", async () => {
    const countBefore = await list.locator("[data-message-id]").count();

    // Scroll to the top AND record the anchor's screen position in ONE
    // evaluate. Doing these as two steps measured the row before the scroll and
    // then after both the scroll and the prepend, so the assertion swallowed the
    // test's own scrolling — it failed by exactly the scrollTop being zeroed.
    // Synchronous in one task, so no network response can land in between.
    const { anchorId, top: before } = await list.evaluate((el, probe) => {
      el.scrollTop = probe;
      // The FIRST row is flush against the top edge and can be clipped by the
      // scroller; take a row that is unambiguously inside the viewport so its
      // rect is a fair before/after comparison.
      const rows = el.querySelectorAll("[data-message-id]");
      const anchor = (rows[2] ?? rows[0]) as HTMLElement;
      return {
        anchorId: anchor.getAttribute("data-message-id"),
        top: anchor.getBoundingClientRect().top,
      };
    }, NEAR_TOP_PROBE);

    await expect
      .poll(async () => list.locator("[data-message-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(countBefore);

    // THE ASSERTION THIS WHOLE FILE EXISTS FOR: a page of older messages was
    // inserted ABOVE this row, and it still occupies the same screen position.
    // Without anchoring the list jumps by the height of the inserted page.
    const after = await list.evaluate(
      (el, id) =>
        (el.querySelector(`[data-message-id="${id}"]`) as HTMLElement).getBoundingClientRect().top,
      anchorId,
    );
    expect(Math.abs(after - before)).toBeLessThan(5);
  });

  await test.step("3 — paging stops at the start of history", async () => {
    // Drive to the top until a scroll no longer yields more rows. Waiting on
    // GROWTH rather than on a fixed delay matters: a 400ms sleep per iteration
    // raced the round trip and read "no growth" as "end of history" while pages
    // were still arriving.
    const rows = () => list.locator("[data-message-id]").count();
    for (let i = 0; i < 20; i += 1) {
      const before = await rows();
      await list.evaluate((el, top) => {
        el.scrollTop = top;
      }, NEAR_TOP_PROBE);
      try {
        await expect.poll(rows, { timeout: 8_000 }).toBeGreaterThan(before);
      } catch {
        break; // no more history — this is the end-of-history path itself
      }
    }

    const total = await rows();
    expect(total).toBeGreaterThanOrEqual(SEEDED);

    // Every seeded id is reachable — including the two sharing a timestamp,
    // which the old createdAt-only cursor could skip.
    const rendered = await list.locator("[data-message-id]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-message-id")),
    );
    for (const id of seededIds) expect(rendered).toContain(id);

    // Settled: no request is left in flight at the top of history.
    await list.evaluate((el, top) => {
      el.scrollTop = top;
    }, NEAR_TOP_PROBE);
    await page.waitForTimeout(1_000);
    await expect(page.locator('[data-testid="loading-older"]')).toHaveCount(0);
  });

  await context.close();
});

/**
 * This test previously failed, and what it caught was worth the round: the list
 * settled pinned to the bottom with the unread line 1615px above the viewport
 * (`rows: 60, scrollTop: 3945, maxScroll: 3945, divider: -1615`).
 *
 * Cause was double scroll-anchoring — Chrome's native `overflow-anchor` already
 * compensated the prepend (scrollTop 154 → 2361) and MessageList's manual
 * correction then added the same 2240 again, clamping to the bottom. Fixed by
 * `overflow-anchor: none` on `.qc-msg-scroll`; see the comment there.
 *
 * The jsdom test in MessageList.test.tsx cannot stand in for this one:
 * `scrollIntoView` is a no-op stub there, so it proves the call happens and
 * nothing about where anything ends up.
 */
test("opening a conversation with unread messages lands on the unread divider", async ({
  browser,
}) => {
  // Wind the reader's watermark back behind every seeded message so the whole
  // block reads as unread. Without this the test depends on whatever unread
  // state the shared dev workspace happens to be in, and skips more often than
  // it runs — which verifies nothing. Restored in afterAll.
  await setLastReadAt(dmId, reader, new Date(Date.UTC(2025, 11, 31)));

  const { page, context } = await signInAs(browser, READER);

  // Opened by CLICKING the conversation, not via `?channel=`. That is not
  // incidental: the deep-link path captures the unread count before the
  // ["channels"] query has resolved, so it always reads 0 and no divider is
  // ever produced — a pre-existing bug, reported separately, unrelated to the
  // scroll behaviour under test here. Clicking is also the path users take.
  await page.goto("/dashboard");
  const sidebar = page.getByRole("navigation", { name: "Conversations" });
  await expect(sidebar).toBeVisible({ timeout: 60_000 });
  await sidebar
    .getByRole("button", { name: new RegExp(sender.displayName) })
    .first()
    .click();

  const divider = page.locator('[data-testid="unread-divider"]');
  const list = page.locator(LIST);
  await expect(list).toBeVisible({ timeout: 60_000 });

  // The divider must exist AND be on screen. Existing but off-screen above a
  // large unread block is precisely the shipped bug this closes — so
  // `toBeInViewport` is the assertion that matters, not `toBeVisible`.
  await expect(divider).toHaveCount(1, { timeout: 15_000 });
  await expect(divider).toBeInViewport({ timeout: 15_000 });

  // The opening scroll must not have paged in history by itself. The divider
  // lands ~154px from the top, inside NEAR_TOP_PX, so without the settle gate
  // in MessageList the app fetches an older page the instant it positions the
  // view — 60 rows on open instead of one page.
  await page.waitForTimeout(1_500);
  const rowsOnOpen = await page.locator(`${LIST} [data-message-id]`).count();
  expect(rowsOnOpen).toBeLessThanOrEqual(PAGE_SIZE);
  // And it stays put — nothing yanks the reader to the bottom afterwards.
  await expect(divider).toBeInViewport();

  await context.close();
});
