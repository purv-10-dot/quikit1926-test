import { describe, it, expect } from "vitest";
import { humanizeApiError, humanizeResponse } from "@/lib/utils/humanizeError";

describe("humanizeApiError", () => {
  it("maps a Response 401 to a session-expired message", () => {
    const res = new Response("", { status: 401 });
    const msg = humanizeApiError(res);
    expect(msg).toMatch(/session has expired/i);
  });

  it("maps a Response 403 with context to a permission message", () => {
    const res = new Response("", { status: 403 });
    const msg = humanizeApiError(res, { context: "KPI" });
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/KPI/i);
  });

  it("maps a Response 429 to a slow-down message", () => {
    const res = new Response("", { status: 429 });
    expect(humanizeApiError(res)).toMatch(/too fast|wait a minute/i);
  });

  it("maps a Response 500 to a server-error message", () => {
    const res = new Response("", { status: 500 });
    expect(humanizeApiError(res)).toMatch(/something went wrong/i);
  });

  it("translates the legacy 'Permission denied' Error message into a friendly version", () => {
    const err = new Error("Permission denied");
    expect(humanizeApiError(err, { context: "weekly value" })).toMatch(/permission/i);
  });

  it("translates a network error to an offline-style message", () => {
    expect(humanizeApiError(new Error("Failed to fetch"))).toMatch(/can't reach the server/i);
  });

  it("passes server-curated 400 messages through Error.message untouched", () => {
    const msg = humanizeApiError(new Error("A KPI named \"Sales\" already exists for Q1 2026."));
    expect(msg).toMatch(/already exists/i);
  });

  it("falls back to a generic message for an empty error", () => {
    expect(humanizeApiError(undefined)).toMatch(/something went wrong/i);
    expect(humanizeApiError(undefined, { fallback: "Custom fallback" })).toBe("Custom fallback");
  });

  it("uses an object's status field when present", () => {
    const errLike = { status: 404, message: "not found" };
    expect(humanizeApiError(errLike, { context: "Priority" })).toMatch(/no longer exists/i);
  });
});

describe("humanizeResponse", () => {
  it("reads server `error` from the JSON body for 409", async () => {
    const res = new Response(JSON.stringify({ success: false, error: "Duplicate Priority name" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
    expect(await humanizeResponse(res)).toBe("Duplicate Priority name");
  });

  it("uses default 500 messaging when body is empty", async () => {
    const res = new Response("", { status: 500 });
    expect(await humanizeResponse(res)).toMatch(/something went wrong/i);
  });
});
