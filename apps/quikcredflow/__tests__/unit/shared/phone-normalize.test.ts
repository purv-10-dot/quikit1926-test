import { describe, expect, it } from "vitest";
import { normalizePhoneOrError } from "@/lib/services/shared/phone-normalize";

describe("normalizePhoneOrError", () => {
  it("prepends the default country for a bare 10-digit Indian number", () => {
    expect(normalizePhoneOrError("7631957103", "IN")).toEqual({
      ok: true,
      value: "+917631957103",
    });
  });

  it("tolerates spaces in the input", () => {
    expect(normalizePhoneOrError("98765 43210", "IN")).toEqual({
      ok: true,
      value: "+919876543210",
    });
  });

  it("leaves an already-E.164 number untouched (no double +91)", () => {
    expect(normalizePhoneOrError("+917631957103", "IN")).toEqual({
      ok: true,
      value: "+917631957103",
    });
  });

  it("keeps a foreign number with its own country code (not +91'd)", () => {
    expect(normalizePhoneOrError("+12125551234", "IN")).toEqual({
      ok: true,
      value: "+12125551234",
    });
  });

  it("rejects a genuinely-invalid number", () => {
    const r = normalizePhoneOrError("12345", "IN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not a valid phone number/i);
  });

  it("treats null / empty / undefined as an absent (null) phone", () => {
    expect(normalizePhoneOrError(null, "IN")).toEqual({ ok: true, value: null });
    expect(normalizePhoneOrError("", "IN")).toEqual({ ok: true, value: null });
    expect(normalizePhoneOrError("   ", "IN")).toEqual({ ok: true, value: null });
    expect(normalizePhoneOrError(undefined, "IN")).toEqual({ ok: true, value: null });
  });
});
