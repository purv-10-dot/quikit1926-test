/**
 * PHASE 00 — Harness verification.
 *
 * Proves the test rig itself is sound before any feature phase runs. If this
 * file fails, every downstream result is meaningless: a mis-minted session
 * silently downgrades to LEARNER (see lib/auth/role-resolution.ts) and the
 * suite would report false 403s as product bugs.
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, apiWithBadToken, safeJson } from "../fixtures/api";
import { ALL_ROLES, loadManifest, type RoleKey } from "../fixtures/auth";

const manifest = loadManifest();

test.describe("Phase 00 — harness", () => {
  test("app is up and /api/health responds", async () => {
    const anon = await apiAnon();
    const res = await anon.get("/api/health");
    expect(res.status()).toBe(200);
  });

  test("seed manifest has all 7 roles and core entities", () => {
    for (const r of ALL_ROLES) {
      expect(manifest.users[r], `missing seeded user: ${r}`).toBeTruthy();
    }
    expect(manifest.courses.published).toBeTruthy();
    expect(manifest.courses.draft).toBeTruthy();
    expect(manifest.modules.length).toBeGreaterThan(0);
    expect(manifest.modules[0].lessons.length).toBeGreaterThan(0);
  });

  // The crux: each minted session must resolve to the LMS role we seeded,
  // not to the coarse platform-role fallback.
  for (const role of ALL_ROLES) {
    test(`session for '${role}' resolves to LMS role ${manifest.users[role as RoleKey].role}`, async () => {
      const api = await apiAs(role);
      const res = await api.get("/api/auth/profile");
      expect(res.status(), `expected an authenticated 200 for ${role}`).toBe(200);
      const body = (await safeJson(res)) as { data?: { role?: string; email?: string } };
      const seeded = manifest.users[role as RoleKey];
      expect(body?.data?.email?.toLowerCase()).toBe(seeded.email.toLowerCase());
      expect(
        body?.data?.role,
        `role resolution fell back instead of reading the seeded LmsUser row`,
      ).toBe(seeded.role);
    });
  }

  test("unauthenticated request to a guarded route is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.get("/api/courses");
    expect([401, 403]).toContain(res.status());
    const body = (await safeJson(res)) as { statusCode?: number; error?: string };
    expect(body.statusCode, "error envelope shape from lib/http.ts").toBe(res.status());
  });

  test("a forged session token is rejected, not accepted", async () => {
    const bad = await apiWithBadToken();
    const res = await bad.get("/api/courses");
    expect(
      [401, 403],
      "a garbage JWE must never authenticate",
    ).toContain(res.status());
  });
});
