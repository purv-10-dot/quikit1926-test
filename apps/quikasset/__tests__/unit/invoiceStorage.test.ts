import { describe, it, expect, afterEach } from "vitest";
import {
  invoicePath,
  buildInvoiceKey,
  ALLOWED_INVOICE_TYPES,
  MAX_INVOICE_BYTES,
} from "../../lib/api/invoiceStorage";
import { isGcsConfigured } from "../../lib/api/invoiceStorageGcs";

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

describe("isGcsConfigured — GCS vs local-disk backend gate", () => {
  const GCS_KEYS = ["GCS_PROJECT_ID", "GCS_BUCKET", "GCS_CLIENT_EMAIL", "GCS_PRIVATE_KEY"] as const;
  const clearGcsEnv = () => { for (const k of GCS_KEYS) delete process.env[k]; };
  afterEach(clearGcsEnv);

  it("false when no GCS env vars are set → falls back to local disk", () => {
    clearGcsEnv();
    expect(isGcsConfigured()).toBe(false);
  });

  it("false when only some GCS vars are set (partial config is never used)", () => {
    clearGcsEnv();
    process.env.GCS_PROJECT_ID = "proj";
    process.env.GCS_BUCKET = "bucket";
    expect(isGcsConfigured()).toBe(false);
  });

  it("true only when all four GCS vars are present", () => {
    process.env.GCS_PROJECT_ID = "proj";
    process.env.GCS_BUCKET = "bucket";
    process.env.GCS_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.GCS_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----";
    expect(isGcsConfigured()).toBe(true);
  });
});
