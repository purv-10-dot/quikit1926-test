/**
 * POST /api/issues/[id]/development/branch
 *   { repoId, sourceBranch, branchName }
 *
 * Creates a branch on the linked GitHub repo and records the QtDevBranch link
 * for this work item (Jira's "Create branch" action). Org-scoped; caller must
 * be a member of the issue's project (or a tenant admin).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { getInstallationToken } from "@/lib/services/github/repo-service";
import { createBranch } from "@/lib/services/github/client";

const bodySchema = z.object({
  repoId: z.string().trim().min(1),
  sourceBranch: z.string().trim().min(1),
  branchName: z.string().trim().min(1).max(255),
});

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issueId = params.id;

    const issue = await db.qtIssue.findFirst({
      where: { id: issueId, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { repoId, sourceBranch, branchName } = parsed.data;

    // The repo must be linked to this org (also gives us its full name +
    // installation for the token).
    const repo = await db.qtGithubRepo.findFirst({
      where: { orgId, repoId, isActive: true },
      select: { repoFullName: true, installationId: true },
    });
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository is not linked to this organization." },
        { status: 400 },
      );
    }

    const token = await getInstallationToken(orgId, repo.installationId);
    const created = await createBranch(token, repo.repoFullName, sourceBranch, branchName);

    // Record the link immediately (don't wait for the create webhook).
    const branchUrl = `https://github.com/${repo.repoFullName}/tree/${branchName}`;
    await db.qtDevBranch.upsert({
      where: {
        issueId_repoId_name: { issueId, repoId, name: branchName },
      },
      create: {
        orgId,
        issueId,
        repoId,
        repoFullName: repo.repoFullName,
        name: branchName,
        url: branchUrl,
      },
      update: { url: branchUrl },
    });

    return NextResponse.json(
      { success: true, data: { name: branchName, url: branchUrl, ref: created.ref } },
      { status: 201 },
    );
  },
  { fallbackErrorMessage: "Failed to create branch" },
);
