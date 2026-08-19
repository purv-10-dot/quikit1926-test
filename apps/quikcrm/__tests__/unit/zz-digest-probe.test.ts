/** Throwaway probe: capture EVERY prisma where-clause buildRoleMetrics emits
 *  for the DIGEST's exact call signature: buildRoleMetrics(user, range). */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-unit-mock";
vi.mock("@/lib/auth/account-acl", () => ({ accountScopeFilter: vi.fn(), getScope: vi.fn() }));
vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn(), resolveTeamScope: vi.fn() }));
import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam, resolveTeamScope } from "@/lib/services/dashboard/team";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";

const RANGE = { from: new Date("2026-08-17T00:00:00Z"), to: new Date("2026-08-18T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  const models = ["crmLead","crmAccount","crmContact","crmOpportunity","crmActivity",
    "crmTask","crmQuote","crmCampaign","crmProspect","crmCallLog","crmNote"];
  for (const name of models) {
    const m = (prismaMock as any)[name];
    if (!m) continue;
    m.count?.mockResolvedValue(0);
    m.findMany?.mockResolvedValue([]);
    m.groupBy?.mockResolvedValue([]);
    m.aggregate?.mockResolvedValue({ _sum: { amount: null } });
  }
  (prismaMock as any).$queryRaw?.mockResolvedValue([]);
  (prismaMock as any).$queryRawUnsafe?.mockResolvedValue([]);
  vi.mocked(accountScopeFilter).mockResolvedValue(null as never);
  vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
  vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);
  vi.mocked(resolveTeamScope).mockResolvedValue(null as never);
});

const ROLES = ["Administrator","SalesManager","SalesUser","MarketingUser","FinanceUser","TeamManager"];

describe("DIGEST SIGNATURE PROBE", () => {
  for (const role of ROLES) {
    it(`role=${role}`, async () => {
      await buildRoleMetrics({ userId:"u1", orgId:"t1", role, email:"u@x.co", name:"U" } as never, RANGE);
      const dump: Record<string, unknown[]> = {};
      for (const [model, m] of Object.entries(prismaMock) as [string, any][]) {
        if (!m || typeof m !== "object") continue;
        for (const fn of ["count","aggregate","findMany","groupBy"]) {
          const calls = m[fn]?.mock?.calls;
          if (calls?.length) dump[`${model}.${fn}`] = calls.map((c: any) => c[0]?.where);
        }
      }
      console.log(`\n##ROLE:${role}##` + JSON.stringify(dump, null, 0));
      expect(true).toBe(true);
    });
  }
});
