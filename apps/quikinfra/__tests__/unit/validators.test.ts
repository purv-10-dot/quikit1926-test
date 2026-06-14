import { describe, it, expect } from "vitest";
import {
  validateMobile,
  normalizeMobile,
  validateEmail,
  normalizeEmail,
  validateGSTIN,
  validatePAN,
  validateRequired,
  validatePositiveNumber,
  validateFYCode,
  validateIFSC,
  validateCIN,
  validatePincode,
  validatePhone,
  validateURL,
  validateHSN,
  validatePercentage,
  validateNonNegativeNumber,
  validatePositiveInteger,
  validateMinLength,
  validateCode,
  validateProjectCode,
  normalizeProjectCode,
  validateDateISO,
  validateDateRange,
  validateAll,
  validateForm,
} from "@/lib/validators";

describe("validateMobile", () => {
  it("accepts a 10-digit Indian mobile", () => {
    expect(validateMobile("9876543210").valid).toBe(true);
  });
  it("strips +91 / spaces / dashes before validating", () => {
    expect(validateMobile("+91 98765-43210").valid).toBe(true);
  });
  it("treats empty/undefined as valid (optional)", () => {
    expect(validateMobile("").valid).toBe(true);
    expect(validateMobile(undefined).valid).toBe(true);
  });
  it("rejects numbers not starting with 6-9", () => {
    const r = validateMobile("1234567890");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/6, 7, 8, or 9/);
  });
  it("rejects the wrong digit count", () => {
    expect(validateMobile("98765").valid).toBe(false);
  });
});

describe("normalizeMobile", () => {
  it("drops a leading 91 country code", () => {
    expect(normalizeMobile("919876543210")).toBe("9876543210");
  });
  it("strips formatting characters", () => {
    expect(normalizeMobile("98765 43210")).toBe("9876543210");
  });
});

describe("validateEmail / normalizeEmail", () => {
  it("accepts a well-formed email", () => {
    expect(validateEmail("a@b.com").valid).toBe(true);
  });
  it("rejects a malformed email", () => {
    expect(validateEmail("not-an-email").valid).toBe(false);
  });
  it("lowercases + trims on normalize", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });
});

describe("validateGSTIN", () => {
  it("accepts a valid 15-char GSTIN", () => {
    expect(validateGSTIN("22AAAAA0000A1Z5").valid).toBe(true);
  });
  it("rejects the wrong length", () => {
    expect(validateGSTIN("22AAAAA0000A1Z").valid).toBe(false);
  });
  it("rejects a bad pattern", () => {
    expect(validateGSTIN("AAAAAAAAAAAAAAA").valid).toBe(false);
  });
});

describe("validatePAN", () => {
  it("accepts a valid PAN", () => {
    expect(validatePAN("ABCDE1234F").valid).toBe(true);
  });
  it("rejects a malformed PAN", () => {
    expect(validatePAN("ABCDE1234").valid).toBe(false);
  });
});

describe("validateIFSC", () => {
  it("accepts a valid IFSC", () => {
    expect(validateIFSC("SBIN0001234").valid).toBe(true);
  });
  it("requires the 5th char to be 0", () => {
    expect(validateIFSC("SBIN1001234").valid).toBe(false);
  });
});

describe("validateCIN", () => {
  it("accepts a valid 21-char CIN", () => {
    expect(validateCIN("L12345MH2000PLC123456").valid).toBe(true);
  });
  it("rejects the wrong length", () => {
    expect(validateCIN("L12345MH2000PLC12345").valid).toBe(false);
  });
});

describe("validateRequired", () => {
  it("fails on empty string / null / undefined", () => {
    expect(validateRequired("", "Name").valid).toBe(false);
    expect(validateRequired("   ", "Name").valid).toBe(false);
    expect(validateRequired(null, "Name").valid).toBe(false);
    expect(validateRequired(undefined, "Name").valid).toBe(false);
  });
  it("passes on a non-empty value and names the field on failure", () => {
    expect(validateRequired("x", "Name").valid).toBe(true);
    expect(validateRequired("", "Contractor").error).toBe("Contractor is required");
  });
});

