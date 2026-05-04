/**
 * POST /api/documents/upload-url
 *
 * Returns a Vercel Blob client-token for the browser to upload directly to
 * Vercel Blob, bypassing the server (avoids buffering large files in
 * Lambda-style API routes).
 *
 * Flow:
 *   1. Browser POSTs metadata: { dealId, category, filename, mimeType, sizeBytes }
 *   2. Server validates: caller has access to the deal, file size + type
 *      within limits, file extension allowed.
 *   3. Server returns a token via @vercel/blob's `handleUpload` helper.
 *   4. Browser uploads to the URL inside the token response, gets back the
 *      final blob URL, and POSTs to /api/documents to persist the record.
 *
 * Sprint 2 simplification: we use server-upload (POST file) for v1 because
 * client-upload requires a separate webhook callback. Server-upload caps at
 * Vercel's 4.5 MB body limit — fine for typical PDFs (<5 MB). Client-upload
 * lands in Sprint 3 for larger pitch decks.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const MAX_BYTES = 4_500_000; // ~4.5 MB — Vercel API route body limit

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const formData = await req.formData();
  const file = formData.get("file");
  const dealId = String(formData.get("dealId") ?? "");
  const category = String(formData.get("category") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Missing file" },
      { status: 400 },
    );
  }
  if (!dealId || !category) {
    return NextResponse.json(
      { success: false, error: "Missing dealId or category" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { success: false, error: `MIME type ${file.type} not allowed` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: `File exceeds ${MAX_BYTES / 1_000_000} MB limit` },
      { status: 400 },
    );
  }

  // Authorize: caller must be in this tenant's deal (founder or VC team)
  const deal = await db.vCDeal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, application: { select: { founderId: true } } },
  });
  if (!deal) {
    return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
  }

  // Upload to Vercel Blob (path: orgId/dealId/timestamp-filename)
  const stamped = `${orgId}/${dealId}/${Date.now()}-${file.name}`;
  const blob = await put(stamped, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  });

  // Compute next version number
  const existing = await db.vCDealDocument.count({
    where: { orgId, dealId, category },
  });

  // Persist record
  const doc = await db.vCDealDocument.create({
    data: {
      orgId,
      dealId,
      category,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      blobUrl: blob.url,
      version: existing + 1,
      status: "under-review",
      uploadedById: userId,
      createdBy: userId,
      updatedBy: userId,
    },
    select: {
      id: true,
      filename: true,
      blobUrl: true,
      version: true,
      status: true,
      category: true,
    },
  });

  // Timeline event (visible to founder)
  await db.vCTimelineEvent.create({
    data: {
      orgId,
      dealId,
      type: "doc-uploaded",
      actorId: userId,
      summary: `Uploaded "${file.name}" (${category})`,
      payload: { documentId: doc.id, category, version: doc.version },
      visibility: "founder",
    },
  });

  return NextResponse.json({ success: true, data: doc }, { status: 201 });
});
