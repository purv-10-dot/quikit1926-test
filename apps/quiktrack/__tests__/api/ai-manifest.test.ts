import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/internal/manifest/route";

const SECRET = "test-ai-runtime-secret";

function req(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/internal/manifest", { headers });
}

beforeEach(() => {
  process.env.INTERNAL_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.INTERNAL_SECRET;
});

describe("GET /api/internal/manifest", () => {
  it("returns 401 with no x-internal-secret header", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 401 with the wrong secret", async () => {
    const res = await GET(req({ "x-internal-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when INTERNAL_SECRET is unset server-side, even if a header is sent — fail-closed, never fail-open", async () => {
    delete process.env.INTERNAL_SECRET;
    const res = await GET(req({ "x-internal-secret": "anything" }));
    expect(res.status).toBe(401);
  });

  it("returns the manifest shape on a valid secret", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      appId: "quiktrack",
      routePrefix: "/quiktrack",
      manifestVersion: "1",
    });
    expect(Array.isArray(body.data.entities)).toBe(true);
    expect(Array.isArray(body.data.operations)).toBe(true);
    expect(body.data.entities.length).toBeGreaterThan(0);
    expect(body.data.operations.length).toBeGreaterThan(0);
  });

  it("declares riskClass as one of the 5 fixed enum values on every operation", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    const body = await res.json();
    const allowed = new Set(["read", "draft", "soft_write", "medium_write", "high_risk"]);
    for (const op of body.data.operations) {
      expect(allowed.has(op.riskClass)).toBe(true);
    }
  });

  it("uses registry Resource:action form (not the launcher's dotted manifest.ts strings) for every non-null requiredPermission", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    const body = await res.json();
    for (const op of body.data.operations) {
      if (op.requiredPermission === null) continue;
      expect(op.requiredPermission).toMatch(/^[A-Z][A-Za-z]*:[a-z]+$/);
      expect(op.requiredPermission).not.toMatch(/^quiktrack\./);
    }
  });

  it("every operation's entity matches a declared entities[].type", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    const body = await res.json();
    const entityTypes = new Set(body.data.entities.map((e: { type: string }) => e.type));
    for (const op of body.data.operations) {
      expect(entityTypes.has(op.entity)).toBe(true);
    }
  });

  it("summarize_issue and summarize_sprint point at the real summary routes just shipped, marked isSummary", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    const body = await res.json();
    const byName = (n: string) => body.data.operations.find((o: { name: string }) => o.name === n);
    expect(byName("summarize_issue")).toMatchObject({
      isSummary: true,
      http: { method: "GET", pathTemplate: "/api/issues/{id}/summary" },
    });
    expect(byName("summarize_sprint")).toMatchObject({
      isSummary: true,
      http: { method: "GET", pathTemplate: "/api/sprints/{id}/summary" },
    });
  });

  it("classifies create as soft_write, update/move as medium_write, and delete as high_risk (the doc's own classification rule)", async () => {
    const res = await GET(req({ "x-internal-secret": SECRET }));
    const body = await res.json();
    const byName = (n: string) => body.data.operations.find((o: { name: string }) => o.name === n);
    expect(byName("create_issue").riskClass).toBe("soft_write");
    expect(byName("update_issue").riskClass).toBe("medium_write");
    expect(byName("delete_issue").riskClass).toBe("high_risk");
  });
});
