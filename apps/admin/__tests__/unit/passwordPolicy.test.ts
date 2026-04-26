import { describe, it, expect } from "vitest";
import {
  checkPasswordRules,
  isPasswordValid,
  passwordPolicyError,
  PASSWORD_MIN_LENGTH,
} from "@/lib/passwordPolicy";

describe("passwordPolicy", () => {
  describe("checkPasswordRules", () => {
    it("flags every rule for an empty string", () => {
      const r = checkPasswordRules("");
      expect(r).toEqual({
        minLength: false,
        hasLetter: false,
        hasDigit: false,
        hasSymbol: false,
      });
    });

    it("requires the configured minimum length", () => {
      const just = "a".repeat(PASSWORD_MIN_LENGTH - 1);
      expect(checkPasswordRules(just).minLength).toBe(false);
      expect(checkPasswordRules(just + "a").minLength).toBe(true);
    });

    it("detects letter, digit, symbol independently", () => {
      expect(checkPasswordRules("abc").hasLetter).toBe(true);
      expect(checkPasswordRules("123").hasDigit).toBe(true);
      expect(checkPasswordRules("!!!").hasSymbol).toBe(true);
      expect(checkPasswordRules("abc").hasSymbol).toBe(false);
      expect(checkPasswordRules("123").hasLetter).toBe(false);
    });

    it("treats whitespace as not-a-symbol", () => {
      expect(checkPasswordRules("ab cd").hasSymbol).toBe(false);
    });
  });

  describe("isPasswordValid", () => {
    it("accepts a password meeting every rule", () => {
      expect(isPasswordValid("Supersecret123!")).toBe(true);
    });

    it.each([
      ["short missing length", "Sh0rt!"],
      ["missing letter", "1234567890!"],
      ["missing digit", "NoDigitsHere!"],
      ["missing symbol", "NoSymbolsHere1"],
    ])("rejects %s", (_label, pwd) => {
      expect(isPasswordValid(pwd)).toBe(false);
    });
  });

  describe("passwordPolicyError", () => {
    it("returns null for a valid password", () => {
      expect(passwordPolicyError("Supersecret123!")).toBeNull();
    });

    it("complains about missing input first", () => {
      expect(passwordPolicyError(undefined)).toMatch(/required/i);
      expect(passwordPolicyError(null)).toMatch(/required/i);
      expect(passwordPolicyError(123)).toMatch(/required/i);
    });

    it("returns specific message for each failing rule", () => {
      expect(passwordPolicyError("short")).toMatch(/at least 10/i);
      expect(passwordPolicyError("1234567890!")).toMatch(/letter/i);
      expect(passwordPolicyError("NoDigitsHere!")).toMatch(/digit/i);
      expect(passwordPolicyError("NoSymbolsHere1")).toMatch(/symbol/i);
    });
  });
});
