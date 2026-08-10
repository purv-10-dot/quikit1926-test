/**
 * DM last-seen, end to end, across two real identities.
 *
 * This is the manual two-browser check ("does Pravin see Dhwani's last seen?")
 * made permanent. It exercises the whole chain rather than any one layer:
 *
 *   browser socket → realtime gateway → Redis `presence:lastseen:*`
 *     → GET /api/channels/:id/last-seen → getEffectiveLastSeen() privacy rules
 *     → ConversationHeader's sub-line
 *
 * Presence propagation is event-driven, not polled: a socket disconnect runs
 * `markOffline()` (services/realtime/src/presence.ts), which writes the last-seen
 * key and broadcasts `presence: offline` to every shared-channel room in the same
 * tick. So the waits here are Playwright's auto-retrying assertions with a
 * bounded 15s ceiling — long enough to absorb a slow dev-server compile, short
 * enough that a real regression fails while you're still looking at it. No fixed
 * sleeps.
 *
 * Every step below asserts against the observer's LIVE page — it is opened once
 * and never reloaded. That is deliberate and load-bearing: this spec used to
 * reload the observer to force a re-read, working around a caching bug, and a
 * workaround that no longer exists cannot mask its regression. If a reload ever
 * reappears here, the cache invalidation has broken.
 *
 * What made the reload necessary, now fixed: the `["last-seen", channelId]` query
 * cached for 60s with nothing invalidating it, so in practice it held until the
 * page remounted — indefinitely, since staleness alone never triggers a refetch.
 * It broke privacy (revoke "Share my last seen" and observers holding your
 * timestamp kept showing it) and function (open a DM while the peer is offline
 * with no last-seen recorded, and their readout never appeared when they later
 * disconnected). ChatWorkspace's presence handlers now invalidate that query for
 * the affected DMs, and the query keeps react-query's default `staleTime` of 0.
 *
 * ONE BEHAVIOUR THIS TEST STILL WORKS AROUND RATHER THAN ASSERTS:
 *
 *  (B) `appear_offline` does not mask the DM header. `presence.online` is pure
 *      connectivity, and `ConversationHeader`'s `dmOnline` reads `online.has(peer)`
 *      — so an invisible-but-connected user still reads "Active now" to their
 *      peer. Step 4 is written so it holds under both today's behaviour and a
 *      fixed one, and the assertion that actually exercises the suppression rule
 *      is the offline one at the end.
 *
 * KNOWN RESIDUAL, not covered here because no event exists to hang it on: a peer
 * who is ALREADY offline, revokes sharing, and never reconnects produces no
 * presence event at all, so nothing invalidates. Fanning out privacy changes would
 * close it but would itself signal "this person changed a privacy setting", which
 * is precisely why the privacy-only PUT skips the fan-out. With `staleTime: 0` it
 * degrades to "until the observer's window refocuses or remounts" rather than
 * being indefinite.
 *
 * Hygiene: there is no isolated E2E tenant for QuikChat yet, so this runs against
 * the shared dev seed and MUTATES the subject's QcUserPresence row. `beforeAll`
 * puts both users into a known state and `afterAll` restores them — without that,
 * a mid-run failure would leave them invisible and non-sharing in the workspace
 * people use by hand.
 *
 * The same shared-seed reality bites presence harder, and it cost the first run of
 * this test: presence is per USER, so a browser tab of your own signed in as the
 * subject keeps them online and the offline broadcast never fires (the gateway
 * only emits it when the user's LAST socket closes). `assertSoleSessionOwner`
 * turns that into a one-line explanation instead of a header that won't change.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  assertGatewayHealthy,
  assertSoleSessionOwner,
  closeDb,
  findDmChannelId,
  getMyPresence,
  hasLiveSocket,
  putMyPresence,
  readLastSeen,
  resolveIdentity,
  signInAs,
  type Identity,
  type Who,
} from "../fixtures/auth";

/** The conversation header's presence sub-line — the single thing under test. */
const SUB = ".qc-convo-sub";

/**
 * SUBJECT is the person whose presence changes; OBSERVER watches their header.
 * Defaults to the pair from the manual test. Overridable because presence is
 * per-user: if your own browser is signed in as the subject, the test cannot take
 * them offline (see `assertSoleSessionOwner`) — switch pairs instead, e.g.
 * `E2E_DM_SUBJECT=rishab E2E_DM_OBSERVER=ashwin npm run test:e2e`.
 */
const SUBJECT = (process.env.E2E_DM_SUBJECT as Who) ?? "dhwani";
const OBSERVER = (process.env.E2E_DM_OBSERVER as Who) ?? "pravin";

let subject: Identity;
let observer: Identity;
let dmId: string;
/** Wall-clock of the subject's disconnect, for the freshness check in step 2. */
let disconnectedAt = 0;

