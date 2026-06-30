/**
 * Unit tests for the business-event activity helpers that back the Global
 * Activities feed. These are pure functions (no DB) — they decide WHICH fields
 * changed and HOW the change summary reads in the feed.
 */
import { describe, expect, it } from "vitest";
import {
  summariseChangedFields,
  changedKeys,
  BUSINESS_EVENT_TYPES,
} from "@/lib/services/activities/business-events";
import { normaliseRelatedKind } from "@/lib/services/activities/related-kind";

describe("summariseChangedFields", () => {
  it("maps known field keys to friendly labels", () => {
    expect(summariseChangedFields(["email", "ownerId", "stage"])).toBe(
      "Email, Owner, Stage",
    );
  });

  it("title-cases unknown field keys", () => {
    expect(summariseChangedFields(["customWeirdField"])).toBe("Custom Weird Field");
  });

  it("truncates beyond the limit with a +N more suffix", () => {
    const many = ["name", "email", "phone", "company", "country", "industry", "website"];
    expect(summariseChangedFields(many)).toBe(
      "Name, Email, Phone, Company, Country, Industry +1 more",
    );
  });

  it("returns an empty string for no fields", () => {
    expect(summariseChangedFields([])).toBe("");
  });
});

describe("changedKeys", () => {
  it("detects scalar changes among the requested keys only", () => {
    const before = { name: "A", email: "a@x.co", phone: "1" };
    const after = { name: "B", email: "a@x.co", phone: "2" };
    expect(changedKeys(before, after, ["name", "email"])).toEqual(["name"]);
  });

  it("treats null / undefined / empty-string as equal (no spurious change)", () => {
    const before = { a: null, b: undefined, c: "" };
    const after = { a: "", b: null, c: undefined };
    expect(changedKeys(before, after, ["a", "b", "c"])).toEqual([]);
  });

  it("compares Dates by value", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const before = { closeDate: new Date("2026-01-01T00:00:00Z") };
    const after = { closeDate: d };
    expect(changedKeys(before, after, ["closeDate"])).toEqual([]);
    const after2 = { closeDate: new Date("2026-02-01T00:00:00Z") };
    expect(changedKeys(before, after2, ["closeDate"])).toEqual(["closeDate"]);
  });

  it("compares objects (e.g. dynamicFields) structurally", () => {
    const before = { dynamicFields: { x: 1 } };
    const same = { dynamicFields: { x: 1 } };
    const diff = { dynamicFields: { x: 2 } };
    expect(changedKeys(before, same, ["dynamicFields"])).toEqual([]);
    expect(changedKeys(before, diff, ["dynamicFields"])).toEqual(["dynamicFields"]);
  });
});

describe("BUSINESS_EVENT_TYPES", () => {
  it("never collides with the suppressed LeadSystem init type", () => {
    // Rows of type "LeadSystem" are filtered OUT of the feed. None of the
    // business events may reuse that reserved type, or they'd be hidden.
    for (const t of Object.values(BUSINESS_EVENT_TYPES)) {
      expect(t).not.toBe("LeadSystem");
    }
  });
});

describe("normaliseRelatedKind", () => {
  it("normalises any casing of the four account-scoped kinds", () => {
    expect(normaliseRelatedKind("lead")).toBe("Lead");
    expect(normaliseRelatedKind("Lead")).toBe("Lead");
    expect(normaliseRelatedKind("ACCOUNT")).toBe("Account");
    expect(normaliseRelatedKind("Opportunity")).toBe("Opportunity");
    expect(normaliseRelatedKind(" contact ")).toBe("Contact");
  });

  it("returns null for kinds the activity ACL cannot scope (quote/order/unknown/empty)", () => {
    expect(normaliseRelatedKind("quote")).toBeNull();
    expect(normaliseRelatedKind("order")).toBeNull();
    expect(normaliseRelatedKind("global")).toBeNull();
    expect(normaliseRelatedKind("")).toBeNull();
    expect(normaliseRelatedKind(null)).toBeNull();
    expect(normaliseRelatedKind(undefined)).toBeNull();
  });
});
