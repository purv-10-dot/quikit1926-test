/**
 * FR-RE Phase 1 — multi-value status condition (is_any_of / is_none_of) contract.
 *
 * The rule-builder UI gains a multi-select value input; the engine, persistence,
 * and runtime ALREADY carry value SETS (proven Stage 4 + earlier traces). This
 * test LOCKS the persistence/arity contract the new UI depends on:
 *   - a multi-value operator persists ALL values, in order, read back by getFormRules;
 *   - single-value operators stay exactly-one; arity violations are rejected.
 *
 * The multi-select WIDGET itself (operators offered, multi vs single input) is a
 * .tsx/DOM change and is browser-verified — a node integration test can't reach
 * it. This test guards the contract beneath that widget so a future change can't
 * silently break the round-trip. The ordering assertion (toEqual on the array) is
 * the one with real failure teeth: it catches a JSON-storage reorder bug.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormRule, addRuleCondition, getFormRules } from "@/lib/services/forms/form-rule.service";

const STAMP = Date.now();
const TENANT = `int_mv_${STAMP}`;
let setId: string;
let versionId: string;

beforeAll(async () => {
  const set = await db.crmFormSet.create({
    data: { tenantId: TENANT, surface: "call_disposition", name: `Set ${STAMP}`, isDefault: true },
  });
  setId = set.id;
  versionId = (await db.crmFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  })).id;
});

afterAll(async () => {
  const rules = await db.crmFormRule.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const rids = rules.map((r) => r.id);
  if (rids.length) {
    await db.crmFormRuleCondition.deleteMany({ where: { formRuleId: { in: rids } } });
    await db.crmFormRule.deleteMany({ where: { id: { in: rids } } });
  }
  await db.crmFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.crmFormSet.deleteMany({ where: { id: setId } });
});

describe("Phase 1 — is_any_of persists the full value SET (ordered)", () => {
  it("valueKeys [A,B,C] round-trips through getFormRules at length 3, in order", async () => {
    const rule = await createFormRule({ formSetVersionId: versionId, name: "any-of-3", matchType: "all", sortOrder: 0 });
    await addRuleCondition({
      formRuleId: rule.id, subjectKind: "status", operator: "is_any_of",
      valueKeys: ["Callback Requested", "Demo Scheduled", "Payment Done"], sortOrder: 0,
    });

    const read = await getFormRules(versionId);
    const cond = read.find((r) => r.id === rule.id)!.conditions[0];
    expect(cond.operator).toBe("is_any_of");
    // Genuine-signal assertion: order must survive JSON storage round-trip.
    expect(cond.valueKeys).toEqual(["Callback Requested", "Demo Scheduled", "Payment Done"]);
  });
});

describe("Phase 1 — containment: single-value operators stay length 1, arity enforced", () => {
  it("'is' with one value persists length 1", async () => {
    const rule = await createFormRule({ formSetVersionId: versionId, name: "is-one", matchType: "all", sortOrder: 1 });
    await addRuleCondition({
      formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["Demo Scheduled"], sortOrder: 0,
    });
    const read = await getFormRules(versionId);
    expect(read.find((r) => r.id === rule.id)!.conditions[0].valueKeys).toEqual(["Demo Scheduled"]);
  });

  it("'is' with TWO values is rejected (arity)", async () => {
    const rule = await createFormRule({ formSetVersionId: versionId, name: "is-two-bad", matchType: "all", sortOrder: 2 });
    await expect(
      addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["A", "B"], sortOrder: 0 }),
    ).rejects.toThrow();
  });

  it("'is_any_of' with ZERO values is rejected (arity)", async () => {
    const rule = await createFormRule({ formSetVersionId: versionId, name: "anyof-zero-bad", matchType: "all", sortOrder: 3 });
    await expect(
      addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is_any_of", valueKeys: [], sortOrder: 0 }),
    ).rejects.toThrow();
  });
});
