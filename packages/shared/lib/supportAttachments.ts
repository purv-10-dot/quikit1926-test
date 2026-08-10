/**
 * Screenshots / files attached to a support request.
 *
 * Two-step flow, mirroring QuikInfra's `/api/uploads`:
 *
 *   1. The browser POSTs the files to `/api/support/uploads` (multipart).
 *      They land in GCS under `support/<orgId>/<yyyy-mm>/<random>.<ext>` and
 *      the route returns descriptors.
 *   2. The browser POSTs the ticket to `/api/support/tickets` carrying those
 *      descriptors. The server re-checks each one before persisting a row.
 *
 * Why two steps rather than one multipart ticket POST: the ticket endpoint is
 * shared, JSON, and already wired into fourteen apps with four different auth
 * wrappers. Keeping it JSON meant not rewriting all of them, and it lets the
 * user see upload progress and remove a file before committing to send.
 *
 * The cost is orphaned objects when someone uploads and then abandons the form.
 * That is accepted (QuikInfra has the same exposure) — see `sweepOrphans` notes
 * at the bottom for the cleanup story.
 *
 * SERVER ONLY — pulls in `@quikit/shared/storage`. Client code wanting the
 * limits should import them from `@quikit/shared` (constants.ts), which is
 * dependency-free.
 */

import crypto from "node:crypto";
import path from "node:path";
import {
  SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_COUNT,
} from "./constants";
import { deleteObject, getSignedDownloadUrl, headObject, putObject } from "./storage";

/** Root prefix inside the bucket. Kept distinct from QuikInfra's `uploads/`
 *  so a support attachment can never be served by that app's viewer route. */
export const SUPPORT_KEY_PREFIX = "support";

/** Descriptor returned by the upload route and echoed back on ticket create. */
export interface SupportAttachmentInput {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadedSupportAttachment extends SupportAttachmentInput {
  /** Stable app-relative URL. Resolves to a fresh signed URL on each request. */
  url: string;
}

export type AttachmentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/* ─── Key layout ─────────────────────────────────────────────────────────── */

/**
 * Object keys are `support/<orgId>/<yyyy-mm>/<random><ext>`.
 *
 * The org segment is what makes tenant isolation checkable from the key alone —
 * the viewer route compares it against the caller's session org before signing
 * anything, so a leaked key from another tenant is useless.
 *
 * The basename is random, never derived from the client's filename: a name like
 * `../../../etc/passwd` or one with a doubled extension must not be able to
 * influence where the bytes land or what they are served as.
 */
export function buildSupportObjectKey(params: {
  orgId: string;
  originalName: string;
  mimeType: string;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ext = path.extname(params.originalName).toLowerCase() || extForMime(params.mimeType);
  const base = crypto.randomBytes(16).toString("hex");
  return `${SUPPORT_KEY_PREFIX}/${sanitizeSegment(params.orgId)}/${yearMonth}/${base}${ext}`;
}

/** Strip anything that isn't a portable path character, so an exotic orgId
 *  can't escape its own prefix. */
export function sanitizeSegment(value: string): string {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, "_") || "org";
}

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/heic":
      return ".heic";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

/**
 * Does this key belong to this org?
 *
 * The single isolation predicate, used by BOTH the viewer route (before signing
 * a URL) and ticket creation (before persisting a row). Rejects anything that
 * isn't shaped like a support key, so `../` or a QuikInfra `uploads/` key can
 * never be signed here.
 */
export function keyBelongsToOrg(key: string, orgId: string): boolean {
  if (!key || key.includes("..") || key.includes("//")) return false;
  const segments = key.split("/");
  // support / <org> / <yyyy-mm> / <file>
  if (segments.length !== 4) return false;
  if (segments[0] !== SUPPORT_KEY_PREFIX) return false;
  if (segments[1] !== sanitizeSegment(orgId)) return false;
  if (!/^\d{4}-\d{2}$/.test(segments[2])) return false;
  return segments[3].length > 0;
}

/** App-relative viewer URL for a stored key. */
export function attachmentViewUrl(objectKey: string): string {
  return `/api/support/uploads/view/${objectKey}`;
}

/* ─── Validation ─────────────────────────────────────────────────────────── */

export function validateSupportFile(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): AttachmentResult<true> {
  const { fileName, mimeType, sizeBytes } = params;

  if (!fileName || fileName.length > 255) {
    return { ok: false, error: "Invalid file name", status: 400 };
  }
  if (
    !mimeType ||
    !(SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
  ) {
    return {
      ok: false,
      error: `${fileName}: unsupported file type. Attach an image (PNG, JPG, WEBP, GIF, HEIC) or a PDF.`,
      status: 415,
    };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: `${fileName} is empty.`, status: 400 };
  }
  if (sizeBytes > SUPPORT_ATTACHMENT_MAX_BYTES) {
    const mb = Math.round(SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024));
    return {
      ok: false,
      error: `${fileName} is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB — the limit is ${mb} MB.`,
      status: 413,
    };
  }
  return { ok: true, data: true };
}

