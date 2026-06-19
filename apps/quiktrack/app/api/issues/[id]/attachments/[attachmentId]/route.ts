import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { getPresignedGetUrl, keyBelongsToTenant } from "@/lib/s3";

/**
 * Returns a short-lived presigned GET URL for the attachment, or 302
 * redirects to it when `?redirect=1` is set (handy for `<a href>` download
 * links). Tenant isolation enforced two ways: row.orgId match + s3Key prefix.
 */
export const GET = withOrgAuth<{ id: string; attachmentId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!access && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const att = await db.qtIssueAttachment.findFirst({
      where: { id: params.attachmentId, issueId: params.id, orgId },
      select: { s3Key: true, fileName: true, mimeType: true },
    });
    if (!att || !keyBelongsToTenant(att.s3Key, orgId)) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const forceDownload = searchParams.get("download") === "1";
    const url = await getPresignedGetUrl(
      att.s3Key,
      300,
      forceDownload ? att.fileName : undefined,
    );
    if (forceDownload || searchParams.get("redirect") === "1") {
      return NextResponse.redirect(url, { status: 302 });
    }
    return NextResponse.json({
      success: true,
      data: { url, fileName: att.fileName, mimeType: att.mimeType },
    });
  },
);
