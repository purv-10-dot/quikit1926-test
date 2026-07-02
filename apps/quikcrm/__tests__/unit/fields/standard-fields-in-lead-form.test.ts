/**
 * Pins the contract that the settings "Standard fields" list (which filters
 * STANDARD_LEAD_FIELDS by `inLeadForm`) stays in sync with the standard fields
 * actually rendered in the Add Lead form (components/leads/lead-form-view.tsx).
 *
 * `EXPECTED_FORM_KEYS` mirrors the hand-written form JSX. If a standard field is
 * added to / removed from the form, update both the `inLeadForm` flag in
 * types/field-definition.ts AND this set — this test is the tripwire that forces
 * the two to move together.
 *
 * Requirement-only standard fields (topic, technology, budget, timeframe,
 * description) live in `requirementDetails`, NOT the main form, so they must NOT
 * carry the flag and must NOT show up in the settings list.
 */
import { describe, expect, it } from "vitest";
import {
  STANDARD_LEAD_FIELDS,
  SYSTEM_LEAD_FIELDS,
  SYSTEM_KEYS,
  STANDARD_KEYS,
} from "@/types/field-definition";
import { GRID_RENDERABLE_STANDARD_KEYS } from "@/components/leads/lead-table";

// Standard-field keys the Add Lead form (lead-form-view.tsx) renders today.
const EXPECTED_FORM_KEYS = new Set([
  // Section 1 — Lead Information
  "name",
  "ownerName",
  "source",
  "stage",
  "status",
  "score",
  "jobTitle",
  // Section 2 — Company Information
  "company",
  "industry",
  "annualRevenueDisplay",
  "website",
  "linkedinUrl",
  // Section 3 — Contact Information
  "email",
  "secondaryEmail",
  "phone",
  "mobile",
]);

// Standard fields that are NOT in the main form (requirementDetails-only).
const EXPECTED_NON_FORM_KEYS = new Set([
  "descriptionInformation",
  "topic",
  "technology",
  "budgetAmount",
  "purchaseTimeframe",
]);

describe("STANDARD_LEAD_FIELDS / Add Lead form sync", () => {
  const flagged = new Set(STANDARD_LEAD_FIELDS.filter((f) => f.inLeadForm).map((f) => f.key));

  it("flags exactly the fields the Add Lead form renders", () => {
    expect(flagged).toEqual(EXPECTED_FORM_KEYS);
  });

  it("does not flag requirement-only fields", () => {
    for (const key of EXPECTED_NON_FORM_KEYS) {
      const def = STANDARD_LEAD_FIELDS.find((f) => f.key === key);
      expect(def, `missing standard field "${key}"`).toBeTruthy();
      expect(def!.inLeadForm, `"${key}" must not be in the lead form`).toBeFalsy();
    }
  });

  it("every flagged field is a standard field", () => {
    for (const f of STANDARD_LEAD_FIELDS) {
      if (f.inLeadForm) expect(f.isStandard).toBe(true);
    }
  });

  it("flagged + requirement-only keys partition all standard fields", () => {
    const all = new Set(STANDARD_LEAD_FIELDS.map((f) => f.key));
    const union = new Set([...EXPECTED_FORM_KEYS, ...EXPECTED_NON_FORM_KEYS]);
    expect(union).toEqual(all);
  });
});

/**
 * Three-way sync: the form-rendered standard fields (`inLeadForm`) must be
 * exactly the standard fields the Leads grid can render
 * (GRID_RENDERABLE_STANDARD_KEYS). This guarantees the Column picker /
 * Hide-columns list (which offers `inLeadForm` standard fields) never surfaces a
 * column the grid renders blank, and never hides a renderable one.
 */
describe("Standard fields / Leads-grid column sync", () => {
  const formKeys = new Set(STANDARD_LEAD_FIELDS.filter((f) => f.inLeadForm).map((f) => f.key));
  const gridKeys = new Set<string>(GRID_RENDERABLE_STANDARD_KEYS);

  it("every form-rendered standard field is renderable by the grid", () => {
    for (const k of formKeys) {
      expect(gridKeys.has(k), `"${k}" is in the form but the grid can't render it`).toBe(true);
    }
  });

  it("every grid-renderable standard key is a form-rendered standard field", () => {
    for (const k of gridKeys) {
      expect(formKeys.has(k), `"${k}" is grid-renderable but not in the Add Lead form`).toBe(true);
    }
  });

  it("the form set and the grid set are identical", () => {
    expect(gridKeys).toEqual(formKeys);
  });
});

/**
 * System fields (e.g. Created Date) are auto-managed columns: selectable +
 * sortable in the grid, but never part of the Add Lead form. They form a third
 * category distinct from form fields and requirement-only fields.
 */
describe("System fields (Created Date)", () => {
  it("includes a sortable, Date-typed Created Date column", () => {
    const created = SYSTEM_LEAD_FIELDS.find((f) => f.key === "createdAt");
    expect(created, "createdAt system field missing").toBeTruthy();
    expect(created!.label).toBe("Created Date");
    expect(created!.fieldType).toBe("Date");
  });

  it("reserves system keys so a custom field can't collide", () => {
    // STANDARD_KEYS is the reserved set used by the field repo — it must include
    // every system key as well as every standard key.
    for (const k of SYSTEM_KEYS) {
      expect(STANDARD_KEYS.has(k), `"${k}" must be reserved`).toBe(true);
    }
  });

  it("system fields are not in the Add Lead form (no inLeadForm flag)", () => {
    for (const f of SYSTEM_LEAD_FIELDS) {
      expect(f.inLeadForm, `"${f.key}" must not be a form field`).toBeFalsy();
    }
  });

  it("system keys are disjoint from form-derived grid keys", () => {
    const gridKeys = new Set<string>(GRID_RENDERABLE_STANDARD_KEYS);
    for (const k of SYSTEM_KEYS) {
      expect(gridKeys.has(k), `"${k}" is a system field; keep it out of GRID_RENDERABLE_STANDARD_KEYS`).toBe(false);
    }
  });

  it("system keys do not overlap STANDARD_LEAD_FIELDS keys", () => {
    const standardOnly = new Set(STANDARD_LEAD_FIELDS.map((f) => f.key));
    for (const k of SYSTEM_KEYS) {
      expect(standardOnly.has(k), `"${k}" should live in SYSTEM_LEAD_FIELDS only`).toBe(false);
    }
  });
});
