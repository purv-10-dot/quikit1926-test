import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { writableAssetIds, assignedAssetIdsForEmail } from "@/lib/api/assetScope";
import {
  ALLOWED_INVOICE_TYPES,
  MAX_INVOICE_BYTES,
  buildInvoiceKey,
  saveInvoice,
  readInvoice,
  deleteInvoice,
} from "@/lib/api/invoiceStorage";

const auth = withOrgAuthForResource("Asset");

/**
 * Per-asset invoice/receipt file — stored on local disk, served ONLY through
 * this authenticated, org-scoped route (never as a static asset).
 *   GET    — stream inline (preview) or as attachment (?download=1). Read scope.
 *   POST   — upload/replace (multipart, field "file"). Write scope.
 *   DELETE — remove the attached file. Write scope.
 */

export const GET = auth.view<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const asset = await db.astAsset.findFirst({
    where: { id, orgId },
    select: { id: true, invoiceFileKey: true, invoiceFileName: true, invoiceFileType: true },
  });
  if (!asset) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Read scope mirrors GET /api/assets: viewAll holders see any asset; others
  // only the assets currently assigned to them.
  const canViewAll = await userCan(userId, orgId, "Asset", "viewAll");
  if (!canViewAll) {
    const assigned = await assignedAssetIdsForEmail(orgId, userEmail);
    if (!assigned.includes(id)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (!asset.invoiceFileKey) {
    return NextResponse.json({ success: false, error: "No invoice attached" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readInvoice(asset.invoiceFileKey);
  } catch {
    return NextResponse.json({ success: false, error: "Invoice file missing on disk" }, { status: 404 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const filename = (asset.invoiceFileName || "invoice").replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.invoiceFileType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

export const POST = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const [writable] = await writableAssetIds(orgId, userId, userEmail, [id]);
  if (!writable) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const asset = await db.astAsset.findFirst({
    where: { id, orgId },
    select: { id: true, invoiceFileKey: true, itemName: true, itemCode: true },
  });
  if (!asset) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }
  const ext = ALLOWED_INVOICE_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { success: false, error: "Only PDF or image files (PNG, JPG, WEBP, GIF) are allowed" },
      { status: 400 },
    );
  }
  if (file.size === 0) return NextResponse.json({ success: false, error: "File is empty" }, { status: 400 });
  if (file.size > MAX_INVOICE_BYTES) {
    return NextResponse.json(
      { success: false, error: `File exceeds the ${Math.round(MAX_INVOICE_BYTES / (1024 * 1024))}MB limit` },
      { status: 400 },
    );
  }

  const key = buildInvoiceKey(orgId, id, ext);
  await saveInvoice(key, Buffer.from(await file.arrayBuffer()));
  // Drop the previous file if this replaces one.
  if (asset.invoiceFileKey && asset.invoiceFileKey !== key) await deleteInvoice(asset.invoiceFileKey);

  const updated = await db.astAsset.update({
    where: { id },
    data: {
      invoiceFileKey: key,
      invoiceFileName: file.name,
      invoiceFileType: file.type,
      invoiceFileSize: file.size,
    },
    include: { baseCategory: true, category: true },
  });
  await audit({
    orgId,
    module: "Assets",
    action: "Invoice Uploaded",
    entityId: id,
    entityName: `${asset.itemName} (${asset.itemCode})`,
    details: file.name,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const [writable] = await writableAssetIds(orgId, userId, userEmail, [id]);
  if (!writable) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const asset = await db.astAsset.findFirst({
    where: { id, orgId },
    select: { id: true, invoiceFileKey: true, itemName: true, itemCode: true },
  });
  if (!asset) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (asset.invoiceFileKey) await deleteInvoice(asset.invoiceFileKey);

  const updated = await db.astAsset.update({
    where: { id },
    data: { invoiceFileKey: null, invoiceFileName: null, invoiceFileType: null, invoiceFileSize: null },
    include: { baseCategory: true, category: true },
  });
  await audit({
    orgId,
    module: "Assets",
    action: "Invoice Removed",
    entityId: id,
    entityName: `${asset.itemName} (${asset.itemCode})`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: updated });
});
