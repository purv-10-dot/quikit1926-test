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
import { getProvider } from "@/lib/services/github/repo-service";
import { fireTriggerForIssues } from "@/lib/services/workflow/fire-trigger";

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

    const provider = await getProvider(orgId, repo.installationId);
    const created = await provider.createBranch(repo.repoFullName, sourceBranch, branchName);

    // Record the link immediately (don't wait for the create webhook).
    await db.qtDevBranch.upsert({
      where: {
        issueId_repoId_name: { issueId, repoId, name: branchName },
      },
      create: {
        orgId,
        issueId,
        repoId,
        repoFullName: repo.repoFullName,
        name: created.name,
        url: created.url,
      },
      update: { url: created.url },
    });

    // Fire any "Branch created" workflow trigger for this item now — the GitHub
    // webhook can't reach a local dev server, and even in prod this endpoint
    // already owns the link, so we drive the auto-transition here directly.
    await fireTriggerForIssues(orgId, [issueId], "branch_created");

    return NextResponse.json(
      { success: true, data: { name: created.name, url: created.url } },
      { status: 201 },
    );
  },
  { fallbackErrorMessage: "Failed to create branch" },
);
