/**
 * Comprehensive Zod schema tests for opspSchema, categorySchema,
 * settingsSchema, and huddleSchema.
 *
 * Targets >=90% line coverage on each schema file.
 */

import { describe, it, expect } from "vitest";

import {
  opspUpsertSchema,
  opspFinalizeSchema,
} from "@/lib/schemas/opspSchema";

import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/schemas/categorySchema";

import {
  updateProfileSchema,
  updateCompanySchema,
  updateConfigurationsSchema,
} from "@/lib/schemas/settingsSchema";

// huddleSchema removed in Client Meetings rewrite; its test block at the
// bottom of this file was dropped along with the import.

/* ════════════════════════════════════════════════════════════════════════════
 *  opspSchema
 * ════════════════════════════════════════════════════════════════════════════ */

describe("opspSchema", () => {
  describe("opspUpsertSchema", () => {
    it("accepts numeric year + valid quarter", () => {
      for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) {
        const result = opspUpsertSchema.safeParse({ year: 2026, quarter: q });
        expect(result.success).toBe(true);
      }
    });

    it("accepts string-encoded year", () => {
      const result = opspUpsertSchema.safeParse({ year: "2026", quarter: "Q2" });
      expect(result.success).toBe(true);
    });

    it("rejects non-numeric string year", () => {
      const result = opspUpsertSchema.safeParse({ year: "abc", quarter: "Q1" });
      expect(result.success).toBe(false);
    });

    it("rejects float year", () => {
      const result = opspUpsertSchema.safeParse({ year: 2026.5, quarter: "Q1" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid quarter values", () => {
      for (const q of ["Q0", "Q5", "q1", "1", ""]) {
        expect(opspUpsertSchema.safeParse({ year: 2026, quarter: q }).success).toBe(false);
      }
    });

    it("rejects missing year", () => {
      const result = opspUpsertSchema.safeParse({ quarter: "Q1" });
      expect(result.success).toBe(false);
    });

    it("rejects missing quarter", () => {
      const result = opspUpsertSchema.safeParse({ year: 2026 });
      expect(result.success).toBe(false);
    });

    it("passes through extra fields unchanged", () => {
      const input = {
        year: 2026,
        quarter: "Q3",
        targetYears: 5,
        coreValues: ["integrity", "speed"],
        extraField: { nested: true },
      };
      const result = opspUpsertSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetYears).toBe(5);
        expect(result.data.coreValues).toEqual(["integrity", "speed"]);
        expect((result.data as Record<string, unknown>).extraField).toEqual({ nested: true });
      }
    });
  });

  describe("opspFinalizeSchema", () => {
    it("accepts valid year + quarter", () => {
      const result = opspFinalizeSchema.safeParse({ year: 2026, quarter: "Q4" });
      expect(result.success).toBe(true);
    });

    it("accepts string-encoded year", () => {
      const result = opspFinalizeSchema.safeParse({ year: "2025", quarter: "Q1" });
      expect(result.success).toBe(true);
    });

    it("rejects non-numeric string year", () => {
      expect(opspFinalizeSchema.safeParse({ year: "abc", quarter: "Q1" }).success).toBe(false);
    });

    it("rejects invalid quarter", () => {
      expect(opspFinalizeSchema.safeParse({ year: 2026, quarter: "Q5" }).success).toBe(false);
    });

    it("strips extra fields (not passthrough)", () => {
      const result = opspFinalizeSchema.safeParse({
        year: 2026,
        quarter: "Q1",
        extra: "should be stripped",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).extra).toBeUndefined();
      }
    });

    it("rejects missing required fields", () => {
      expect(opspFinalizeSchema.safeParse({}).success).toBe(false);
      expect(opspFinalizeSchema.safeParse({ year: 2026 }).success).toBe(false);
      expect(opspFinalizeSchema.safeParse({ quarter: "Q1" }).success).toBe(false);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  categorySchema
 * ════════════════════════════════════════════════════════════════════════════ */

describe("categorySchema", () => {
  describe("createCategorySchema", () => {
    it("accepts all valid dataType values", () => {
      for (const dt of ["Number", "Percentage", "Currency"] as const) {
        expect(
          createCategorySchema.safeParse({ name: "Test", dataType: dt }).success
        ).toBe(true);
      }
    });

    it("accepts optional currency field", () => {
      const result = createCategorySchema.safeParse({
        name: "Revenue",
        dataType: "Currency",
        currency: "EUR",
      });
      expect(result.success).toBe(true);
    });

    it("accepts null currency", () => {
      const result = createCategorySchema.safeParse({
        name: "Revenue",
        dataType: "Currency",
        currency: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional description", () => {
      const result = createCategorySchema.safeParse({
        name: "Revenue",
        dataType: "Number",
        description: "Tracks revenue metrics",
      });
      expect(result.success).toBe(true);
    });

    it("accepts null description", () => {
      const result = createCategorySchema.safeParse({
        name: "Revenue",
        dataType: "Number",
        description: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createCategorySchema.safeParse({ name: "", dataType: "Number" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.issues.find((i) => i.path[0] === "name");
        expect(nameError).toBeDefined();
      }
    });

    it("rejects name exceeding 200 characters", () => {
      const result = createCategorySchema.safeParse({
        name: "a".repeat(201),
        dataType: "Number",
      });
      expect(result.success).toBe(false);
    });

    it("accepts name at exactly 200 characters", () => {
      const result = createCategorySchema.safeParse({
        name: "a".repeat(200),
        dataType: "Number",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid dataType", () => {
      expect(
        createCategorySchema.safeParse({ name: "Test", dataType: "Boolean" }).success
      ).toBe(false);
      expect(
        createCategorySchema.safeParse({ name: "Test", dataType: "" }).success
      ).toBe(false);
    });

    it("rejects missing dataType", () => {
      expect(createCategorySchema.safeParse({ name: "Test" }).success).toBe(false);
    });

    it("rejects missing name", () => {
      expect(createCategorySchema.safeParse({ dataType: "Number" }).success).toBe(false);
    });

    it("rejects currency exceeding 10 characters", () => {
      const result = createCategorySchema.safeParse({
        name: "Test",
        dataType: "Currency",
        currency: "a".repeat(11),
      });
      expect(result.success).toBe(false);
    });

    it("rejects description exceeding 2000 characters", () => {
      const result = createCategorySchema.safeParse({
        name: "Test",
        dataType: "Number",
        description: "a".repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it("rejects wrong types for fields", () => {
      expect(
        createCategorySchema.safeParse({ name: 123, dataType: "Number" }).success
      ).toBe(false);
      expect(
        createCategorySchema.safeParse({ name: "Test", dataType: "Number", currency: 42 }).success
      ).toBe(false);
    });
  });

  describe("updateCategorySchema", () => {
    it("accepts empty object (all fields optional)", () => {
      expect(updateCategorySchema.safeParse({}).success).toBe(true);
    });

    it("accepts any single field update", () => {
      expect(updateCategorySchema.safeParse({ name: "New Name" }).success).toBe(true);
      expect(updateCategorySchema.safeParse({ dataType: "Percentage" }).success).toBe(true);
      expect(updateCategorySchema.safeParse({ currency: "GBP" }).success).toBe(true);
      expect(updateCategorySchema.safeParse({ description: "Updated" }).success).toBe(true);
    });

    it("rejects empty name when provided", () => {
      expect(updateCategorySchema.safeParse({ name: "" }).success).toBe(false);
    });

    it("rejects invalid dataType when provided", () => {
      expect(updateCategorySchema.safeParse({ dataType: "Text" }).success).toBe(false);
    });

    it("accepts null for nullable fields", () => {
      expect(updateCategorySchema.safeParse({ currency: null }).success).toBe(true);
      expect(updateCategorySchema.safeParse({ description: null }).success).toBe(true);
    });

    it("enforces max lengths on update", () => {
      expect(updateCategorySchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
      expect(updateCategorySchema.safeParse({ currency: "a".repeat(11) }).success).toBe(false);
      expect(updateCategorySchema.safeParse({ description: "a".repeat(2001) }).success).toBe(false);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  settingsSchema
 * ════════════════════════════════════════════════════════════════════════════ */

describe("settingsSchema", () => {
  describe("updateProfileSchema", () => {
    it("accepts all fields together", () => {
      const result = updateProfileSchema.safeParse({
        firstName: "Alice",
        lastName: "Smith",
        country: "US",
        timezone: "America/New_York",
        bio: "Hello world",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object", () => {
      expect(updateProfileSchema.safeParse({}).success).toBe(true);
    });

    it("accepts null for nullable fields", () => {
      expect(updateProfileSchema.safeParse({ country: null }).success).toBe(true);
      expect(updateProfileSchema.safeParse({ timezone: null }).success).toBe(true);
      expect(updateProfileSchema.safeParse({ bio: null }).success).toBe(true);
    });

    it("rejects empty firstName when provided", () => {
      expect(updateProfileSchema.safeParse({ firstName: "" }).success).toBe(false);
    });

    it("rejects empty lastName when provided", () => {
      expect(updateProfileSchema.safeParse({ lastName: "" }).success).toBe(false);
    });

    it("enforces firstName max 50", () => {
      expect(updateProfileSchema.safeParse({ firstName: "a".repeat(51) }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ firstName: "a".repeat(50) }).success).toBe(true);
    });

    it("enforces lastName max 50", () => {
      expect(updateProfileSchema.safeParse({ lastName: "a".repeat(51) }).success).toBe(false);
    });

    it("enforces country max 5", () => {
      expect(updateProfileSchema.safeParse({ country: "a".repeat(6) }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ country: "US" }).success).toBe(true);
    });

    it("enforces timezone max 100", () => {
      expect(updateProfileSchema.safeParse({ timezone: "a".repeat(101) }).success).toBe(false);
    });

    it("enforces bio max 275", () => {
      expect(updateProfileSchema.safeParse({ bio: "a".repeat(276) }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ bio: "a".repeat(275) }).success).toBe(true);
    });

    it("rejects wrong types", () => {
      expect(updateProfileSchema.safeParse({ firstName: 123 }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ bio: true }).success).toBe(false);
    });
  });

  describe("updateCompanySchema", () => {
    it("accepts valid hex accentColor", () => {
      expect(updateCompanySchema.safeParse({ accentColor: "#FF5733" }).success).toBe(true);
      expect(updateCompanySchema.safeParse({ accentColor: "#000000" }).success).toBe(true);
      expect(updateCompanySchema.safeParse({ accentColor: "#ffffff" }).success).toBe(true);
      expect(updateCompanySchema.safeParse({ accentColor: "#aAbBcC" }).success).toBe(true);
    });

    it("rejects invalid hex colors", () => {
      expect(updateCompanySchema.safeParse({ accentColor: "red" }).success).toBe(false);
      expect(updateCompanySchema.safeParse({ accentColor: "#FFF" }).success).toBe(false);
      expect(updateCompanySchema.safeParse({ accentColor: "#GGGGGG" }).success).toBe(false);
      expect(updateCompanySchema.safeParse({ accentColor: "FF5733" }).success).toBe(false);
      expect(updateCompanySchema.safeParse({ accentColor: "#FF57331" }).success).toBe(false);
    });

    it("accepts valid themeMode values", () => {
      for (const mode of ["light", "dark", "system"] as const) {
        expect(updateCompanySchema.safeParse({ themeMode: mode }).success).toBe(true);
      }
    });

    it("rejects invalid themeMode", () => {
      expect(updateCompanySchema.safeParse({ themeMode: "neon" }).success).toBe(false);
      expect(updateCompanySchema.safeParse({ themeMode: "" }).success).toBe(false);
    });

    it("accepts empty object (all optional)", () => {
      expect(updateCompanySchema.safeParse({}).success).toBe(true);
    });

    it("accepts both fields together", () => {
      expect(
        updateCompanySchema.safeParse({ accentColor: "#123ABC", themeMode: "dark" }).success
      ).toBe(true);
    });
  });

  describe("updateConfigurationsSchema", () => {
    it("accepts a valid flags array", () => {
      const result = updateConfigurationsSchema.safeParse({
        flags: [
          { key: "feature_x", enabled: true },
          { key: "feature_y", enabled: false, value: "beta" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts flag with only key (enabled and value optional)", () => {
      const result = updateConfigurationsSchema.safeParse({
        flags: [{ key: "some_flag" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts flag with null value", () => {
      const result = updateConfigurationsSchema.safeParse({
        flags: [{ key: "flag", enabled: true, value: null }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty flags array", () => {
      const result = updateConfigurationsSchema.safeParse({ flags: [] });
      expect(result.success).toBe(true);
    });

    it("rejects missing flags", () => {
      expect(updateConfigurationsSchema.safeParse({}).success).toBe(false);
    });

    it("rejects flags as non-array", () => {
      expect(updateConfigurationsSchema.safeParse({ flags: "not-an-array" }).success).toBe(false);
    });

    it("rejects flag item missing key", () => {
      expect(
        updateConfigurationsSchema.safeParse({ flags: [{ enabled: true }] }).success
      ).toBe(false);
    });

    it("rejects flag with non-string key", () => {
      expect(
        updateConfigurationsSchema.safeParse({ flags: [{ key: 123 }] }).success
      ).toBe(false);
    });

    it("rejects flag with non-boolean enabled", () => {
      expect(
        updateConfigurationsSchema.safeParse({ flags: [{ key: "x", enabled: "yes" }] }).success
      ).toBe(false);
    });

    it("rejects flag with non-string value", () => {
      expect(
        updateConfigurationsSchema.safeParse({ flags: [{ key: "x", value: 42 }] }).success
      ).toBe(false);
    });
  });
});

