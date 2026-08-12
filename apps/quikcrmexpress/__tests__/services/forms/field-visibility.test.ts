/**
 * FR-RE Stage 2a — pure field/tab visibility helpers (extracted from the modal).
 *
 * These encode the show/hide/reveal logic that BOTH the clean FR-RE view and the
 * legacy fallback render from. Locking them as pure functions proves the extract
 * preserves behavior (and is the failing-test-first for Stage 2a).
 *
 *   fieldVisible(field, decision)            — rule show/hide, else defaultVisibility
 *   tabVisible(tab, decision)                — always-tab always; rule-driven only if revealed
 *   fieldRendered(field, decision, tabsById) — a field on a hidden tab never renders
 *
 * RED until lib/services/forms/field-visibility.ts exists (helpers still inlined
 * in call-disposition-modal).
 */
import { describe, it, expect } from "vitest";
import { fieldVisible, tabVisible, fieldRendered } from "@/lib/services/forms/field-visibility";

type Dec = {
  fieldVisibility: Record<string, "show" | "hide">;
  tabsToShow: string[];
};
const decision = (over: Partial<Dec> = {}): Dec => ({
  fieldVisibility: {},
  tabsToShow: [],
  ...over,
});

const field = (fieldKey: string, defaultVisibility: string, formTabId: string | null = null) => ({
  fieldKey,
  defaultVisibility,
  formTabId,
});
const tab = (id: string, visibility: string) => ({ id, visibility });

describe("fieldVisible — rule show/hide overrides, else defaultVisibility", () => {
  it("rule 'show' => visible even when default-hidden", () => {
    expect(fieldVisible(field("f", "hidden"), decision({ fieldVisibility: { f: "show" } }))).toBe(true);
  });
  it("rule 'hide' => hidden even when default-visible", () => {
    expect(fieldVisible(field("f", "visible"), decision({ fieldVisibility: { f: "hide" } }))).toBe(false);
  });
  it("no rule + default visible => visible", () => {
    expect(fieldVisible(field("f", "visible"), decision())).toBe(true);
  });
  it("no rule + default hidden => hidden", () => {
    expect(fieldVisible(field("f", "hidden"), decision())).toBe(false);
  });
  it("null decision => governed by defaultVisibility", () => {
    expect(fieldVisible(field("f", "visible"), null)).toBe(true);
    expect(fieldVisible(field("f", "hidden"), null)).toBe(false);
  });
});

describe("tabVisible — always vs rule-driven", () => {
  it("'always' tab is always visible (regardless of tabsToShow)", () => {
    expect(tabVisible(tab("t", "always"), decision())).toBe(true);
  });
  it("'rule_driven' tab visible only when in tabsToShow", () => {
    expect(tabVisible(tab("t", "rule_driven"), decision({ tabsToShow: ["t"] }))).toBe(true);
    expect(tabVisible(tab("t", "rule_driven"), decision({ tabsToShow: ["other"] }))).toBe(false);
  });
  it("'rule_driven' tab hidden when decision is null", () => {
    expect(tabVisible(tab("t", "rule_driven"), null)).toBe(false);
  });
});

describe("fieldRendered — a field on a hidden tab never renders", () => {
  const tabsById = new Map([
    ["always_tab", tab("always_tab", "always")],
    ["rd_tab", tab("rd_tab", "rule_driven")],
  ]);

  it("unassigned visible field => rendered", () => {
    expect(fieldRendered(field("f", "visible", null), decision(), tabsById)).toBe(true);
  });
  it("field on an always-tab, visible => rendered", () => {
    expect(fieldRendered(field("f", "visible", "always_tab"), decision(), tabsById)).toBe(true);
  });
  it("field on a rule-driven tab NOT revealed => NOT rendered (even if the field itself is visible)", () => {
    expect(fieldRendered(field("f", "visible", "rd_tab"), decision({ tabsToShow: [] }), tabsById)).toBe(false);
  });
  it("field on a rule-driven tab revealed + field visible => rendered", () => {
    expect(fieldRendered(field("f", "visible", "rd_tab"), decision({ tabsToShow: ["rd_tab"] }), tabsById)).toBe(true);
  });
  it("field on a revealed tab but default-hidden with no rule => NOT rendered (field-level hides it)", () => {
    expect(fieldRendered(field("f", "hidden", "rd_tab"), decision({ tabsToShow: ["rd_tab"] }), tabsById)).toBe(false);
  });
});
