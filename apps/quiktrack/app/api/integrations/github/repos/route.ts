/**
 * Repo linking API for the GitHub integration. Admin-only.
 *
 *   GET    ?installationId=...   → { available[] (live from GitHub), linked[] }
 *   POST   { installationId, repoId, repoFullName, defaultBranch?, projectId? }
 *   DELETE ?repoId=...           → soft-unlink (isActive=false)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import {
  listInstallationRepos,
  listLinkedRepos,
  linkRepo,
  unlinkRepo,
} from "@/lib/services/github/repo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const installationId = new URL(req.url).searchParams.get("installationId");
    const linked = await listLinkedRepos(orgId);
    let available: Awaited<ReturnType<typeof listInstallationRepos>> = [];
    if (installationId) {
      available = await listInstallationRepos(orgId, installationId);
    }
    return NextResponse.json({ success: true, data: { available, linked } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list repos";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

const linkSchema = z.object({
  installationId: z.string().trim().min(1),
  repoId: z.string().trim().min(1),
  repoFullName: z.string().trim().min(3),
  defaultBranch: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = linkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const row = await linkRepo({
      orgId,
      installationRowId: parsed.data.installationId,
      repoId: parsed.data.repoId,
      repoFullName: parsed.data.repoFullName,
      defaultBranch: parsed.data.defaultBranch,
      projectId: parsed.data.projectId ?? null,
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to link repo";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const repoId = new URL(req.url).searchParams.get("repoId");
    if (!repoId) {
      return NextResponse.json(
        { success: false, error: "repoId is required" },
        { status: 400 },
      );
    }
    const count = await unlinkRepo(orgId, repoId);
    return NextResponse.json({ success: true, data: { unlinked: count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to unlink repo";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
