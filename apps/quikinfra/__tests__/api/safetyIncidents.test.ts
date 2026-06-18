import { describe, it, expect, beforeEach } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/safety/incidents/route";

// NOTE: safety/incidents is an in-memory store (module-level `data[]`, no DB).
// GET is ungated (no auth required); POST is gated by the permission matrix
// action ("safety.incidents", "add"). Records persist in the module array
// across tests in this file, so assertions avoid exact counts.

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/safety/incidents${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/safety/incidents", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/safety/incidents", () => {
  it("returns 200 with {data,total} (view ungated)", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});

describe("POST /api/safety/incidents — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ description: "fall" }))).status).toBe(401);
  });

  it("returns 403 when the matrix denies add on safety.incidents", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "safety.incidents": { add: false } } }),
    );
    expect((await POST(buildPOST({ description: "fall" }))).status).toBe(403);
  });
});

describe("POST /api/safety/incidents — happy path", () => {
  it("creates an incident with a generated incidentNo and returns 201", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ type: "slip", description: "wet floor" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^inc-/);
    expect(body.incidentNo).toMatch(/^INC-2026-/);
    expect(body.type).toBe("slip");
  });
});
