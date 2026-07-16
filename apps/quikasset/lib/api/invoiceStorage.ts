import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Local-disk storage for asset invoice/receipt files.
 *
 * Files live OUTSIDE the Next.js `public/` tree so they are never served as
 * raw static assets — the only way in/out is the authenticated, org-scoped
 * `/api/assets/[id]/invoice` route. Override the root with `INVOICE_UPLOAD_DIR`
 * (e.g. a mounted volume in prod); defaults to `.uploads/invoices` under the app.
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

export async function saveInvoice(key: string, bytes: Buffer): Promise<void> {
  const full = invoicePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function readInvoice(key: string): Promise<Buffer> {
  return fs.readFile(invoicePath(key));
}

export async function deleteInvoice(key: string): Promise<void> {
  try {
    await fs.unlink(invoicePath(key));
  } catch {
    // already gone — best-effort
  }
}
