/**
 * FR-RE Unit 4 (FR-RE-1 / FR-RE-2) — rule + condition MODEL & builder.
 *
 * Unit 4 is the data structure Units 5 (actions) and 6 (evaluation) build on,
 * so the condition model must be right. This file pins:
 *   - validateConditionInput: the subject-kind <-> subjectFieldKey coupling and
 *     the operator <-> valueKeys shape (flat all/any match, NO nesting).
 *   - createFormRule / addRuleCondition: version-scoped, draft-only guard
 *     (mirrors Unit 2; Unit 7 upgrades the guard to clone-on-edit).
 *
 * Mocked Prisma (no real DB). RED until lib/services/forms/form-rule.service.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  validateConditionInput,
  createFormRule,
  addRuleCondition,
  FormRuleError,
} from "@/lib/services/forms/form-rule.service";

const db = mockDb();
const VERSION_ID = "ver_1";
const RULE_ID = "rule_1";
const draftVersion = { id: VERSION_ID, status: "draft" } as never;
const publishedVersion = { id: VERSION_ID, status: "published" } as never;

beforeEach(() => {
  db.crmFormSetVersion.findUnique.mockReset();
  db.crmFormRule.create.mockReset();
  db.crmFormRule.findUnique.mockReset();
  db.crmFormRuleCondition.create.mockReset();
  db.crmFormField.findFirst.mockReset();
});

describe("validateConditionInput — subject kind <-> subjectFieldKey", () => {
  it("subjectKind=field REQUIRES a subjectFieldKey", () => {
    expect(() =>
      validateConditionInput({ subjectKind: "field", operator: "is", valueKeys: ["x"] }),
    ).toThrow(FormRuleError);
  });

  it("subjectKind=field WITH a fieldKey is valid", () => {
    expect(() =>
      validateConditionInput({
        subjectKind: "field",
        subjectFieldKey: "payment_mode",
        operator: "is",
        valueKeys: ["upi"],
      }),
    ).not.toThrow();
  });

  it.each(["stage", "status", "sub_stage"] as const)(
    "subjectKind=%s must NOT carry a subjectFieldKey",
    (subjectKind) => {
      expect(() =>
        validateConditionInput({
          subjectKind,
          subjectFieldKey: "should_not_be_here",
          operator: "is",
          valueKeys: ["v"],
        }),
      ).toThrow(FormRuleError);
    },
  );

  it.each(["stage", "status", "sub_stage"] as const)(
    "subjectKind=%s with no fieldKey is valid",
    (subjectKind) => {
      expect(() =>
        validateConditionInput({ subjectKind, operator: "is", valueKeys: ["v"] }),
      ).not.toThrow();
    },
  );
});

describe("validateConditionInput — operator <-> valueKeys shape", () => {
  it.each(["is", "is_not"] as const)("%s requires EXACTLY one value", (operator) => {
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator, valueKeys: ["only"] }),
    ).not.toThrow();
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator, valueKeys: [] }),
    ).toThrow(FormRuleError);
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator, valueKeys: ["a", "b"] }),
    ).toThrow(FormRuleError);
  });

  it.each(["is_any_of", "is_none_of"] as const)("%s requires at least one value", (operator) => {
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator, valueKeys: ["a", "b"] }),
    ).not.toThrow();
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator, valueKeys: [] }),
    ).toThrow(FormRuleError);
  });

  it.each(["is_empty", "is_not_empty"] as const)("%s must carry NO values", (operator) => {
    expect(() =>
      validateConditionInput({ subjectKind: "field", subjectFieldKey: "f", operator }),
    ).not.toThrow();
    expect(() =>
      validateConditionInput({
        subjectKind: "field",
        subjectFieldKey: "f",
        operator,
        valueKeys: ["x"],
      }),
    ).toThrow(FormRuleError);
  });

  it("rejects empty-string value entries", () => {
    expect(() =>
      validateConditionInput({ subjectKind: "status", operator: "is", valueKeys: [""] }),
    ).toThrow(FormRuleError);
  });
});

describe("createFormRule / addRuleCondition — draft-only guard", () => {
  it("createFormRule creates an all-match rule on a draft version", async () => {
    db.crmFormSetVersion.findUnique.mockResolvedValue(draftVersion);
    db.crmFormRule.create.mockResolvedValue({ id: RULE_ID } as never);

    await createFormRule({
      formSetVersionId: VERSION_ID,
      name: "Show GST fields",
      matchType: "all",
      sortOrder: 0,
    });

    expect(db.crmFormRule.create).toHaveBeenCalledOnce();
    const arg = db.crmFormRule.create.mock.calls[0]![0] as { data: { matchType: string } };
    expect(arg.data.matchType).toBe("all");
  });

  it("createFormRule REJECTS a published (frozen) version", async () => {
    db.crmFormSetVersion.findUnique.mockResolvedValue(publishedVersion);
    // Draft guard is the SHARED assertDraft (FormStructureError, statusCode 409);
    // assert the behaviour, not the class.
    await expect(
      createFormRule({ formSetVersionId: VERSION_ID, name: "x", matchType: "any", sortOrder: 0 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.crmFormRule.create).not.toHaveBeenCalled();
  });

  it("addRuleCondition validates the condition AND checks the draft guard before writing", async () => {
    db.crmFormRule.findUnique.mockResolvedValue({ id: RULE_ID, formSetVersionId: VERSION_ID } as never);
    db.crmFormSetVersion.findUnique.mockResolvedValue(draftVersion);

    // Invalid (field without fieldKey) must throw before any create.
    await expect(
      addRuleCondition({ formRuleId: RULE_ID, subjectKind: "field", operator: "is", valueKeys: ["x"], sortOrder: 0 }),
    ).rejects.toBeInstanceOf(FormRuleError);
    expect(db.crmFormRuleCondition.create).not.toHaveBeenCalled();
  });

  it("addRuleCondition enforces validate-at-build: a nonexistent field reference is rejected", async () => {
    db.crmFormRule.findUnique.mockResolvedValue({ id: RULE_ID, formSetVersionId: VERSION_ID } as never);
    db.crmFormSetVersion.findUnique.mockResolvedValue(draftVersion);
    db.crmFormField.findFirst.mockResolvedValue(null); // field does not exist

    await expect(
      addRuleCondition({
        formRuleId: RULE_ID,
        subjectKind: "field",
        subjectFieldKey: "ghost_field",
        operator: "is",
        valueKeys: ["x"],
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(FormRuleError);
    expect(db.crmFormRuleCondition.create).not.toHaveBeenCalled();
  });
});
