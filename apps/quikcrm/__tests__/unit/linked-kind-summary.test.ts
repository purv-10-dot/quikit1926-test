import { describe, expect, it } from "vitest";
import {
  summarizeByLinkedKind,
  linkedKindLabel,
} from "@/lib/services/activities/linked-kind-summary";

describe("summarizeByLinkedKind", () => {
  it("labels the 'None' sentinel as Standalone", () => {
    const out = summarizeByLinkedKind([{ relatedKind: "None", count: 41 }]);
    expect(out).toEqual([{ kind: "None", label: "Standalone", count: 41 }]);
  });

  it("merges case variants into one bucket (DB holds both 'Lead' and 'lead')", () => {
    const out = summarizeByLinkedKind([
      { relatedKind: "Lead", count: 10 },
      { relatedKind: "lead", count: 2 },
    ]);
    expect(out).toEqual([{ kind: "Lead", label: "Lead", count: 12 }]);
  });

  it("drops groups with no records", () => {
    const out = summarizeByLinkedKind([
      { relatedKind: "Lead", count: 3 },
      { relatedKind: "Contact", count: 0 },
    ]);
    expect(out.map((g) => g.kind)).toEqual(["Lead"]);
  });

  it("orders canonical kinds first and pins Standalone last", () => {
    const out = summarizeByLinkedKind([
      { relatedKind: "None", count: 41 },
      { relatedKind: "Account", count: 5 },
      { relatedKind: "Lead", count: 12 },
      { relatedKind: "Opportunity", count: 3 },
      { relatedKind: "Contact", count: 8 },
    ]);
    expect(out.map((g) => g.label)).toEqual([
      "Lead",
      "Opportunity",
      "Contact",
      "Account",
      "Standalone",
    ]);
  });

  it("keeps unrecognized kinds between known kinds and Standalone", () => {
    const out = summarizeByLinkedKind([
      { relatedKind: "None", count: 1 },
      { relatedKind: "Zebra", count: 2 },
      { relatedKind: "Lead", count: 3 },
    ]);
    expect(out.map((g) => g.kind)).toEqual(["Lead", "Zebra", "None"]);
  });

  it("treats an empty kind string as Standalone rather than a blank chip", () => {
    const out = summarizeByLinkedKind([{ relatedKind: "   ", count: 4 }]);
    expect(out).toEqual([{ kind: "None", label: "Standalone", count: 4 }]);
  });

  it("returns nothing for an empty result set", () => {
    expect(summarizeByLinkedKind([])).toEqual([]);
  });

  it("never emits a 'Prospect' bucket (not an activity kind)", () => {
    const out = summarizeByLinkedKind([{ relatedKind: "Lead", count: 1 }]);
    expect(out.some((g) => g.label === "Prospect")).toBe(false);
  });
});

describe("linkedKindLabel", () => {
  it("maps None → Standalone and passes others through", () => {
    expect(linkedKindLabel("None")).toBe("Standalone");
    expect(linkedKindLabel("Lead")).toBe("Lead");
  });
});
