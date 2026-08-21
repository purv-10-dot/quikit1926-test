import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/auth/mobile/microsoft — deliberate 501 scaffold.
 *
 * Current mobile scope is Android + Google only; MSAL config hasn't been
 * supplied. These tests pin the two properties that make the stub useful
 * rather than merely absent: it fails LOUDLY (501, not 404, not a silent
 * success), and its input validation already runs — so the mobile client's
 * error handling can be built against the real contract shape today.
 */

import { POST } from "@/app/api/auth/mobile/microsoft/route";

function makeRequest(body: unknown) {
  return new NextRequest(
    new URL("http://localhost:3001/api/auth/mobile/microsoft"),
    {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    } as never,
  );
}

describe("POST /api/auth/mobile/microsoft", () => {
  it("501s a well-formed request — not implemented, and says so", async () => {
    const res = await POST(
      makeRequest({
        idToken: "msal-id-token",
        targetOrigin: "https://uatinfra.quikit.ai",
      }),
    );
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("not yet configured");
  });

  it("400s a malformed body BEFORE reaching the 501", async () => {
    const res = await POST(
      makeRequest({ targetOrigin: "https://uatinfra.quikit.ai" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("idToken");
  });

  it("400s a non-JSON body", async () => {
    const res = await POST(makeRequest("not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Body must be JSON");
  });
});
