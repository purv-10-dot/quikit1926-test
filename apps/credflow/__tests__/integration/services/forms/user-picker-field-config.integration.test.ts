/**
 * user_picker — builder config contract-lock (GREEN, honestly labeled).
 *
 * createFormField ALREADY persists userPickerScope + userPickerMode, and
 * getVersionFields returns the full row, so the runtime the agent renders from
 * carries them. This locks that round-trip so the new builder UI's output
 * (scope/mode selects -> POST) is guaranteed consumable by the agent renderer.
 * Not dressed as RED — the persistence already works; this guards it.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormField } from "@/lib/services/forms/form-structure.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";
import { getCurrentDispositionRuntime } from "@/lib/services/forms/form-runtime.service";

const STAMP = Date.now();
const TENANT = `int_up_cfg_${STAMP}`;
let setId: string;
let versionId: string;

beforeAll(async () => {
  const set = await db.qcfFormSet.create({
    data: { tenantId: TENANT, surface: "call_disposition", name: `Set ${STAMP}`, isDefault: true },
  });
  setId = set.id;
  versionId = (await db.qcfFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  })).id;

  await createFormField({
    formSetVersionId: versionId, tab: "call_disposition",
    fieldKey: "assignees", label: "Assignees", fieldType: "user_picker",
    userPickerScope: "team", userPickerMode: "multi", sortOrder: 0,
  });
  await createFormField({
    formSetVersionId: versionId, tab: "call_disposition",
    fieldKey: "remark", label: "Remark", fieldType: "text", sortOrder: 1,
  });
  await publishVersion(versionId);
});

afterAll(async () => {
  await db.qcfFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await db.qcfFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qcfFormSet.deleteMany({ where: { id: setId } });
});

describe("user_picker field config — scope + mode persist and reach the runtime", () => {
  it("createFormField persists userPickerScope + userPickerMode", async () => {
    const field = await db.qcfFormField.findFirst({ where: { formSetVersionId: versionId, fieldKey: "assignees" } });
    expect(field!.userPickerScope).toBe("team");
    expect(field!.userPickerMode).toBe("multi");
  });

  it("the agent runtime carries scope + mode (what the renderer reads)", async () => {
    const rt = await getCurrentDispositionRuntime(TENANT);
    expect(rt).not.toBeNull();
    const field = rt!.fields.find((f) => f.fieldKey === "assignees")!;
    expect(field.userPickerScope).toBe("team");
    expect(field.userPickerMode).toBe("multi");
  });

  it("CONTAINMENT: a non-user_picker field leaves scope/mode null", async () => {
    const field = await db.qcfFormField.findFirst({ where: { formSetVersionId: versionId, fieldKey: "remark" } });
    expect(field!.userPickerScope).toBeNull();
    expect(field!.userPickerMode).toBeNull();
  });
});
