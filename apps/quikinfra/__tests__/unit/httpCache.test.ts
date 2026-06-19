import { describe, it, expect } from "vitest";
import { cachedJson, noStoreJson } from "@/lib/http/cache";

describe("cachedJson", () => {
  it("defaults to the short tier and sets Vary: Cookie", () => {
    const res = cachedJson({ data: [], total: 0 });
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=10, stale-while-revalidate=60",
    );
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.status).toBe(200);
  });

  it("applies the medium tier policy", () => {
    const res = cachedJson({}, "medium");
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=30, stale-while-revalidate=300",
    );
  });

  it("applies the long tier policy", () => {
    const res = cachedJson({}, "long");
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=300, stale-while-revalidate=3600",
    );
  });

  it("honours a custom status from init", () => {
    const res = cachedJson({}, "short", { status: 206 });
    expect(res.status).toBe(206);
  });

  it("serialises the body as JSON", async () => {
    const res = cachedJson({ data: [{ id: "1" }], total: 1 });
    const body = await res.json();
    expect(body).toEqual({ data: [{ id: "1" }], total: 1 });
  });

  it("all tiers are private (never shared by a CDN)", () => {
    for (const tier of ["short", "medium", "long"] as const) {
      expect(cachedJson({}, tier).headers.get("Cache-Control")).toMatch(/^private,/);
    }
  });
});

describe("noStoreJson", () => {
  it("sets Cache-Control: no-store", () => {
    const res = noStoreJson({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not set a Vary header", () => {
    const res = noStoreJson({ ok: true });
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("honours a custom status", () => {
    expect(noStoreJson({}, { status: 201 }).status).toBe(201);
  });

  it("serialises the body", async () => {
    const body = await noStoreJson({ id: "x" }).json();
    expect(body).toEqual({ id: "x" });
  });
});
