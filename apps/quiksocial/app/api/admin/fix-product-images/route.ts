/**
 * GET /api/admin/fix-product-images
 *
 * One-shot backfill that re-hosts every Product / Service image whose URL
 * doesn't already start with https://res.cloudinary.com/. Triggered with
 * the same Bearer token as the publish-scheduled cron:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/admin/fix-product-images
 *
 * Why this exists: the brand-scrape pipeline best-effort-rehosts product
 * and service images. When source CDNs 403, time out, or rotate URL
 * signatures, the original third-party URL ends up in the DB and renders
 * as a broken icon weeks later.
 *
 * Ported to QuikIT (Phase 3, Batch 5):
 *   - Bearer auth via CRON_SECRET (no session — same as the cron)
 *   - Operates against DEFAULT_ORG_ID (single-org; multi-org backfill
 *     is a follow-up — same migration story as the cron)
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.DEFAULT_TENANT_ID ||
  "org_quiksocial_default";

const CLOUDINARY_PREFIX = "https://res.cloudinary.com/";
const DOWNLOAD_TIMEOUT_MS = 15_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface UrlStats {
  total: number;
  fixed: number;
  failed: number;
  skipped: number;
}

const emptyStats = (): UrlStats => ({ total: 0, fixed: 0, failed: 0, skipped: 0 });

function isCloudinaryUrl(u: string | null | undefined): boolean {
  return typeof u === "string" && u.startsWith(CLOUDINARY_PREFIX);
}

async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer | null; reason: string }> {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return { buffer: null, reason: "invalid URL" };
  }
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: origin,
        Accept:
          "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { buffer: null, reason: `HTTP ${res.status}` };
    }
    const arr = await res.arrayBuffer();
    if (!arr || arr.byteLength === 0) {
      return { buffer: null, reason: "empty response" };
    }
    return { buffer: Buffer.from(arr), reason: "ok" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { buffer: null, reason: "timeout" };
    }
    return { buffer: null, reason: msg };
  }
}

async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result?.secure_url) {
          console.error(
            "[fix-images] Cloudinary upload error:",
            error?.message ?? "no result",
          );
          resolve(null);
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown host";
  }
}

interface CandidateRow {
  id: string;
  name: string;
  imageUrls: string[];
}

async function fixCollection(
  kind: "Product" | "Service",
  folder: string,
  orgId: string,
): Promise<UrlStats> {
  const stats = emptyStats();
  const PAGE = 200;
  let skip = 0;

  for (;;) {
    const rows: CandidateRow[] =
      kind === "Product"
        ? await db.product.findMany({
            select: { id: true, name: true, imageUrls: true },
            where: {
              orgId,
              imageUrls: { isEmpty: false },
            } as Prisma.ProductWhereInput,
            skip,
            take: PAGE,
          })
        : await db.service.findMany({
            select: { id: true, name: true, imageUrls: true },
            where: {
              orgId,
              imageUrls: { isEmpty: false },
            } as Prisma.ServiceWhereInput,
            skip,
            take: PAGE,
          });

    if (rows.length === 0) break;
    skip += rows.length;

    for (const doc of rows) {
      const oldUrls = Array.isArray(doc.imageUrls) ? doc.imageUrls : [];
      if (oldUrls.every((u) => isCloudinaryUrl(u))) {
        stats.skipped += oldUrls.length;
        continue;
      }

      const newUrls: string[] = [];
      let changed = false;

      for (let i = 0; i < oldUrls.length; i++) {
        const url = oldUrls[i];
        if (!url || typeof url !== "string") {
          stats.skipped++;
          continue;
        }
        if (isCloudinaryUrl(url)) {
          newUrls.push(url);
          stats.skipped++;
          continue;
        }

        stats.total++;

        const { buffer, reason } = await downloadImage(url);
        if (!buffer) {
          console.log(
            `[fix-images] ${kind} "${doc.name}" image ${i}: FAILED (${reason} from ${safeHost(url)})`,
          );
          stats.failed++;
          newUrls.push(url);
          continue;
        }

        const cloudUrl = await uploadToCloudinary(buffer, folder);
        if (!cloudUrl) {
          console.log(
            `[fix-images] ${kind} "${doc.name}" image ${i}: FAILED (Cloudinary upload rejected)`,
          );
          stats.failed++;
          newUrls.push(url);
          continue;
        }

        console.log(`[fix-images] ${kind} "${doc.name}" image ${i}: OK → ${cloudUrl}`);
        stats.fixed++;
        newUrls.push(cloudUrl);
        changed = true;
      }

      if (changed) {
        try {
          if (kind === "Product") {
            await db.product.update({
              where: { id: doc.id },
              data: { imageUrls: newUrls },
            });
          } else {
            await db.service.update({
              where: { id: doc.id },
              data: { imageUrls: newUrls },
            });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "save error";
          console.error(`[fix-images] ${kind} "${doc.name}" save failed: ${msg}`);
        }
      }
    }

    if (rows.length < PAGE) break;
  }

  return stats;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cloudinary env vars missing (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)",
      },
      { status: 500 },
    );
  }

  const orgId = DEFAULT_ORG_ID;

  console.log("[fix-images] Starting backfill — products then services");
  const products = await fixCollection("Product", "quiksocial/products", orgId);
  const services = await fixCollection("Service", "quiksocial/services", orgId);
  console.log(
    `[fix-images] Done — products ${JSON.stringify(products)} services ${JSON.stringify(services)}`,
  );

  return NextResponse.json({
    success: true,
    data: { products, services },
  });
}
