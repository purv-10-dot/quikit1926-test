import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { GET } from "@/app/api/apps/launcher/route";

/**
 * Regression: the launcher's per-app env override map (`envBaseUrls`) had no
 * `quikchat` entry, so `QUIKCHAT_URL` was ignored and the DB's production
 * `https://chat.quikit.ai` row won on local dev — clicking "Open app" on the
 * Chat tile left localhost and hit the live host. QuikScale / QuikTrack were
 * unaffected because they *were* in the map; this file pins all three.
 */

const ORG_ID = "org-1";
const ADMIN = { id: "u-1", email: "admin@test.com", isSuperAdmin: false, orgId: ORG_ID };

// DB rows deliberately hold PRODUCTION URLs — that is what a local clone
// pointed at the shared Neon database actually sees.
const APP_ROWS = [
  { id: "app-chat", name: "Chat", slug: "quikchat", description: null, iconUrl: null, baseUrl: "https://chat.quikit.ai", status: "active", requiresOrgAdmin: false },
  { id: "app-scale", name: "Scale", slug: "quikscale", description: null, iconUrl: null, baseUrl: "https://scale.quikit.ai", status: "active", requiresOrgAdmin: false },
  { id: "app-track", name: "Track", slug: "quiktrack", description: null, iconUrl: null, baseUrl: "https://track.quikit.ai", status: "active", requiresOrgAdmin: false },
];

function makeRequest() {
  return new NextRequest(
    new URL(`http://localhost:3000/api/apps/launcher?orgId=${ORG_ID}`),
  );
}

async function launcherApps() {
  const res = await GET(makeRequest());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  return new Map(
    (body.data as { slug: string; baseUrl: string }[]).map((a) => [a.slug, a.baseUrl]),
  );
}

describe("GET /api/apps/launcher — baseUrl resolution", () => {
  const saved = {
    quikchat: process.env.QUIKCHAT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    quiktrack: process.env.QUIKTRACK_URL,
  };

  beforeEach(() => {
    resetMockDb();
    setSession(ADMIN);
    // Org admin in the requested org → every provisioned app is visible.
    mockDb.orgMember.findFirst.mockResolvedValue({ orgId: ORG_ID, role: "org_admin" } as never);
    mockDb.app.findMany.mockResolvedValue(APP_ROWS as never);
    mockDb.orgAppAccess.findMany.mockResolvedValue(
      APP_ROWS.map((a) => ({ appId: a.id, trialEndsAt: null })) as never,
    );
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);
  });

  afterEach(() => {
    for (const [k, v] of [
      ["QUIKCHAT_URL", saved.quikchat],
      ["QUIKSCALE_URL", saved.quikscale],
      ["QUIKTRACK_URL", saved.quiktrack],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("honours QUIKCHAT_URL over the DB's production baseUrl", async () => {
    process.env.QUIKCHAT_URL = "http://localhost:3011";

    const urls = await launcherApps();
    expect(urls.get("quikchat")).toBe("http://localhost:3011");
    expect(urls.get("quikchat")).not.toContain("chat.quikit.ai");
  });

  it("resolves Chat the same way as Scale and Track", async () => {
    process.env.QUIKCHAT_URL = "http://localhost:3011";
    process.env.QUIKSCALE_URL = "http://localhost:3003";
    process.env.QUIKTRACK_URL = "http://localhost:3004";

    const urls = await launcherApps();
    expect(urls.get("quikchat")).toBe("http://localhost:3011");
    expect(urls.get("quikscale")).toBe("http://localhost:3003");
    expect(urls.get("quiktrack")).toBe("http://localhost:3004");
  });

  it("falls back to the quikchat dev port when neither env nor DB has a URL", async () => {
    delete process.env.QUIKCHAT_URL;
    mockDb.app.findMany.mockResolvedValue(
      APP_ROWS.map((a) => (a.slug === "quikchat" ? { ...a, baseUrl: "" } : a)) as never,
    );

    const urls = await launcherApps();
    expect(urls.get("quikchat")).toBe("http://localhost:3011");
  });

  it("still uses the DB baseUrl when no env override is set", async () => {
    delete process.env.QUIKCHAT_URL;

    const urls = await launcherApps();
    expect(urls.get("quikchat")).toBe("https://chat.quikit.ai");
  });
});
