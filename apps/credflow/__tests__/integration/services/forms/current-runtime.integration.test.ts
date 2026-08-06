/**
 * FR-RE Slice 1 Step 0 — agent-facing "current live runtime" resolver, real DB.
 *
 * The agent can't discover the live version (the by-id runtime route needs a
 * versionId; the sets route is admin-gated). getCurrentDispositionRuntime
 * resolves the tenant's live (published, default) call_disposition version and
 * returns its runtime, or null when no form is live (legacy tenants).
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormSet } from "@/lib/services/forms/form-set.service";
import { createFormField } from "@/lib/services/forms/form-structure.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";
import { getCurrentDispositionRuntime } from "@/lib/services/forms/form-runtime.service";

const STAMP = Date.now();
const TENANT = `int_frre_curr_${STAMP}`;
const EMPTY_TENANT = `int_frre_curr_none_${STAMP}`;
let setId: string;
let versionId: string;

afterAll(async () => {
  const tabs = await db.crmFormTab.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const fields = await db.crmFormField.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  if (fields.length) await db.crmFormFieldOption.deleteMany({ where: { formFieldId: { in: fields.map((f) => f.id) } } });
  await db.crmFormField.deleteMany({ where: { formSetVersionId: versionId } });
  if (tabs.length) await db.crmFormSection.deleteMany({ where: { formTabId: { in: tabs.map((t) => t.id) } } });
  await db.crmFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await db.crmFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.crmFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.crmFormSet.deleteMany({ where: { id: setId } });
});

describe("getCurrentDispositionRuntime", () => {
  it("returns null when the tenant has no live (published) form set", async () => {
    expect(await getCurrentDispositionRuntime(EMPTY_TENANT)).toBeNull();
  });

  it("resolves the live published version's runtime (structure + EvalRule rules)", async () => {
    const { set, version } = await createFormSet({ tenantId: TENANT, name: `Curr ${STAMP}` });
    setId = set.id;
    versionId = version.id;
    await createFormField({
      formSetVersionId: versionId, fieldKey: "payment_mode", label: "Payment Mode", fieldType: "dropdown", sortOrder: 10,
      options: [{ valueKey: "invoice", label: "Invoice" }],
    });

    // Before publish there is no live version -> null.
    expect(await getCurrentDispositionRuntime(TENANT)).toBeNull();

    await publishVersion(versionId);

    const runtime = await getCurrentDispositionRuntime(TENANT);
    expect(runtime).not.toBeNull();
    expect(runtime!.versionId).toBe(versionId);
    expect(runtime!.fields.some((f) => f.fieldKey === "payment_mode")).toBe(true);
    expect(Array.isArray(runtime!.rules)).toBe(true);
  });
});
