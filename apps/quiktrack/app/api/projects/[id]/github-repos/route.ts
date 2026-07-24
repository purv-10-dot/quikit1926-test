/**
 * Space-scoped GitHub repo linking.
 *
 *   GET   /api/projects/[id]/github-repos
 *         → all org-linked repos, each flagged linkedToThisSpace.
 *   PATCH /api/projects/[id]/github-repos   { repoId, linked: boolean }
 *         → set/clear this repo's projectId to this Space.
 *
 * Gated by withProjectAccess (ProjectMember:update) — a Space-admin action.
 * A repo may be scoped to at most one Space; linking here reassigns it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { listLinkedRepos, setRepoProject } from "@/lib/services/github/repo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    const repos = await listLinkedRepos(orgId);
    const data = repos
      .filter((r) => r.isActive)
      .map((r) => ({
        repoId: r.repoId,
        repoFullName: r.repoFullName,
        defaultBranch: r.defaultBranch,
        linkedToThisSpace: r.projectId === projectId,
        linkedToOtherSpace: Boolean(r.projectId) && r.projectId !== projectId,
      }));
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } },
);

const patchSchema = z.object({
  repoId: z.string().trim().min(1),
  linked: z.boolean(),
});

export const PATCH = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }, req) => {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { repoId, linked } = parsed.data;
    const count = await setRepoProject(orgId, repoId, linked ? projectId : null);
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "Repository is not linked to this organization." },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, data: { repoId, linked } });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } },
);
