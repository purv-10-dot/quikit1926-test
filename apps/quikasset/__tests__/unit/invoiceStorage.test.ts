import { describe, it, expect } from "vitest";
import {
  invoicePath,
  buildInvoiceKey,
  ALLOWED_INVOICE_TYPES,
  MAX_INVOICE_BYTES,
} from "../../lib/api/invoiceStorage";

describe("invoiceStorage", () => {
  it("maps allowed MIME types to extensions and rejects others", () => {
    expect(ALLOWED_INVOICE_TYPES["application/pdf"]).toBe("pdf");
    expect(ALLOWED_INVOICE_TYPES["image/png"]).toBe("png");
    expect(ALLOWED_INVOICE_TYPES["image/jpeg"]).toBe("jpg");
    expect(ALLOWED_INVOICE_TYPES["text/plain"]).toBeUndefined();
    expect(ALLOWED_INVOICE_TYPES["application/x-msdownload"]).toBeUndefined();
  });

  it("caps size at 10MB", () => {
    expect(MAX_INVOICE_BYTES).toBe(10 * 1024 * 1024);
  });

  it("builds an org/asset-scoped key with the right extension", () => {
    const key = buildInvoiceKey("org1", "a1", "pdf");
    expect(key.startsWith("org1/a1/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("resolves a normal key under the upload root", () => {
    expect(() => invoicePath("org1/a1/file.pdf")).not.toThrow();
  });

  it("rejects path-traversal keys (never escapes the upload root)", () => {
    expect(() => invoicePath("../../etc/passwd")).toThrow();
    expect(() => invoicePath("../outside.pdf")).toThrow();
    expect(() => invoicePath("org1/../../secret")).toThrow();
  });
});
