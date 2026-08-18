import { describe, expect, it } from "vitest";
import { errorFields, pathOf, redactSecrets, requestId } from "./logger";

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

describe("errorFields", () => {
  it("names the four fields and nothing else", () => {
    const e = Object.assign(new TypeError("nope"), { code: "E_NOPE", status: 418 });
    expect(errorFields(e)).toEqual({
      errName: "TypeError",
      errMessage: "nope",
      errCode: "E_NOPE",
      errStatus: 418,
    });
  });

  it("survives a non-Error throw", () => {
    expect(errorFields("just a string")).toEqual({
      errName: "string",
      errMessage: "unknown error",
      errCode: undefined,
      errStatus: undefined,
    });
    expect(errorFields(null)).toMatchObject({ errName: "object", errMessage: "unknown error" });
  });

  it("ignores a code/status of the wrong type rather than passing them through", () => {
    const e = Object.assign(new Error("x"), { code: { nested: "obj" }, status: "403" });
    expect(errorFields(e)).toMatchObject({ errCode: undefined, errStatus: undefined });
  });

  /**
   * The constraint this helper exists for. `logger.error({ error: e })` would
   * serialise whatever the throw site hung off the error, and pino's `redact`
   * only censors the paths it is configured with — `metadata.apiSecret` is not
   * one of them. Every caller (LiveKit webhook, SFU provider, call timeout
   * sweep, realtime gateway) spreads THIS function's result instead, so a
   * secret riding on an unread field has nowhere to go.
   */
  it("never carries a planted secret off the error object", () => {
    const serverErrorLike = Object.assign(new Error("Permission denied on room"), {
      status: 403,
      code: "permission_denied",
      // The fields `errorFields` deliberately does not read.
      metadata: { apiSecret: "LIVEKIT-API-SECRET-FAKE-VALUE" },
      config: { headers: { authorization: "Bearer PLANTED-BEARER-TOKEN" } },
      request: { body: "PLANTED-REQUEST-BODY" },
    });

    const fields = errorFields(serverErrorLike);

    expect(fields).toEqual({
      errName: "Error",
      errMessage: "Permission denied on room",
      errCode: "permission_denied",
      errStatus: 403,
    });
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain("LIVEKIT-API-SECRET-FAKE-VALUE");
    expect(serialized).not.toContain("PLANTED-BEARER-TOKEN");
    expect(serialized).not.toContain("PLANTED-REQUEST-BODY");
    for (const leaky of ["metadata", "config", "request", "err", "error", "stack"]) {
      expect(fields).not.toHaveProperty(leaky);
    }
  });
});
