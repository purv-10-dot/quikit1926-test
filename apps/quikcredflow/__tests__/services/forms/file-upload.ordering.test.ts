/**
 * FR-RE Unit 3b — saveDispositionUpload ORDERING guarantees.
 *
 * The security/correctness contract is "validate before store" and "ACL before
 * store". We lock it with a test (not just "verified at deploy"): with the S3
 * write (saveCrmUpload) stubbed, neither a bad file nor an out-of-scope activity
 * may ever reach the store call.
 *
 * The S3 putObject itself is NOT tested here — it's the existing, working
 * storage service. Only the ORDER is asserted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { getScope } from "@/lib/auth/account-acl";
import { saveCrmUpload } from "@/lib/storage/documents";
import {
  saveDispositionUpload,
  FileUploadError,
} from "@/lib/services/forms/file-upload.service";
import type { SessionUser } from "@/types/permission";

vi.mock("@/lib/storage/documents", () => ({
  saveCrmUpload: vi.fn(),
  getCrmUploadDownloadUrl: vi.fn(),
}));

const db = mockDb();
const MB = 1024 * 1024;

const user: SessionUser = {
  userId: "u_1",
  orgId: "t_1",
  role: "member",
  email: "u@test",
  name: "U",
};

beforeEach(() => {
  vi.mocked(saveCrmUpload).mockReset();
  db.qcfActivity.findFirst.mockReset();
  // Default: caller IS in scope (admin/unrestricted) — isolates each guarantee.
  vi.mocked(getScope).mockResolvedValue({ unrestricted: true });
  db.qcfActivity.findFirst.mockResolvedValue({ id: "act_1" } as never);
});

describe("saveDispositionUpload ordering (AC-RE-8 + ACL-before-store)", () => {
  it("validate-before-store: a disallowed type throws BEFORE saveCrmUpload is called", async () => {
    const gif = new File([new Uint8Array(1024)], "x.gif", { type: "image/gif" });

    await expect(
      saveDispositionUpload({
        user,
        activityId: "act_1",
        formSetVersionId: "ver_1",
        fieldKey: "f",
        file: gif,
      }),
    ).rejects.toBeInstanceOf(FileUploadError);

    expect(saveCrmUpload).not.toHaveBeenCalled();
  });

  it("validate-before-store: an oversize file throws BEFORE saveCrmUpload is called", async () => {
    const big = new File([new Uint8Array(10 * MB + 1)], "big.pdf", {
      type: "application/pdf",
    });

    await expect(
      saveDispositionUpload({
        user,
        activityId: "act_1",
        formSetVersionId: "ver_1",
        fieldKey: "f",
        file: big,
      }),
    ).rejects.toBeInstanceOf(FileUploadError);

    expect(saveCrmUpload).not.toHaveBeenCalled();
  });

  it("ACL-before-store: an out-of-scope activity throws BEFORE saveCrmUpload is called", async () => {
    // Restricted with no allowed accounts => activity ACL matches nothing.
    vi.mocked(getScope).mockResolvedValue({ unrestricted: false, allowedAccountIds: [] });
    db.qcfActivity.findFirst.mockResolvedValue(null as never);

    const validPdf = new File([new Uint8Array(1024)], "ok.pdf", {
      type: "application/pdf",
    });

    await expect(
      saveDispositionUpload({
        user,
        activityId: "act_out_of_scope",
        formSetVersionId: "ver_1",
        fieldKey: "f",
        file: validPdf,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(saveCrmUpload).not.toHaveBeenCalled();
  });
});
