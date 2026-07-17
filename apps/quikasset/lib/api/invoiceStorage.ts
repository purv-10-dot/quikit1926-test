import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isGcsConfigured, gcsSaveInvoice, gcsReadInvoice, gcsDeleteInvoice } from "./invoiceStorageGcs";

/**
 * Storage for asset invoice/receipt files.
 *
 * Backend is chosen at call time: if the GCS credentials are set (see
 * `invoiceStorageGcs.ts`), files go to Google Cloud Storage; otherwise they fall
 * back to LOCAL DISK — so the feature keeps working locally before real
 * credentials/bucket are provisioned. The DB stores the same backend-agnostic
 * key (`org/asset/uuid.ext`) either way; each backend maps it to its own
 * location (disk: under UPLOAD_DIR; GCS: under the `quikasset-invoices/` prefix).
 *
 * Either way the file is served ONLY through the authenticated, org-scoped
 * `/api/assets/[id]/invoice` route — never as a static asset.
 *
 * Note: switching backends does not migrate existing files. Anything uploaded to
 * disk before GCS is enabled won't be found once GCS is on (the route returns a
 * clean "invoice missing" 404) — a non-issue for pre-credentials local testing.
 *
 * Local-disk root: override with `INVOICE_UPLOAD_DIR` (e.g. a mounted volume in
 * prod); defaults to `.uploads/invoices` under the app.
 */
const UPLOAD_DIR = process.env.INVOICE_UPLOAD_DIR || path.join(process.cwd(), ".uploads", "invoices");

/** 10 MB cap — invoices/receipts are small documents. */
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

/** Allowed upload MIME types → file extension. PDF + common images only. */
export const ALLOWED_INVOICE_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Storage key for a new file — org/asset-scoped, random filename (posix slashes). */
export function buildInvoiceKey(orgId: string, assetId: string, ext: string): string {
  return `${orgId}/${assetId}/${randomUUID()}.${ext}`;
}

/** Absolute on-disk path for a stored key, guarded against path traversal. */
export function invoicePath(key: string): string {
  const root = path.resolve(UPLOAD_DIR);
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid invoice file key");
  }
  return full;
}

export async function saveInvoice(
  key: string,
  bytes: Buffer,
  contentType = "application/octet-stream",
): Promise<void> {
  if (isGcsConfigured()) {
    await gcsSaveInvoice(key, bytes, contentType);
    return;
  }
  const full = invoicePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function readInvoice(key: string): Promise<Buffer> {
  if (isGcsConfigured()) return gcsReadInvoice(key);
  return fs.readFile(invoicePath(key));
}

export async function deleteInvoice(key: string): Promise<void> {
  if (isGcsConfigured()) {
    await gcsDeleteInvoice(key);
    return;
  }
  try {
    await fs.unlink(invoicePath(key));
  } catch {
    // already gone — best-effort
  }
}
