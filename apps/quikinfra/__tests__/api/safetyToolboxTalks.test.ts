import { describe, it, expect, beforeEach } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/safety/toolbox-talks/route";

// NOTE: safety/toolbox-talks is an in-memory store (module-level `data[]`,
// no DB). GET is ungated; POST is gated by the matrix action
// ("safety.toolbox", "add").

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/safety/toolbox-talks${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/safety/toolbox-talks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/safety/toolbox-talks", () => {
  it("returns 200 with {data,total} (view ungated)", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});

describe("POST /api/safety/toolbox-talks — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ topic: "ladders" }))).status).toBe(401);
  });

  it("returns 403 when the matrix denies add on safety.toolbox", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "safety.toolbox": { add: false } } }),
    );
    expect((await POST(buildPOST({ topic: "ladders" }))).status).toBe(403);
  });
});

describe("POST /api/safety/toolbox-talks — happy path", () => {
  it("creates a toolbox talk and returns 201", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ topic: "ladders", conductedBy: "Foreman" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^tbt-/);
    expect(body.topic).toBe("ladders");
  });
});
