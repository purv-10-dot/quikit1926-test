/**
 * FR-RE Slice 2 (show_field/show_tab) Part 1 — defaultVisibility, real DB.
 *
 * A field/tab can be created HIDDEN (rule-driven), and the agent runtime carries
 * that visibility so the client can keep it hidden until a rule reveals it.
 *   - createFormField({ defaultVisibility: "hidden" }) persists hidden.
 *   - createFormTab({ visibility: "rule_driven" }) persists rule-driven.
 *   - getFormRuntime serves both visibility flags.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormSet } from "@/lib/services/forms/form-set.service";
import { createFormField, createFormTab } from "@/lib/services/forms/form-structure.service";
import { getFormRuntime } from "@/lib/services/forms/form-runtime.service";

const STAMP = Date.now();
const TENANT = `int_frre_vis_${STAMP}`;
let setId: string;
let versionId: string;

afterAll(async () => {
  const tabs = await db.qcfFormTab.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const fields = await db.qcfFormField.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  if (fields.length) await db.qcfFormFieldOption.deleteMany({ where: { formFieldId: { in: fields.map((f) => f.id) } } });
  await db.qcfFormField.deleteMany({ where: { formSetVersionId: versionId } });
  if (tabs.length) await db.qcfFormSection.deleteMany({ where: { formTabId: { in: tabs.map((t) => t.id) } } });
  await db.qcfFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await db.qcfFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qcfFormSet.deleteMany({ where: { id: setId } });
});

describe("defaultVisibility — hidden field + rule_driven tab persist and serve in the runtime", () => {
  it("creates a hidden field and a rule_driven tab, both reflected in getFormRuntime", async () => {
    const { set, version } = await createFormSet({ orgId: TENANT, name: `Vis ${STAMP}` });
    setId = set.id;
    versionId = version.id;

    const tab = await createFormTab({
      formSetVersionId: versionId,
      name: "Payment Details",
      visibility: "rule_driven",
      sortOrder: 5,
    });

    const hidden = await createFormField({
      formSetVersionId: versionId,
      fieldKey: "txn_ref",
      label: "Txn Ref",
      fieldType: "text",
      sortOrder: 10,
      formTabId: tab.id,
      defaultVisibility: "hidden",
    });
    expect(hidden.defaultVisibility).toBe("hidden"); // persisted hidden

    const visible = await createFormField({
      formSetVersionId: versionId,
      fieldKey: "always_here",
      label: "Always Here",
      fieldType: "text",
      sortOrder: 11,
    });
    expect(visible.defaultVisibility).toBe("visible"); // default unchanged

    const runtime = await getFormRuntime(versionId, TENANT);

    const rtTab = runtime.tabs.find((t) => t.id === tab.id);
    expect(rtTab?.visibility).toBe("rule_driven"); // tab visibility served

    const rtHidden = runtime.fields.find((f) => f.fieldKey === "txn_ref");
    expect(rtHidden?.defaultVisibility).toBe("hidden"); // field visibility served
    expect(rtHidden?.formTabId).toBe(tab.id); // placement served (for tab grouping)
  });
});