describe("numeric validators", () => {
  it("validatePositiveNumber rejects negatives + NaN", () => {
    expect(validatePositiveNumber(5, "Qty").valid).toBe(true);
    expect(validatePositiveNumber(-1, "Qty").valid).toBe(false);
    expect(validatePositiveNumber("abc", "Qty").valid).toBe(false);
  });
  it("validateNonNegativeNumber allows 0 and blanks", () => {
    expect(validateNonNegativeNumber(0).valid).toBe(true);
    expect(validateNonNegativeNumber("").valid).toBe(true);
    expect(validateNonNegativeNumber(-2).valid).toBe(false);
  });
  it("validatePositiveInteger rejects 0, decimals and blanks-pass", () => {
    expect(validatePositiveInteger(3).valid).toBe(true);
    expect(validatePositiveInteger(0).valid).toBe(false);
    expect(validatePositiveInteger(1.5).valid).toBe(false);
    expect(validatePositiveInteger("").valid).toBe(true);
  });
  it("validatePercentage clamps to 0..100", () => {
    expect(validatePercentage(50).valid).toBe(true);
    expect(validatePercentage(101).valid).toBe(false);
    expect(validatePercentage(-1).valid).toBe(false);
  });
});

describe("validateFYCode", () => {
  it("accepts FY YYYY-YY", () => {
    expect(validateFYCode("FY 2025-26").valid).toBe(true);
  });
  it("rejects a missing label / bad format", () => {
    expect(validateFYCode("").valid).toBe(false);
    expect(validateFYCode("2025-2026").valid).toBe(false);
  });
});

describe("validateProjectCode / normalizeProjectCode", () => {
  it("accepts 2-10 alphanumeric/hyphen codes", () => {
    expect(validateProjectCode("PRJ-01").valid).toBe(true);
  });
  it("rejects too short / illegal chars", () => {
    expect(validateProjectCode("A").valid).toBe(false);
    expect(validateProjectCode("PRJ_01").valid).toBe(false);
  });
  it("uppercases + trims", () => {
    expect(normalizeProjectCode(" prj-01 ")).toBe("PRJ-01");
  });
});

describe("misc format validators", () => {
  it("validatePincode requires 6 digits not starting with 0", () => {
    expect(validatePincode("452001").valid).toBe(true);
    expect(validatePincode("052001").valid).toBe(false);
  });
  it("validatePhone allows 8-15 digits", () => {
    expect(validatePhone("0731-2345678").valid).toBe(true);
    expect(validatePhone("123").valid).toBe(false);
  });
  it("validateURL requires http(s)", () => {
    expect(validateURL("https://x.io").valid).toBe(true);
    expect(validateURL("x.io").valid).toBe(false);
  });
  it("validateHSN allows 4/6/8 digits", () => {
    expect(validateHSN("1001").valid).toBe(true);
    expect(validateHSN("100100").valid).toBe(true);
    expect(validateHSN("100").valid).toBe(false);
  });
  it("validateCode allows safe identifier chars", () => {
    expect(validateCode("ABC-1_2").valid).toBe(true);
    expect(validateCode("ABC 1").valid).toBe(false);
  });
  it("validateMinLength enforces min", () => {
    expect(validateMinLength("abcd", 3).valid).toBe(true);
    expect(validateMinLength("ab", 3).valid).toBe(false);
  });
});

describe("date validators", () => {
  it("validateDateISO requires YYYY-MM-DD and a real date", () => {
    expect(validateDateISO("2025-06-01").valid).toBe(true);
    expect(validateDateISO("01-06-2025").valid).toBe(false);
    expect(validateDateISO("2025-13-40").valid).toBe(false);
  });
  it("validateDateRange requires end >= start", () => {
    expect(validateDateRange("2025-01-01", "2025-02-01").valid).toBe(true);
    expect(validateDateRange("2025-02-01", "2025-01-01").valid).toBe(false);
  });
});

describe("validateAll", () => {
  it("collects the first error per field and reports overall validity", () => {
    const res = validateAll([
      { field: "name", value: "", validators: [validateRequired as any] },
      { field: "email", value: "x@y.com", validators: [validateEmail] },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors.name).toMatch(/required/);
    expect(res.errors.email).toBeUndefined();
  });
});

describe("validateForm", () => {
  it("honours required + validator rules and stops at the first failure per key", () => {
    const errors = validateForm(
      { name: "", email: "bad" },
      {
        name: [{ required: true, label: "Name" }],
        email: [{ validator: validateEmail }],
      },
    );
    expect(errors.name).toBe("Name is required");
    expect(errors.email).toMatch(/Invalid email/);
  });
  it("returns no errors for a valid form", () => {
    const errors = validateForm(
      { name: "Acme", email: "a@b.com" },
      { name: [{ required: true }], email: [{ validator: validateEmail }] },
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
