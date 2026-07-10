/**
 * DPR work-item image persistence.
 *
 * The DPR form holds each work item's photos as base64 data URLs in state.
 * On save we upload any NEW photo (a `data:` URL) to S3 via the shared storage
 * driver and keep the resulting object key; photos that already live in S3
 * arrive with their key in the parallel `imageKeys` array and are kept as-is
 * (no re-upload). The DB stores only the keys (`CnDPRWorkItem.images`), and on
 * read we turn keys back into short-lived signed URLs the browser can render.
 */

import crypto from "crypto";
import { getStorageDriver } from "@/lib/storage";
import type { TenantContext } from "@/lib/auth/context";

function parseDataUrl(s: string): { contentType: string; buffer: Buffer } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(s ?? "");
  if (!m) return null;
  const contentType = m[1] || "application/octet-stream";
  const isBase64 = !!m[2];
  const data = m[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data), "utf8");
  return { contentType, buffer };
}

function extFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  return "jpg";
}

/**
 * Persist a work item's images. `images` is the form's display list (new
 * photos are `data:` URLs); `imageKeys` is the parallel list of already-stored
 * S3 keys ("" for new photos). Returns the final ordered list of S3 keys:
 * existing keys preserved, new base64 photos uploaded.
 */
export async function persistDprImages(
  ctx: TenantContext,
  images: string[],
  imageKeys: string[],
): Promise<string[]> {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) return [];
  const driver = getStorageDriver();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const existingKey = imageKeys?.[i];
    if (existingKey) {
      out.push(existingKey);
      continue;
    }
    const parsed = parseDataUrl(list[i]);
    if (!parsed) continue; // not a data URL and no key — nothing to store
    const rand = crypto.randomBytes(8).toString("hex");
    const key = `tenants/${ctx.orgId}/dpr/${yyyy}/${mm}/${rand}.${extFor(parsed.contentType)}`;
    await driver.putObject({ key, body: parsed.buffer, contentType: parsed.contentType });
    out.push(key);
  }
  return out;
}

/**
 * Turn stored S3 keys into short-lived signed view URLs, aligned 1:1 with the
 * input keys. A key that fails to sign yields "" (broken thumbnail) rather
 * than shifting the array — the parallel key list stays in step.
 */
export async function signDprImageKeys(keys: string[]): Promise<string[]> {
  const list = Array.isArray(keys) ? keys : [];
  if (list.length === 0) return [];
  const driver = getStorageDriver();
  return Promise.all(
    list.map((key) =>
      driver
        .getPresignedDownloadUrl({ key, expiresIn: 3600 })
        .then((r) => r.url)
        .catch(() => ""),
    ),
  );
}