/* ─── Upload ─────────────────────────────────────────────────────────────── */

/**
 * Validate and store a batch of files. Returns descriptors the client echoes
 * back on ticket create.
 *
 * All-or-nothing: if any file fails validation, nothing is uploaded. A partial
 * batch would leave the user staring at a form where some files silently
 * vanished.
 */
export async function uploadSupportAttachments(params: {
  orgId: string;
  files: Array<{ name: string; type: string; size: number; bytes: () => Promise<ArrayBuffer> }>;
}): Promise<AttachmentResult<UploadedSupportAttachment[]>> {
  const { orgId, files } = params;

  if (files.length === 0) {
    return { ok: false, error: "No files in the request.", status: 400 };
  }
  if (files.length > SUPPORT_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      error: `Attach at most ${SUPPORT_ATTACHMENT_MAX_COUNT} files.`,
      status: 400,
    };
  }

  for (const file of files) {
    const check = validateSupportFile({
      fileName: file.name,
      mimeType: (file.type || "").toLowerCase(),
      sizeBytes: file.size,
    });
    if (!check.ok) return check;
  }

  const uploaded: UploadedSupportAttachment[] = [];
  try {
    for (const file of files) {
      const mimeType = (file.type || "").toLowerCase();
      const objectKey = buildSupportObjectKey({ orgId, originalName: file.name, mimeType });
      await putObject({
        key: objectKey,
        body: Buffer.from(await file.bytes()),
        contentType: mimeType,
      });
      uploaded.push({
        objectKey,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        url: attachmentViewUrl(objectKey),
      });
    }
  } catch (error: unknown) {
    // Roll back whatever landed — a half-uploaded batch would orphan objects
    // the client never learns about and so can never reference or clean up.
    await Promise.allSettled(uploaded.map((u) => deleteObject(u.objectKey)));
    const message = error instanceof Error ? error.message : "Upload failed";
    return { ok: false, error: message, status: 500 };
  }

  return { ok: true, data: uploaded };
}

/* ─── Verification at ticket-create time ─────────────────────────────────── */

/**
 * Re-check attachment descriptors submitted with a ticket.
 *
 * The client is not trusted here even though it just received these from our
 * own upload route: a caller could hand-craft a POST claiming someone else's
 * key. Each descriptor must (a) be shaped like a support key, (b) sit under the
 * caller's own org prefix, and (c) actually exist in the bucket.
 *
 * `sizeBytes` and `mimeType` are re-read from object metadata rather than
 * trusted from the body, so the row can't claim a 1 KB PNG that is really a
 * 40 MB archive.
 */
