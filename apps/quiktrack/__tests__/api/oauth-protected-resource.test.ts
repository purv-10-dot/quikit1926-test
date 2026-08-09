import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, OPTIONS } from "@/app/.well-known/oauth-protected-resource/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /.well-known/oauth-protected-resource", () => {
  it("is unauthenticated and points at the MCP endpoint + the launcher IdP", async () => {
    vi.stubEnv("QUIKIT_URL", "https://quikit.example.com");
    const res = await GET(new NextRequest("http://localhost:3004/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      resource: "http://localhost:3004/api/mcp",
      authorization_servers: ["https://quikit.example.com"],
    });
  });

  it("returns an empty authorization_servers list rather than throwing when QUIKIT_URL isn't configured", async () => {
    vi.stubEnv("QUIKIT_URL", "");
    vi.stubEnv("QUIKIT_ISSUER_URL", "");
    const res = await GET(new NextRequest("http://localhost:3004/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorization_servers).toEqual([]);
  });

  it("prefers NEXT_PUBLIC_QUIKTRACK_URL over the request origin (needed behind a reverse proxy/tunnel)", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUIKTRACK_URL", "https://quiktrack.example.com");
    vi.stubEnv("QUIKIT_URL", "https://quikit.example.com");
    const res = await GET(new NextRequest("http://localhost:3004/.well-known/oauth-protected-resource"));
    const body = await res.json();
    expect(body.resource).toBe("https://quiktrack.example.com/api/mcp");
  });

  it("includes CORS headers so a browser-context client can read the response", async () => {
    vi.stubEnv("QUIKIT_URL", "https://quikit.example.com");
    const res = await GET(new NextRequest("http://localhost:3004/.well-known/oauth-protected-resource"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("OPTIONS /.well-known/oauth-protected-resource", () => {
  it("returns a 204 preflight response with CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
