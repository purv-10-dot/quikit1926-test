import { describe, it, expect } from "vitest";
import { toErrorMessage } from "@/lib/api/errors";

describe("toErrorMessage", () => {
  it("extracts .message from an Error instance", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts .message from a TypeError (Error subclass)", () => {
    expect(toErrorMessage(new TypeError("bad type"))).toBe("bad type");
  });

  it("returns the string itself when error is a string", () => {
    expect(toErrorMessage("raw string error")).toBe("raw string error");
  });

  it("returns the fallback for null", () => {
    expect(toErrorMessage(null)).toBe("Operation failed");
  });

  it("returns the fallback for undefined", () => {
    expect(toErrorMessage(undefined)).toBe("Operation failed");
  });

  it("returns the fallback for a plain object", () => {
    expect(toErrorMessage({ message: "not an Error instance" })).toBe("Operation failed");
  });

  it("returns a custom fallback when provided", () => {
    expect(toErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("prefers the Error message over the custom fallback", () => {
    expect(toErrorMessage(new Error("real"), "fallback")).toBe("real");
  });
});
