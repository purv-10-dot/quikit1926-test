/**
 * FR-RE Unit 3b (FR-RE-3 file_upload) — upload validation.
 *
 * The FR-RE disposition upload limits are DELIBERATELY stricter than the app's
 * general document storage (lib/storage/documents.ts: ~25MB, broad mime set):
 *   - Max 10MB.
 *   - PNG / JPG / JPEG / WEBP / PDF only.
 *
 * AC-RE-7: a valid file passes. AC-RE-8: a disallowed type or an oversize file
 * is rejected — and crucially, the rejection must fire on TYPES THE GENERAL
 * SERVICE ALLOWS (gif, docx, xlsx, txt), proving the stricter limit is applied,
 * not the app default.
 */
import { describe, it, expect } from "vitest";
import {
  validateDispositionFile,
  FileUploadError,
  FR_RE_MAX_FILE_BYTES,
} from "@/lib/services/forms/file-upload.service";

const MB = 1024 * 1024;

describe("validateDispositionFile (FR-RE-3 / AC-RE-7)", () => {
  it("FR_RE_MAX_FILE_BYTES is exactly 10MB (stricter than the app's 25MB)", () => {
    expect(FR_RE_MAX_FILE_BYTES).toBe(10 * MB);
  });

  it.each([
    ["application/pdf"],
    ["image/png"],
    ["image/jpeg"], // covers both .jpg and .jpeg
    ["image/webp"],
  ])("accepts allowed type %s under the size limit", (type) => {
    expect(() => validateDispositionFile({ size: 1 * MB, type })).not.toThrow();
  });

  it("accepts a file at exactly the 10MB boundary", () => {
    expect(() =>
      validateDispositionFile({ size: 10 * MB, type: "application/pdf" }),
    ).not.toThrow();
  });
});

describe("validateDispositionFile rejection (FR-RE-3 / AC-RE-8)", () => {
  it("rejects a file over 10MB", () => {
    expect(() =>
      validateDispositionFile({ size: 10 * MB + 1, type: "application/pdf" }),
    ).toThrow(FileUploadError);
  });

  it.each([
    ["image/gif"], // allowed by the general service — NOT by FR-RE
    ["text/plain"],
    ["text/csv"],
    ["application/msword"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["application/octet-stream"],
  ])("rejects disallowed type %s (stricter than the app default)", (type) => {
    expect(() => validateDispositionFile({ size: 1 * MB, type })).toThrow(
      FileUploadError,
    );
  });
});
