/**
 * FR-RE Unit 3b (FR-RE-3 file_upload) — DB write, no-partial-save, ACL read.
 *
 *   AC-RE-7  — a valid upload records a QcfFileAttachment and points the
 *              field value (QcfFieldValue.valueFileId) at it.
 *   AC-RE-8  — an oversize / disallowed file is rejected with NO partial save
 *              (validation runs before any S3 or DB write).
 *   AC-RE-17 — uploaded files must not leak across account scopes: a restricted
 *              agent CANNOT read an attachment whose parent activity is out of
 *              their scope; an unrestricted admin can.
 *
 * S3 is NOT exercised here (no creds in local test env): the validation +
 * DB-write + ACL-gate are the security-critical surfaces and are all S3-free.
 * The full putObject path runs in the route against real storage.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import {
  recordDispositionAttachment,
  saveDispositionUpload,
  assertAttachmentAccess,
  FileUploadError,
} from "@/lib/services/forms/file-upload.service";
import type { SessionUser } from "@/types/permission";

const STAMP = Date.now();
const TENANT = `int_frre_u3b_${STAMP}`;
const ADMIN_ROLE = "Administrator";
const MB = 1024 * 1024;

let accountAId: string;
let accountBId: string;
let leadAId: string;
let activityAId: string;
let attachmentId: string;
let setId: string;
let versionId: string;

const adminUser: SessionUser = {
  userId: `admin_${STAMP}`,
  orgId: TENANT,
  role: ADMIN_ROLE,
  email: "admin@frre.test",
  name: "Admin",
};
// Restricted agent: scoped (via QcfUserAccountAccess) to account B only.
const agentB: SessionUser = {
  userId: `agentB_${STAMP}`,
  orgId: TENANT,
  role: "member",
  email: "agentb@frre.test",
  name: "Agent B",
};

beforeAll(async () => {
  const [accA, accB] = await Promise.all([
    integrationPrisma.qcfAccount.create({ data: { orgId: TENANT, name: `Acct A ${STAMP}` } }),
    integrationPrisma.qcfAccount.create({ data: { orgId: TENANT, name: `Acct B ${STAMP}` } }),
  ]);
  accountAId = accA.id;
  accountBId = accB.id;

  // Lead + activity live on account A.
  const leadA = await integrationPrisma.qcfLead.create({
    data: { orgId: TENANT, name: `Lead A ${STAMP}`, accountId: accountAId },
  });
  leadAId = leadA.id;
  const activityA = await integrationPrisma.qcfActivity.create({
    data: { orgId: TENANT, type: "call", relatedKind: "Lead", relatedObjectId: leadAId },
  });
  activityAId = activityA.id;

  // agentB may only see account B (so account A — and its activity — is out of scope).
  await integrationPrisma.qcfUserAccountAccess.create({
    data: { userId: agentB.userId, accountId: accountBId },
  });

  // A form-set version to anchor the field value.
  const set = await integrationPrisma.qcfFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}` },
  });
  setId = set.id;
  const version = await integrationPrisma.qcfFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  });
  versionId = version.id;
});

afterAll(async () => {
  await integrationPrisma.qcfFieldValue.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfFileAttachment.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await integrationPrisma.qcfFormSet.deleteMany({ where: { id: setId } });
  await integrationPrisma.qcfActivity.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfLead.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfUserAccountAccess.deleteMany({ where: { userId: agentB.userId } });
  await integrationPrisma.qcfAccount.deleteMany({ where: { orgId: TENANT } });
});

describe("recordDispositionAttachment — AC-RE-7 (valid upload recorded)", () => {
  it("writes a CrmFileAttachment and points the field value at it", async () => {
    const attachment = await recordDispositionAttachment({
      orgId: TENANT,
      activityId: activityAId,
      formSetVersionId: versionId,
      fieldKey: "id_proof",
      storageKey: `crm-documents/${activityAId}/${STAMP}-doc.pdf`,
      filename: "doc.pdf",
      contentType: "application/pdf",
      sizeBytes: 2 * MB,
      uploadedBy: adminUser.userId,
    });
    attachmentId = attachment.id;

    expect(attachment.activityId).toBe(activityAId);
    expect(attachment.sizeBytes).toBe(2 * MB);

    const fv = await integrationPrisma.qcfFieldValue.findUnique({
      where: { activityId_fieldKey: { activityId: activityAId, fieldKey: "id_proof" } },
    });
    expect(fv?.valueFileId).toBe(attachment.id);
    expect(fv?.valueType).toBe("file_upload");
  });
});

describe("saveDispositionUpload — AC-RE-8 (no partial save on reject)", () => {
  it("rejects an oversize file and writes NOTHING", async () => {
    const before = await integrationPrisma.qcfFileAttachment.count({ where: { orgId: TENANT } });
    const big = new File([new Uint8Array(10 * MB + 1)], "big.pdf", { type: "application/pdf" });

    await expect(
      saveDispositionUpload({
        user: adminUser,
        activityId: activityAId,
        formSetVersionId: versionId,
        fieldKey: "oversize_field",
        file: big,
      }),
    ).rejects.toBeInstanceOf(FileUploadError);

    const after = await integrationPrisma.qcfFileAttachment.count({ where: { orgId: TENANT } });
    expect(after).toBe(before); // no new row
    const fv = await integrationPrisma.qcfFieldValue.findUnique({
      where: { activityId_fieldKey: { activityId: activityAId, fieldKey: "oversize_field" } },
    });
    expect(fv).toBeNull();
  });

  it("rejects a disallowed type (gif — allowed by the general service) and writes NOTHING", async () => {
    const before = await integrationPrisma.qcfFileAttachment.count({ where: { orgId: TENANT } });
    const gif = new File([new Uint8Array(1024)], "x.gif", { type: "image/gif" });

    await expect(
      saveDispositionUpload({
        user: adminUser,
        activityId: activityAId,
        formSetVersionId: versionId,
        fieldKey: "gif_field",
        file: gif,
      }),
    ).rejects.toBeInstanceOf(FileUploadError);

    const after = await integrationPrisma.qcfFileAttachment.count({ where: { orgId: TENANT } });
    expect(after).toBe(before);
  });
});

describe("assertAttachmentAccess — AC-RE-17 (no cross-scope file leak)", () => {
  it("a restricted agent CANNOT read an attachment whose activity is out of scope", async () => {
    // agentB is scoped to account B; the attachment's activity belongs to a
    // lead on account A. The read must be refused (fail-closed), not leaked.
    await expect(assertAttachmentAccess(agentB, attachmentId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("an unrestricted admin CAN read the same attachment", async () => {
    const att = await assertAttachmentAccess(adminUser, attachmentId);
    expect(att.id).toBe(attachmentId);
  });
});
