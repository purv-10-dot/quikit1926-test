import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, OPTIONS } from "@/app/.well-known/openid-configuration/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req() {
  return new NextRequest("http://localhost:3000/.well-known/openid-configuration");
}

describe("GET /.well-known/openid-configuration", () => {
  it("advertises the registration endpoint and public-client support", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://quikit.example.com");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registration_endpoint).toBe("https://quikit.example.com/api/oauth/register");
    expect(body.token_endpoint_auth_methods_supported).toContain("none");
  });

  it("includes CORS headers so a browser-context client can read the response", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://quikit.example.com");
    const res = await GET(req());
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("OPTIONS /.well-known/openid-configuration", () => {
  it("returns a 204 preflight response with CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
