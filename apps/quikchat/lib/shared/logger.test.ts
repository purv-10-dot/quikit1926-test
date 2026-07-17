import { describe, expect, it } from "vitest";
import { pathOf, redactSecrets, requestId } from "./logger";

describe("requestId", () => {
  it("echoes an inbound X-Request-Id", () => {
    const req = new Request("http://t/x", { headers: { "x-request-id": "abc-123" } });
    expect(requestId(req)).toBe("abc-123");
  });
  it("generates one when absent", () => {
    expect(requestId(new Request("http://t/x")).length).toBeGreaterThan(0);
  });
});

describe("redactSecrets", () => {
  it("strips secret-looking keys, recursively, keeping the rest", () => {
    const out = redactSecrets({
      authorization: "Bearer xyz",
      keep: "value",
      nested: { token: "t", cookie: "c", ok: 1 },
    });
    expect(out).toEqual({
      authorization: "[redacted]",
      keep: "value",
      nested: { token: "[redacted]", cookie: "[redacted]", ok: 1 },
    });
  });
});

describe("pathOf", () => {
  it("returns the pathname without query", () => {
    expect(pathOf({ url: "http://t/api/channels?x=1" })).toBe("/api/channels");
  });
});