/**
 * Per-page tracking of `GET /api/me/presence`, so a toggle can wait for the
 * component to finish seeding itself.
 *
 * Why this is needed: the "Share my last seen" switch is seeded from that GET and
 * renders `true` (its useState default) until the response lands. Click inside
 * that window and the in-flight GET's `setShareLastSeen(server value)` resolves
 * AFTER the optimistic flip and silently reverts it — a real race in the
 * component, wide open in dev where the first request pays a compile. It flaked
 * this test three times before being pinned down.
 *
 * Why QUIESCENCE and not a response count: `next.config.js` sets
 * `reactStrictMode: true`, so in dev React double-invokes each seeding effect and
 * every mount issues TWO GETs. Counting responses can't tell you which was last —
 * waiting for "one more GET" reliably matches a straggler from the previous mount
 * and leaves the real seed free to land after the click. Waiting until the
 * endpoint has been idle for a beat is correct however many times it fires.
 */
interface PresenceProbe {
  gets: number;
  lastGetAt: number;
}

const probes = new WeakMap<Page, PresenceProbe>();

function presenceProbe(page: Page): PresenceProbe {
  const existing = probes.get(page);
  if (existing) return existing;
  const probe: PresenceProbe = { gets: 0, lastGetAt: 0 };
  probes.set(page, probe);
  page.on("response", (r) => {
    if (r.request().method() === "GET" && r.url().includes("/api/me/presence")) {
      probe.gets += 1;
      probe.lastGetAt = Date.now();
    }
  });
  return probe;
}

/**
 * Wait until at least one presence GET has arrived after `after`, and none has
 * arrived for `quietMs` — i.e. the seeding effect has stopped firing.
 */
async function awaitPresenceSeed(page: Page, after: number, quietMs = 750): Promise<void> {
  const probe = presenceProbe(page);
  await expect
    .poll(() => probe.gets > after && Date.now() - probe.lastGetAt >= quietMs, {
      timeout: 20_000,
    })
    .toBe(true);
}

/**
 * Open a specific DM via the `?channel=` deep link the dashboard supports, and let
 * ChatShell's load-time presence seeding settle before handing back control.
 */
async function openDm(page: Page, channelId: string): Promise<void> {
  const before = presenceProbe(page).gets;
  await page.goto(`/dashboard?channel=${channelId}`);
  await expect(page.locator(SUB)).toBeVisible();
  await awaitPresenceSeed(page, before);
}

/** Flip "Share my last seen" in Settings → Privacy and wait for the write. */
async function setShareLastSeen(
  page: Page,
  identity: Identity,
  next: boolean,
): Promise<void> {
  const before = presenceProbe(page).gets;

  // NOTE: this navigation UNMOUNTS ChatWorkspace (ChatShell swaps the whole view),
  // so the user's socket drops here and they read as offline to everyone until
  // they return to the chat view. Real behaviour, not a test artefact.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // Let SettingsModule finish seeding the switch before touching it.
  await awaitPresenceSeed(page, before);
  await page.getByRole("button", { name: "Privacy", exact: true }).click();

  const toggle = page.getByRole("switch", { name: "Share my last seen" });
  await expect(toggle).toHaveAttribute("aria-checked", String(!next));

  const written = page.waitForResponse(
    (r) => r.url().includes("/api/me/presence") && r.request().method() === "PUT" && r.ok(),
  );
  await toggle.click();
  await written;
  await expect(toggle).toHaveAttribute("aria-checked", String(next));

  // Belt and braces: the switch is optimistic, so confirm the server actually
  // holds the new value before any assertion depends on it.
  expect((await getMyPresence(identity)).shareLastSeen).toBe(next);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await assertGatewayHealthy();
  subject = await resolveIdentity(SUBJECT);
  observer = await resolveIdentity(OBSERVER);
  dmId = await findDmChannelId(subject, observer);

  // The subject's sockets must be ours alone, or their "offline" transition never
  // broadcasts and step 2 fails for a reason that looks nothing like the cause.
  await assertSoleSessionOwner(subject);

  // Known starting point: both share last-seen, neither is invisible. Mutual
  // opt-in means the observer's own flag matters as much as the subject's.
  await putMyPresence(subject, { status: "available", shareLastSeen: true });
  await putMyPresence(observer, { shareLastSeen: true });
});

test.afterAll(async () => {
  // Restore the shared dev seed even if the test bailed halfway.
  if (subject) await putMyPresence(subject, { status: "available", shareLastSeen: true });
  if (observer) await putMyPresence(observer, { shareLastSeen: true });
  await closeDb();
});