export async function verifySupportAttachments(params: {
  orgId: string;
  attachments: SupportAttachmentInput[];
}): Promise<AttachmentResult<SupportAttachmentInput[]>> {
  const { orgId, attachments } = params;
  if (attachments.length === 0) return { ok: true, data: [] };
  if (attachments.length > SUPPORT_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      error: `Attach at most ${SUPPORT_ATTACHMENT_MAX_COUNT} files.`,
      status: 400,
    };
  }

  const seen = new Set<string>();
  const verified: SupportAttachmentInput[] = [];

  for (const att of attachments) {
    if (!keyBelongsToOrg(att.objectKey, orgId)) {
      return { ok: false, error: "Attachment not found", status: 400 };
    }
    // A repeated key would write two rows pointing at one object; deleting the
    // ticket would then try to remove it twice.
    if (seen.has(att.objectKey)) {
      return { ok: false, error: "Duplicate attachment", status: 400 };
    }
    seen.add(att.objectKey);

    const head = await headObject(att.objectKey);
    if (!head.exists) {
      return { ok: false, error: "Attachment not found", status: 400 };
    }

    const mimeType = (head.contentType ?? att.mimeType ?? "").toLowerCase();
    const sizeBytes = head.contentLength ?? att.sizeBytes;
    const check = validateSupportFile({
      fileName: att.fileName,
      mimeType,
      sizeBytes,
    });
    if (!check.ok) return check;

    verified.push({
      objectKey: att.objectKey,
      // Trim the display name — it is echoed back into the triage UI.
      fileName: att.fileName.slice(0, 255),
      mimeType,
      sizeBytes,
    });
  }

  return { ok: true, data: verified };
}

/* ─── Reading ────────────────────────────────────────────────────────────── */

/**
 * Mint a short-lived signed URL for one attachment.
 *
 * `orgId` is the caller's org; pass `null` ONLY from a super-admin surface,
 * where cross-org reads are the point (the triage queue must open a screenshot
 * from any tenant). Every user-facing route passes the session org.
 */
export async function resolveSupportAttachmentUrl(params: {
  objectKey: string;
  orgId: string | null;
  fileName?: string;
}): Promise<AttachmentResult<string>> {
  const { objectKey, orgId, fileName } = params;

  if (orgId !== null && !keyBelongsToOrg(objectKey, orgId)) {
    // 404 rather than 403 — a wrong-org key and a nonexistent key must be
    // indistinguishable, or the route becomes an existence oracle.
    return { ok: false, error: "Not found", status: 404 };
  }
  if (orgId === null && !objectKey.startsWith(`${SUPPORT_KEY_PREFIX}/`)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const head = await headObject(objectKey);
  if (!head.exists) return { ok: false, error: "Not found", status: 404 };

  const { url } = await getSignedDownloadUrl({ key: objectKey, fileName });
  return { ok: true, data: url };
}

/** Remove stored objects — used when ticket creation fails after upload. */
export async function deleteSupportAttachments(objectKeys: string[]): Promise<void> {
  await Promise.allSettled(objectKeys.map((key) => deleteObject(key)));
}

/* ─── Route bodies ───────────────────────────────────────────────────────── */

/**
 * Body of `POST /api/support/uploads`, shared by every app.
 *
 * Each app's route file resolves `{ orgId }` with its own auth guard and calls
 * this; nothing app-specific happens in here. Framework-agnostic — takes a
 * `FormData` and returns plain data, so the caller maps it onto whatever
 * response helper that app uses.
 */
export async function handleSupportUpload(params: {
  orgId: string;
  form: FormData;
}): Promise<AttachmentResult<{ files: UploadedSupportAttachment[] }>> {
  const entries = params.form.getAll("files");
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);

  if (files.length === 0) {
    return { ok: false, error: 'Missing "files" field', status: 400 };
  }

  const result = await uploadSupportAttachments({
    orgId: params.orgId,
    files: files.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
      bytes: () => f.arrayBuffer(),
    })),
  });
  if (!result.ok) return result;

  return { ok: true, data: { files: result.data } };
}

/**
 * Body of `GET /api/support/uploads/view/[...key]`, shared by every app.
 *
 * Returns the signed URL to redirect to. Pass `orgId: null` ONLY from the
 * super-admin viewer, where reading another tenant's screenshot is the job.
 */
export async function handleSupportAttachmentView(params: {
  orgId: string | null;
  keySegments: string[];
}): Promise<AttachmentResult<string>> {
  const key = (params.keySegments ?? []).join("/");
  if (!key) return { ok: false, error: "Not found", status: 404 };
  return resolveSupportAttachmentUrl({ objectKey: key, orgId: params.orgId });
}
