/**
 * FR-RE Unit 5 (FR-RE-A1..A7) — rule ACTION model & builder (shape validation).
 *
 * Six action types over targetKind field/tab/stage:
 *   show_field / hide_field / make_mandatory / make_optional  -> targetKind=field
 *   show_tab                                                  -> targetKind=tab
 *   set_stage                                                 -> targetKind=stage
 *
 * This file pins the pure SHAPE coupling (actionType <-> targetKind <-> which
 * target column is set). Structural existence (field/tab exists; FR-RE-A7a
 * status validity) is real-DB and lives in the integration suite.
 *
 * Mocked Prisma. RED until lib/services/forms/form-rule-action.service.ts.
 */
import { describe, it, expect } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  validateActionInput,
  FormRuleError,
} from "@/lib/services/forms/form-rule-action.service";

mockDb();

describe("validateActionInput — field actions (targetKind=field)", () => {
  it.each(["show_field", "hide_field", "make_mandatory", "make_optional"] as const)(
    "%s with targetKind=field + targetFieldKey is valid",
    (actionType) => {
      expect(() =>
        validateActionInput({ actionType, targetKind: "field", targetFieldKey: "gstin" }),
      ).not.toThrow();
    },
  );

  it.each(["show_field", "hide_field", "make_mandatory", "make_optional"] as const)(
    "%s WITHOUT a targetFieldKey is rejected",
    (actionType) => {
      expect(() => validateActionInput({ actionType, targetKind: "field" })).toThrow(FormRuleError);
    },
  );

  it("a field action with a mismatched targetKind is rejected", () => {
    expect(() =>
      validateActionInput({ actionType: "show_field", targetKind: "tab", targetTabId: "tab_1" }),
    ).toThrow(FormRuleError);
  });

  it("show_field and hide_field are BOTH valid shapes for the same field (hidden-wins resolved in Unit 6)", () => {
    expect(() =>
      validateActionInput({ actionType: "show_field", targetKind: "field", targetFieldKey: "f" }),
    ).not.toThrow();
    expect(() =>
      validateActionInput({ actionType: "hide_field", targetKind: "field", targetFieldKey: "f" }),
    ).not.toThrow();
  });
});

describe("validateActionInput — show_tab (targetKind=tab)", () => {
  it("show_tab with targetKind=tab + targetTabId is valid", () => {
    expect(() =>
      validateActionInput({ actionType: "show_tab", targetKind: "tab", targetTabId: "tab_1" }),
    ).not.toThrow();
  });

  it("show_tab without a targetTabId is rejected", () => {
    expect(() => validateActionInput({ actionType: "show_tab", targetKind: "tab" })).toThrow(
      FormRuleError,
    );
  });
});

describe("validateActionInput — set_stage (targetKind=stage)", () => {
  it("set_stage with a status target is valid (sub-status optional)", () => {
    expect(() =>
      validateActionInput({ actionType: "set_stage", targetKind: "stage", setStatusId: "Working" }),
    ).not.toThrow();
    expect(() =>
      validateActionInput({
        actionType: "set_stage",
        targetKind: "stage",
        setStatusId: "Working",
        setSubStatusId: "Awaiting Docs",
      }),
    ).not.toThrow();
  });

  it("set_stage WITHOUT a status target is rejected", () => {
    expect(() =>
      validateActionInput({ actionType: "set_stage", targetKind: "stage" }),
    ).toThrow(FormRuleError);
  });

  it("set_stage carrying a sub-status but NO status is rejected", () => {
    expect(() =>
      validateActionInput({ actionType: "set_stage", targetKind: "stage", setSubStatusId: "x" }),
    ).toThrow(FormRuleError);
  });
});

describe("validateActionInput — unsupported targetKind", () => {
  it("targetKind=section is rejected (no targetSectionId column; no action type needs it)", () => {
    expect(() =>
      validateActionInput({ actionType: "show_field", targetKind: "section", targetFieldKey: "f" }),
    ).toThrow(FormRuleError);
  });
});
