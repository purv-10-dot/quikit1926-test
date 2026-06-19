import { describe, it, expect } from "vitest";
import {
  validateUpload,
  ALLOWED_MIME_TYPES,
  ENTITY_SIZE_CAPS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES,
} from "@/lib/storage/validation";

const MB = 1024 * 1024;

function ok(over: Partial<Parameters<typeof validateUpload>[0]> = {}) {
  return validateUpload({
    entityType: "project_document",
    mimeType: "application/pdf",
    sizeBytes: 1 * MB,
    fileName: "drawing.pdf",
    ...over,
  });
}

describe("validateUpload — happy path", () => {
  it("accepts an allowed mime, in-cap size, clean filename", () => {
    expect(ok()).toEqual({ ok: true });
  });

  it("accepts every allowed mime type at 1 byte", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const r = validateUpload({
        entityType: "default",
        mimeType: mime,
        sizeBytes: 1,
        fileName: "f",
      });
      expect(r.ok).toBe(true);
    }
  });
});

describe("validateUpload — filename rules", () => {
  it("rejects empty filename", () => {
    const r = ok({ fileName: "" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID_FILENAME");
  });

  it("rejects filenames longer than 512 chars", () => {
    const r = ok({ fileName: "a".repeat(513) + ".pdf" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID_FILENAME");
  });

  it("rejects forward-slash and backslash path separators", () => {
    expect(ok({ fileName: "sub/dir.pdf" }).code).toBe("INVALID_FILENAME");
    expect(ok({ fileName: "sub\\dir.pdf" }).code).toBe("INVALID_FILENAME");
  });
});

describe("validateUpload — mime rules", () => {
  it("rejects missing mime with MISSING_MIME", () => {
    expect(ok({ mimeType: "" }).code).toBe("MISSING_MIME");
  });

  it("rejects a disallowed mime with MIME_NOT_ALLOWED", () => {
    const r = ok({ mimeType: "application/x-msdownload" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MIME_NOT_ALLOWED");
    expect(r.error).toMatch(/not allowed/);
  });
});

describe("validateUpload — size rules", () => {
  it("rejects zero / negative / non-finite size with INVALID_SIZE", () => {
    expect(ok({ sizeBytes: 0 }).code).toBe("INVALID_SIZE");
    expect(ok({ sizeBytes: -5 }).code).toBe("INVALID_SIZE");
    expect(ok({ sizeBytes: NaN }).code).toBe("INVALID_SIZE");
    expect(ok({ sizeBytes: Infinity }).code).toBe("INVALID_SIZE");
  });

  it("uses DEFAULT cap (25 MB) for an unknown entity type", () => {
    expect(
      validateUpload({
        entityType: "unknown",
        mimeType: "application/pdf",
        sizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
        fileName: "f.pdf",
      }).ok,
    ).toBe(true);
    expect(
      validateUpload({
        entityType: "unknown",
        mimeType: "application/pdf",
        sizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES + 1,
        fileName: "f.pdf",
      }).code,
    ).toBe("FILE_TOO_LARGE");
  });

  it("honours the per-entity boq_import cap of 50 MB", () => {
    expect(ENTITY_SIZE_CAPS.boq_import).toBe(50 * MB);
    expect(
      validateUpload({
        entityType: "boq_import",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 49 * MB,
        fileName: "boq.xlsx",
      }).ok,
    ).toBe(true);
    expect(
      validateUpload({
        entityType: "boq_import",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 51 * MB,
        fileName: "boq.xlsx",
      }).code,
    ).toBe("FILE_TOO_LARGE");
  });

  it("project_document cap is 20 MB and rejects above it", () => {
    expect(ENTITY_SIZE_CAPS.project_document).toBe(PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES);
    const r = ok({ sizeBytes: 21 * MB });
    expect(r.code).toBe("FILE_TOO_LARGE");
    expect(r.error).toMatch(/20 MB/);
  });

  it("allows a file exactly at the cap (boundary)", () => {
    expect(ok({ sizeBytes: PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES }).ok).toBe(true);
  });
});
