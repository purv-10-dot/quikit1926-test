// shouldDeliver's alert gating, with Prisma mocked so it runs in the default
// suite. (notifications.service.test.ts is DB-backed and excluded from Vitest —
// see vitest.config.ts — so the matrix can't live there.)
//
// The property that matters: `desktop` and `sound` are INDEPENDENT user
// toggles that share every upstream suppression. Mute / snooze / DND / a
// below-level reaction must silence both; only the final branch reads the two
// settings separately.
import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted) — the helper
// owns the vi.mock calls, so nothing in this file touches `vi` directly.
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";

import { shouldDeliver } from "./notifications.service";

const ORG = "org-1";
const USER = "u1";
const CHANNEL = "c1";

type Settings = {
  defaultChannelLevel: string;
  dmsLevel: string;
  soundEnabled: boolean;
  callSoundsEnabled: boolean;
  desktopEnabled: boolean;
  emailEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string | null;
  dndEnd: string | null;
  snoozedUntil: Date | null;
  priorityDuringDnd: boolean;
};

/** Defaults = a "sane Slack" install: both alert toggles on, no DND/snooze. */
function settings(over: Partial<Settings> = {}): Settings {
  return {
    defaultChannelLevel: "all",
    dmsLevel: "all",
    soundEnabled: true,
    // Not read by shouldDeliver (calls don't route through notification
    // delivery) — present so the stub matches the real row shape.
    callSoundsEnabled: true,
    desktopEnabled: true,
    emailEnabled: false,
    dndEnabled: false,
    dndStart: null,
    dndEnd: null,
    snoozedUntil: null,
    priorityDuringDnd: false,
    ...over,
  };
}

/** Stub the two reads shouldDeliver makes: user settings + channel preference. */
function given(over: Partial<Settings> = {}, pref: unknown = null) {
  mockDb.qcUserNotificationSettings.findUnique.mockResolvedValue(settings(over) as never);
  mockDb.qcNotificationPreference.findUnique.mockResolvedValue(pref as never);
}

const deliver = (reason: "mention" | "dm" | "reaction" | "keyword" = "mention", now?: Date) =>
  shouldDeliver(ORG, USER, CHANNEL, "group", reason, now);

beforeEach(() => {
  resetMockDb();
});

describe("shouldDeliver — sound/desktop independence", () => {
  it("both on: alerts on both channels", async () => {
    given();
    expect(await deliver()).toEqual({
      persistRow: true,
      desktop: true,
      sound: true,
      persistAsRead: false,
    });
  });

  // The regression this guards: the old code early-returned on !desktopEnabled,
  // so bolting `sound` onto the final branch alone would have silenced every
  // user who turned desktop popups off.
  it("sound on + desktop off: still audible", async () => {
    given({ desktopEnabled: false });
    expect(await deliver()).toMatchObject({ persistRow: true, desktop: false, sound: true });
  });

  it("desktop on + sound off: popup only", async () => {
    given({ soundEnabled: false });
    expect(await deliver()).toMatchObject({ persistRow: true, desktop: true, sound: false });
  });

  it("both off: row only, no alerts", async () => {
    given({ soundEnabled: false, desktopEnabled: false });
    expect(await deliver()).toMatchObject({ persistRow: true, desktop: false, sound: false });
  });
});

describe("shouldDeliver — suppression silences BOTH channels", () => {
  it("muted channel (level none): persisted pre-read, fully silent", async () => {
    given({ defaultChannelLevel: "none" });
    expect(await deliver()).toEqual({
      persistRow: true,
      desktop: false,
      sound: false,
      persistAsRead: true,
    });
  });

  it("temporary channel mute: fully silent", async () => {
    const future = new Date(Date.now() + 60 * 60_000);
    given({}, { level: "all", mutedUntil: future, orgId: ORG });
    expect(await deliver()).toMatchObject({ desktop: false, sound: false, persistAsRead: true });
  });

  it("global snooze: silent, row stays unread", async () => {
    given({ snoozedUntil: new Date(Date.now() + 60 * 60_000) });
    expect(await deliver()).toEqual({
      persistRow: true,
      desktop: false,
      sound: false,
      persistAsRead: false,
    });
  });

  it("an expired snooze does not suppress", async () => {
    given({ snoozedUntil: new Date(Date.now() - 60 * 60_000) });
    expect(await deliver()).toMatchObject({ desktop: true, sound: true });
  });

  it("DND window: silent", async () => {
    given({ dndEnabled: true, dndStart: "22:00", dndEnd: "07:00" });
    const at2300 = new Date(2026, 6, 27, 23, 0, 0);
    expect(await deliver("mention", at2300)).toMatchObject({
      persistRow: true,
      desktop: false,
      sound: false,
    });
  });

  it("DND with priorityDuringDnd: a mention alerts on both channels", async () => {
    given({ dndEnabled: true, dndStart: "22:00", dndEnd: "07:00", priorityDuringDnd: true });
    const at2300 = new Date(2026, 6, 27, 23, 0, 0);
    expect(await deliver("mention", at2300)).toMatchObject({ desktop: true, sound: true });
  });

  it("DND with priorityDuringDnd still silences a non-priority reason", async () => {
    given({ dndEnabled: true, dndStart: "22:00", dndEnd: "07:00", priorityDuringDnd: true });
    const at2300 = new Date(2026, 6, 27, 23, 0, 0);
    expect(await deliver("reaction", at2300)).toMatchObject({ desktop: false, sound: false });
  });

  it("outside the DND window: alerts normally", async () => {
    given({ dndEnabled: true, dndStart: "22:00", dndEnd: "07:00" });
    const at1200 = new Date(2026, 6, 27, 12, 0, 0);
    expect(await deliver("mention", at1200)).toMatchObject({ desktop: true, sound: true });
  });

  it("reaction below level 'all': no row, no alerts", async () => {
    given({ defaultChannelLevel: "mentions" });
    expect(await deliver("reaction")).toEqual({
      persistRow: false,
      desktop: false,
      sound: false,
      persistAsRead: false,
    });
  });

  // Suppression must win over the user's toggles, not race them.
  it("suppression beats soundEnabled: snoozed + sound on is still silent", async () => {
    given({ soundEnabled: true, desktopEnabled: false, snoozedUntil: new Date(Date.now() + 60_000) });
    expect(await deliver()).toMatchObject({ desktop: false, sound: false });
  });
});
