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
vi.mock("@/lib/services/notifications/digest-recipients", () => ({
  resolveDigestRecipients: vi.fn(),
  listActiveDigestOrgs: vi.fn(),
}));

import { getDigestConfig } from "@/lib/services/workspace/digest-config";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";
import { resolveDigestRecipients, listActiveDigestOrgs } from "@/lib/services/notifications/digest-recipients";
import { runDailyDigest } from "@/lib/services/notifications/digest-run";

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
    await runDailyDigest();
    expect(buildRoleMetrics).toHaveBeenCalledWith(ADMIN);
    expect(buildRoleMetrics).toHaveBeenCalledWith(MGR);
  });

  it("calls the services AS-IS — NO window/range arg (that is (i), deferred)", async () => {
    await runDailyDigest();
    // buildRoleMetrics must be called with EXACTLY one arg (the user) — no range.
    for (const call of vi.mocked(buildRoleMetrics).mock.calls) {
      expect(call).toHaveLength(1);
    }
    // getActivityFieldAggregates: (user, { activityTypeId }) — opts must NOT carry a range key.
    for (const call of vi.mocked(getActivityFieldAggregates).mock.calls) {
      const opts = call[1] as Record<string, unknown>;
      expect(opts).not.toHaveProperty("range");
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

  it("bakes an UNMISSABLE all-time DEMO banner into each assembled digest", async () => {
    const res = await runDailyDigest();
    for (const d of res.digests) {
      expect(d.demoBanner).toMatch(/DEMO/);
      expect(d.demoBanner).toMatch(/all-time/i);
      expect(d.demoBanner).toMatch(/structure/i); // "review STRUCTURE not numbers"
      expect(d.isDemo).toBe(true);
    }
  });

  it("selects top-N types PER ORG (once), not per recipient", async () => {
    await runDailyDigest();
    // top-N type ranking runs once for org1, not once per recipient (2 recipients)
    expect(prismaMock.crmActivity.groupBy).toHaveBeenCalledTimes(1);
  });
});
