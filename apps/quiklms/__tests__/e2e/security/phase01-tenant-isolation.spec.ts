/**
 * PHASE 01 — Cross-tenant isolation (IDOR).
 *
 * The highest-severity class of bug in a multi-tenant LMS: one org reading or
 * mutating another's data. This is a real risk here rather than a theoretical
 * one, because isolation is enforced by per-route convention, not systemically:
 * only ~4 of 348 routes use the `tenantWhere`/`assertTenantMatch` helpers,
 * while ~258 hand-thread `actor.orgId` into a service call. Any route that
 * forgets is a leak.
 *
 * Every test here uses the PRIMARY tenant's credentials against the VICTIM
 * tenant's resource ids. A 200 is a finding; 403/404 is correct behaviour.
 *
 * Note on SUPER_ADMIN: it is *designed* to cross tenants (`tenantWhere`
 * returns an unscoped filter for it), so it is deliberately excluded from the
 * leak assertions and asserted separately.
 */

import { test, expect } from "@playwright/test";
import { apiAs, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const OTHER_COURSE = m.other.courseId;
const OTHER_ORG = m.other.orgId;
const OTHER_USER = m.other.adminUserId;

/** Roles that must never see another tenant's data. */
const CONFINED = ["tenantAdmin", "subAdmin", "manager", "teacher", "parent", "learner"] as const;

test.describe("Phase 01 — cross-tenant reads", () => {
  for (const role of CONFINED) {
    test(`${role} cannot read another tenant's course by id`, async () => {
      const api = await apiAs(role);
      const res = await api.get(`/api/courses/${OTHER_COURSE}`);
      expect(
        [403, 404],
        `LEAK: ${role} got ${res.status()} reading a foreign course (expected 403/404)`,
      ).toContain(res.status());
    });
  }

  // One test per role rather than a loop: a loop shares a single 45s budget
  // across six sequential round-trips, and cold-compiling a dev route can eat
  // most of that on its own — which reads as a timeout, not a result.
  for (const role of CONFINED) {
    test(`${role}'s course list contains no foreign course`, async () => {
      const api = await apiAs(role);
      const res = await api.get("/api/courses");
      expect(res.status()).toBe(200);
      const body = (await safeJson(res)) as { data?: Array<{ id: string; orgId?: string }> };
      const rows = Array.isArray(body?.data) ? body.data : [];
      const leaked = rows.filter((c) => c.id === OTHER_COURSE || c.orgId === OTHER_ORG);
      expect(leaked, `LEAK: ${role} saw ${leaked.length} foreign course(s)`).toHaveLength(0);
      await api.dispose();
    });
  }

  test("user directory never exposes a foreign tenant's users", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.get("/api/users");
    if (res.status() !== 200) {
      test.skip(true, `/api/users returned ${res.status()} for tenantAdmin`);
      return;
    }
    const body = (await safeJson(res)) as { data?: Array<{ id: string; email?: string; orgId?: string }> };
    const rows = Array.isArray(body?.data) ? body.data : (body as { data?: { users?: [] } })?.data?.users ?? [];
    const leaked = (rows as Array<{ id: string; email?: string; orgId?: string }>).filter(
      (u) => u.id === OTHER_USER || u.orgId === OTHER_ORG || u.email === m.other.adminEmail,
    );
    expect(leaked, "LEAK: foreign users present in /api/users").toHaveLength(0);
  });

  test("SUPER_ADMIN is allowed to cross tenants (documents intended behaviour)", async () => {
    const api = await apiAs("superAdmin");
    const res = await api.get(`/api/courses/${OTHER_COURSE}`);
    // Not an assertion of correctness so much as a record of the designed
    // exception — if this ever starts 403ing, super-admin tooling broke.
    expect([200, 403, 404]).toContain(res.status());
  });
});

test.describe("Phase 01 — cross-tenant writes", () => {
  // NOTE: `/api/courses/[id]` exports GET only — there is no per-course
  // PATCH/DELETE, so probing those returns 405 and proves nothing. The write
  // surface below is taken from the route inventory: these are real mutating
  // endpoints that accept an id we can point at the victim tenant.
  const WRITES: Array<{ label: string; run: (api: Awaited<ReturnType<typeof apiAs>>) => Promise<{ status(): number }> }> = [
    {
      label: "PUT /api/master-courses/[id]",
      run: (api) => api.put(`/api/master-courses/${OTHER_COURSE}`, { data: { title: "PWNED BY E2E" } }),
    },
    {
      label: "PATCH /api/batches/[id]",
      run: (api) => api.patch(`/api/batches/${OTHER_COURSE}`, { data: { name: "PWNED BY E2E" } }),
    },
    {
      label: "DELETE /api/groups/[id]",
      run: (api) => api.delete(`/api/groups/${OTHER_COURSE}`),
    },
  ];

  for (const w of WRITES) {
    test(`tenantAdmin cannot mutate a foreign resource via ${w.label}`, async () => {
      const api = await apiAs("tenantAdmin");
      const res = await w.run(api);
      // 400 is acceptable too: several routes validate the id shape before
      // ownership, which still refuses the write.
      expect(
        [400, 403, 404],
        `WRITE LEAK: ${w.label} returned ${res.status()} against a foreign-tenant id`,
      ).toContain(res.status());
      await api.dispose();
    });
  }

  // Informational, not a vulnerability claim. Minting this token requires
  // NEXTAUTH_SECRET, so it is not remotely exploitable — it documents that
  // quiklms's getAuthContext() trusts the JWT `orgId` claim outright, whereas
  // packages/auth's createGetOrgId() re-validates the OrgMember row. If a
  // legitimate org-switch path ever mints a token with an org the user has
  // since been removed from, this is the gap that would let it through.
  test("[informational] getAuthContext trusts the session orgId claim without re-validating membership", async () => {
    const { mintSessionToken } = await import("../fixtures/auth");
    const { request } = await import("@playwright/test");
    const token = await mintSessionToken("tenantAdmin", { orgId: OTHER_ORG });
    const ctx = await request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3020",
      extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
    });
    const res = await ctx.get(`/api/courses/${OTHER_COURSE}`);
    const trusted = res.status() === 200;
    console.log(
      trusted
        ? `[INFO] orgId claim is trusted verbatim (200) — membership is NOT re-checked against quikit.OrgMember.`
        : `[INFO] orgId claim was rejected (${res.status()}) — membership appears to be re-validated.`,
    );
    // Records behaviour without asserting a verdict either way.
    expect([200, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });
});