test("DM last-seen follows presence, the sharing toggle and appear_offline", async ({ browser }) => {
  // Subject online first, confirmed AT THE GATEWAY rather than inferred from the
  // observer's UI, so step 1 is asserting propagation and not a race we set up.
  const first = await signInAs(browser, SUBJECT);
  await openDm(first.page, dmId);
  await expect.poll(() => hasLiveSocket(subject), { timeout: 15_000 }).toBe(true);

  // The observer's page stays open for the whole test, so we're testing a live
  // client reacting to events, not a series of fresh page loads.
  const p = await signInAs(browser, OBSERVER);
  await openDm(p.page, dmId);
  const sub = p.page.locator(SUB);

  await test.step(`1 — both online: ${observer.displayName} sees ${subject.displayName} as active`, async () => {
    // Arrives via the observer's connect-time presence_snapshot.
    await expect(sub).toHaveText("Active now", { timeout: 15_000 });

    // Closing the context is a real socket disconnect: the gateway's `disconnect`
    // handler writes presence:lastseen and broadcasts offline immediately.
    disconnectedAt = Date.now();
    await first.context.close();
  });

  await test.step(`2 — ${subject.displayName} offline: their last seen appears`, async () => {
    // (i) The disconnect recorded a FRESH instant. Asserted at the source, because
    // the header alone cannot tell a fresh value from a cached one — see (ii).
    await expect
      .poll(async () => Date.parse((await readLastSeen(subject)) ?? "") || 0, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(disconnectedAt - 2_000);

    // (ii) The observer's LIVE page renders it, with no reload. The query fires on
    // mount — before the presence snapshot arrives, so it caches a result while
    // `online` is still empty — and the offline event invalidates that cache. This
    // holds on a clean machine, where the mount-time value cached was `null`.
    await expect(sub).toHaveText(/last seen /i, { timeout: 15_000 });
  });

  await test.step(`3 — ${subject.displayName} stops sharing: the readout disappears`, async () => {
    const d = await signInAs(browser, SUBJECT);
    await openDm(d.page, dmId);
    await expect(sub).toHaveText("Active now", { timeout: 15_000 });

    await setShareLastSeen(d.page, subject, false);

    // Back to the chat view, then offline. This is NOT ceremony: entering Settings
    // unmounts ChatWorkspace and drops the subject's socket, so the toggle happens
    // while they are already offline and closing the context would emit nothing.
    // Returning reconnects them (`presence: online`) so that closing produces the
    // `presence: offline` event whose invalidation drives the re-read. A privacy
    // change on its own is never fanned out — by design — so an event from the
    // same user is the signal we have, and it is enough here.
    await openDm(d.page, dmId);
    await expect(sub).toHaveText("Active now", { timeout: 15_000 });
    await d.context.close();

    // Mutual opt-in now fails on the subject's side, so the server returns null and
    // the header falls back to its static label — live, on the observer's original
    // page. "Hidden by privacy" and "never recorded" are deliberately
    // indistinguishable here; that difference is itself a leak.
    await expect(sub).toHaveText("Direct message", { timeout: 15_000 });
  });

  await test.step("4 — appear_offline suppresses last seen even with sharing back ON", async () => {
    const d = await signInAs(browser, SUBJECT);
    await openDm(d.page, dmId);
    await setShareLastSeen(d.page, subject, true);

    // Back to the chat view so their socket reconnects — they must be genuinely
    // online for the next assertion to mean anything.
    await openDm(d.page, dmId);
    await expect(sub).toHaveText("Active now", { timeout: 15_000 });

    await d.page.getByRole("button", { name: "Account menu" }).click();
    const applied = d.page.waitForResponse(
      (r) => r.url().includes("/api/me/presence") && r.request().method() === "PUT" && r.ok(),
    );
    await d.page.getByRole("menuitem", { name: /Appear offline/ }).click();
    await applied;

    // Invisible but connected. Today this reads "Active now" (note (B) above);
    // if `online` is ever masked by appear_offline it becomes "Direct message".
    // Either is fine — what must never appear is a last-seen readout.
    await expect(sub).toHaveText(/^(Active now|Direct message)$/);

    // The assertion that actually exercises the rule: they are now genuinely
    // offline, sharing is ON on both sides, and Redis holds a fresh last-seen
    // value from this very disconnect — so the ONLY thing that can suppress the
    // readout is their appear_offline status.
    await d.context.close();

    // Prove there IS something to suppress. Without this, "Direct message" could
    // equally mean "never recorded", and the step would pass even if the
    // appear_offline rule had been deleted outright.
    await expect
      .poll(async () => (await readLastSeen(subject)) !== null, { timeout: 15_000 })
      .toBe(true);
    expect((await getMyPresence(subject)).shareLastSeen).toBe(true);

    await expect(sub).toHaveText("Direct message", { timeout: 15_000 });
  });

  await p.context.close();
});
