/**
 * Phase 5 — digest render-loop skeleton (step-1 plumbing, RED→GREEN).
 *
 * The per-recipient render loop:
 *   enabled orgs → per org, top-N types (per-org, hoisted above recipient loop)
 *   → leadership recipients (minus optOut) → per recipient, construct SessionUser
 *   → call buildRoleMetrics(user) + getActivityFieldAggregates(user,{type}) AS-IS
 *   → assemble that recipient's scoped sections.
 *
 * CRITICAL CONSTRAINTS THIS TEST PINS:
 *   - The loop calls buildRoleMetrics / getActivityFieldAggregates with the
 *     SESSION USER it constructs (the per-recipient leak-safe scoping reuse) —
 *     and calls them AS-IS (no window arg; that's (i), deferred). A "window
 *     passed" here would mean a shared-function edit leaked into this unit.
 *   - DISABLED orgs are skipped (opt-in).
 *   - optOut recipients are skipped.
 *   - The assembled artifact carries an UNMISSABLE demo banner flagging
 *     all-time-not-yesterday (the demo goes to Dev; numbers must not be mistaken
 *     for the daily digest).
 *
 * Both services + config + recipient enumeration are mocked — this unit proves
 * the LOOP STRUCTURE, not the (already-verified) services. runDailyDigest does
 * not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/services/workspace/digest-config", () => ({ getDigestConfig: vi.fn() }));
vi.mock("@/lib/services/dashboard/role-metrics", () => ({ buildRoleMetrics: vi.fn() }));
vi.mock("@/lib/services/dashboard/activity-field-aggregates", () => ({ getActivityFieldAggregates: vi.fn() }));
vi.mock("@/lib/services/dashboard/completed-tasks", () => ({ getCompletedTasksByRep: vi.fn() }));
// REDESIGN: per-user detail assembly is a separate, DB-touching service — mocked
// here so this unit proves the LOOP STRUCTURE, not the detail queries (those have
// their own test in digest-detail.test.ts).
vi.mock("@/lib/services/notifications/digest-detail", () => ({
  assembleUserActivityDetail: vi.fn(),
  MAX_ROWS_PER_SECTION: 50,
}));
vi.mock("@/lib/services/notifications/digest-recipients", () => ({
  resolveDigestRecipients: vi.fn(),
  listActiveDigestOrgs: vi.fn(),
}));
vi.mock("@/lib/services/notifications/digest-email", () => ({ sendDigestEmail: vi.fn() }));
// Window helper mocked to FIXED bounds — the rolling-window math is the helper's
// own test (digest-window.test.ts). Here we only assert the range is WIRED into the
// calls. rollingWindowUtc returns distinct fixed bounds per `days` so the daily
// (1) and weekly (7) ranges are distinguishable in assertions.
const FIXED_RANGE = { from: new Date("2026-06-24T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") }; // days=1
const FIXED_RANGE_7D = { from: new Date("2026-06-18T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") }; // days=7
vi.mock("@/lib/services/notifications/digest-window", () => ({
  rolling24hRangeUtc: vi.fn(() => ({ from: new Date("2026-06-24T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") })),
  rollingWindowUtc: vi.fn((_now: Date, days: number) =>
    days === 7
      ? { from: new Date("2026-06-18T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") }
      : { from: new Date("2026-06-24T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") },
  ),
}));

import { getDigestConfig } from "@/lib/services/workspace/digest-config";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";
import { getCompletedTasksByRep } from "@/lib/services/dashboard/completed-tasks";
import { assembleUserActivityDetail } from "@/lib/services/notifications/digest-detail";
import { resolveDigestRecipients, listActiveDigestOrgs } from "@/lib/services/notifications/digest-recipients";
import { sendDigestEmail } from "@/lib/services/notifications/digest-email";
import { runDailyDigest, runWeeklyDigest } from "@/lib/services/notifications/digest-run";

const ADMIN = { userId: "admin1", orgId: "org1", role: "Administrator", email: "a@x.co", name: "Admin" };
const MGR = { userId: "mgr1", orgId: "org1", role: "SalesManager", email: "m@x.co", name: "Mgr" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDigestConfig).mockResolvedValue({
    enabled: true, frequency: "daily", recipientRoles: ["Administrator", "SalesManager"], optOut: [],
  } as never);
  vi.mocked(listActiveDigestOrgs).mockResolvedValue(["org1"] as never);
  vi.mocked(resolveDigestRecipients).mockResolvedValue([ADMIN, MGR] as never);
  vi.mocked(buildRoleMetrics).mockResolvedValue({
    role: "Administrator",
    metrics: { activitiesByType: [{ type: "Call", count: 5 }] },
  } as never);
  vi.mocked(getActivityFieldAggregates).mockResolvedValue([] as never);
  vi.mocked(getCompletedTasksByRep).mockResolvedValue({ perRep: [], total: 0 } as never);
  vi.mocked(assembleUserActivityDetail).mockResolvedValue([] as never);
  vi.mocked(sendDigestEmail).mockResolvedValue(undefined as never);
  // per-org top-N type selection (a small windowed groupBy seam) — stub it
  (prismaMock.crmActivity.groupBy as unknown as { mockResolvedValue: (v: unknown) => void })
    .mockResolvedValue([{ type: "Call", _count: { _all: 5 } }]);
});

describe("runDailyDigest — render-loop skeleton (Phase 5 plumbing)", () => {
  it("builds one digest per recipient in each enabled org", async () => {
    const res = await runDailyDigest();
    // 1 org × 2 recipients
    expect(res.digests).toHaveLength(2);
    expect(res.digests.map((d) => d.recipient.email).sort()).toEqual(["a@x.co", "m@x.co"]);
  });

  it("calls the metrics services with the PER-RECIPIENT session user (leak-safe scope reuse)", async () => {
    // Leak-safety guard: each recipient's OWN SessionUser is the 1st arg. Post
    // go-live the call is (user, range) — assert the user precisely, range is any
    // (the windowed range is asserted in the GO-LIVE block).
    await runDailyDigest();
    expect(buildRoleMetrics).toHaveBeenCalledWith(ADMIN, expect.anything());
    expect(buildRoleMetrics).toHaveBeenCalledWith(MGR, expect.anything());
  });

  it("GO-LIVE contract: services are called WITH the window range (no longer all-time)", async () => {
    // Rewritten from the pre-go-live "NO range arg" test — go-live deliberately
    // flipped the contract: the metrics services now receive the yesterday-IST range.
    await runDailyDigest();
    for (const call of vi.mocked(buildRoleMetrics).mock.calls) {
      expect(call[1]).toEqual(FIXED_RANGE); // range present, not undefined
    }
    for (const call of vi.mocked(getActivityFieldAggregates).mock.calls) {
      const opts = call[1] as Record<string, unknown>;
      expect(opts).toHaveProperty("range", FIXED_RANGE);
    }
  });

  it("skips DISABLED orgs (opt-in)", async () => {
    vi.mocked(getDigestConfig).mockResolvedValue({
      enabled: false, frequency: "daily", recipientRoles: ["Administrator"], optOut: [],
    } as never);
    const res = await runDailyDigest();
    expect(res.digests).toHaveLength(0);
    expect(buildRoleMetrics).not.toHaveBeenCalled();
  });

  it("skips recipients in the optOut list", async () => {
    vi.mocked(getDigestConfig).mockResolvedValue({
      enabled: true, frequency: "daily", recipientRoles: ["Administrator", "SalesManager"], optOut: ["mgr1"],
    } as never);
    const res = await runDailyDigest();
    expect(res.digests.map((d) => d.recipient.userId)).toEqual(["admin1"]);
  });

  it("GO-LIVE: each assembled digest is isDemo:false (banner OFF — data is yesterday-real)", async () => {
    // Rewritten from the pre-go-live "all-time DEMO banner baked" test — go-live
    // flipped isDemo to false so renderDemoBanner gates the banner off.
    const res = await runDailyDigest();
    for (const d of res.digests) {
      expect(d.isDemo).toBe(false);
    }
  });

  it("selects top-N types PER ORG (once), not per recipient", async () => {
    await runDailyDigest();
    // top-N type ranking runs once for org1, not once per recipient (2 recipients)
    expect(prismaMock.crmActivity.groupBy).toHaveBeenCalledTimes(1);
  });
});

describe("runDailyDigest — SMTP send wiring (Phase 5 send-wiring stage)", () => {
  it("calls sendDigestEmail once per assembled digest, with that recipient's digest", async () => {
    await runDailyDigest();
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);
    // each call gets an AssembledDigest whose recipient is the resolved SessionUser
    const recipients = vi.mocked(sendDigestEmail).mock.calls.map((c) => (c[0] as { recipient: { userId: string } }).recipient.userId);
    expect(recipients.sort()).toEqual(["admin1", "mgr1"]);
  });

  it("send is NOT gated on isDemo: fires for every recipient (now isDemo:false post-go-live)", async () => {
    // Rewritten from the pre-go-live "DEMO-SEND isDemo:true" test. The guard it
    // protects — send fires regardless of demo-state — still holds; the premise
    // flipped to isDemo:false at go-live.
    const res = await runDailyDigest();
    expect(res.isDemo).toBe(false);
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);
  });

  it("returns separate counts: digestCount(resolved) vs sentCount vs errorCount — all-success", async () => {
    const res = await runDailyDigest();
    expect(res.digests).toHaveLength(2); // resolved
    expect(res.sentCount).toBe(2);
    expect(res.errorCount).toBe(0);
  });

  it("PARTIAL SUCCESS: one recipient's send throws → others still sent; counts reflect it, digestCount unchanged", async () => {
    // Sanyukta/MGR send throws; Admin send succeeds.
    vi.mocked(sendDigestEmail).mockImplementation(async (assembled: { recipient: { userId: string } }) => {
      if (assembled.recipient.userId === "mgr1") throw new Error("SMTP rejected");
    });

    const res = await runDailyDigest();

    // BOTH were attempted (one failure did NOT abort the loop)
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);
    // resolved count is UNCHANGED — a send failure is visible as errorCount, not a dropped digestCount
    expect(res.digests).toHaveLength(2);
    expect(res.sentCount).toBe(1); // admin1 succeeded
    expect(res.errorCount).toBe(1); // mgr1 failed
    // the other recipient (admin1) still received
    const attempted = vi.mocked(sendDigestEmail).mock.calls.map((c) => (c[0] as { recipient: { userId: string } }).recipient.userId);
    expect(attempted).toContain("admin1");
  });
});

describe("runDailyDigest — GO-LIVE: yesterday-IST window wired + DEMO banner OFF (atomic)", () => {
  it("buildRoleMetrics is called WITH the yesterday-IST range (not undefined/all-time)", async () => {
    await runDailyDigest();
    for (const call of vi.mocked(buildRoleMetrics).mock.calls) {
      expect(call[1]).toEqual(FIXED_RANGE); // 2nd arg = the windowed range
    }
  });

  it("getActivityFieldAggregates is called WITH { activityTypeId, range }", async () => {
    await runDailyDigest();
    expect(vi.mocked(getActivityFieldAggregates).mock.calls.length).toBeGreaterThan(0);
    for (const call of vi.mocked(getActivityFieldAggregates).mock.calls) {
      const opts = call[1] as { activityTypeId: string; range?: { from: Date; to: Date } };
      expect(opts.range).toEqual(FIXED_RANGE);
      expect(opts.activityTypeId).toBeTruthy();
    }
  });

  it("§4: getCompletedTasksByRep is called per recipient WITH the SAME rolling range", async () => {
    await runDailyDigest();
    const calls = vi.mocked(getCompletedTasksByRep).mock.calls;
    expect(calls.length).toBe(2); // one per recipient
    for (const call of calls) {
      const opts = call[1] as { range?: { from: Date; to: Date } };
      expect(opts.range).toEqual(FIXED_RANGE); // reuses the digest-run range, not recomputed
    }
    // called with the per-recipient SessionUser (same scoping path as the activity metrics)
    expect(getCompletedTasksByRep).toHaveBeenCalledWith(ADMIN, { range: FIXED_RANGE });
    expect(getCompletedTasksByRep).toHaveBeenCalledWith(MGR, { range: FIXED_RANGE });
  });

  it("REDESIGN: assembleUserActivityDetail is called per recipient WITH the rolling range", async () => {
    await runDailyDigest();
    const calls = vi.mocked(assembleUserActivityDetail).mock.calls;
    expect(calls.length).toBe(2); // one per recipient
    for (const call of calls) {
      expect(call[1]).toEqual(FIXED_RANGE); // 2nd arg = the windowed range
    }
    expect(assembleUserActivityDetail).toHaveBeenCalledWith(ADMIN, FIXED_RANGE);
    expect(assembleUserActivityDetail).toHaveBeenCalledWith(MGR, FIXED_RANGE);
  });

  it("REDESIGN: userDetails from the assembler are carried onto each digest", async () => {
    const sample = [
      {
        userId: "r1", userName: "Rep One",
        calls: [], callsTotal: 3, emails: [], emailsTotal: 0,
        meetings: [], meetingsTotal: 0, tasks: [], tasksTotal: 1,
      },
    ];
    vi.mocked(assembleUserActivityDetail).mockResolvedValue(sample as never);
    const res = await runDailyDigest();
    for (const d of res.digests) {
      expect(d.userDetails).toEqual(sample);
    }
  });

  it("ATOMIC: isDemo is FALSE in the result AND on every assembled digest", async () => {
    const res = await runDailyDigest();
    expect(res.isDemo).toBe(false);
    for (const d of res.digests) {
      expect(d.isDemo).toBe(false);
    }
  });

  it("daily digests carry variant 'daily'", async () => {
    const res = await runDailyDigest();
    for (const d of res.digests) {
      expect((d as { variant?: string }).variant).toBe("daily");
    }
  });
});

describe("runWeeklyDigest — 7-day rolling window, weekly variant, same recipients", () => {
  it("calls the metrics services with the 7-DAY range (not the 24h one)", async () => {
    await runWeeklyDigest();
    for (const call of vi.mocked(buildRoleMetrics).mock.calls) {
      expect(call[1]).toEqual(FIXED_RANGE_7D);
    }
    for (const call of vi.mocked(getCompletedTasksByRep).mock.calls) {
      expect((call[1] as { range?: unknown }).range).toEqual(FIXED_RANGE_7D);
    }
  });

  it("assembled digests carry variant 'weekly' (distinguishes the email) + isDemo:false", async () => {
    const res = await runWeeklyDigest();
    expect(res.isDemo).toBe(false);
    for (const d of res.digests) {
      expect((d as { variant?: string }).variant).toBe("weekly");
      expect(d.isDemo).toBe(false);
    }
  });

  it("uses the SAME recipientUserIds as the daily (reuses the recipient config)", async () => {
    await runWeeklyDigest();
    // resolveDigestRecipients is called with the org's cfg.recipientUserIds — same
    // path as the daily; no separate weekly list.
    expect(resolveDigestRecipients).toHaveBeenCalled();
    expect(vi.mocked(resolveDigestRecipients).mock.calls.length).toBeGreaterThan(0);
  });

  it("reuses the shared assembly: one digest per recipient per enabled org (same loop as daily)", async () => {
    const res = await runWeeklyDigest();
    expect(res.digests.map((d) => d.recipient.email).sort()).toEqual(["a@x.co", "m@x.co"]);
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);
  });
});
