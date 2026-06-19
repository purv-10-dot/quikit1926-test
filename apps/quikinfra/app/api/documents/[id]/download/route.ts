import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { getDownloadUrl } from "@/lib/storage";

const withOrgAuth = withOrgAuthForModule("documents");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const doc = await db.cnDocument.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  try {
    // The blob lives in S3; redirect to a short-lived presigned URL
    // rather than streaming up to 25 MB back through the lambda.
    const url = await getDownloadUrl(doc.storagePath, doc.fileName);
    return NextResponse.redirect(url);
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
});
