import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetErrorTrackingForTest, captureError } from "./error-tracking";

describe("captureError", () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
    __resetErrorTrackingForTest();
  });
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    __resetErrorTrackingForTest();
  });

  it("is a no-op without a DSN and never throws", async () => {
    await expect(
      captureError(new Error("boom"), { token: "secret", orgId: "o1" }),
    ).resolves.toBeUndefined();
  });

  it("swallows everything (never rejects) even with odd input", async () => {
    await expect(captureError("not-an-error")).resolves.toBeUndefined();
  });
});
