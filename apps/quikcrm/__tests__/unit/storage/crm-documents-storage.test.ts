import { describe, expect, it } from "vitest";
import {
  buildCrmDocumentStorageKey,
  isAllowedMime,
  resolveDocumentPublicUrl,
} from "@/lib/storage/documents";
import { isCrmDocumentS3Key } from "@/lib/storage";

describe("crm document storage keys", () => {
  it("builds crm-documents/{refId}/{timestamp}-{filename}", () => {
    const key = buildCrmDocumentStorageKey("lead-abc", "my_file.pdf");
    expect(key).toMatch(/^crm-documents\/lead-abc\/\d+-my_file\.pdf$/);
    expect(isCrmDocumentS3Key(key)).toBe(true);
  });

  it("rejects legacy local storage keys for public URL", () => {
    expect(resolveDocumentPublicUrl("t1/uuid-file.pdf")).toBe("");
  });

  it("allows common CRM mime types", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("application/x-evil")).toBe(false);
  });
});
