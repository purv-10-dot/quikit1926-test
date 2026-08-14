/**
 * Persistence for GitHub App installations.
 *
 * Records a connected installation (org-scoped) and caches its short-lived
 * installation access token encrypted at rest. All reads/writes are filtered
 * by `orgId` (tenant isolation — app CLAUDE.md rule 5).
 */

import { db } from "@/lib/db";
import { encryptToken } from "@/lib/crypto/token-cipher";
import { createInstallationToken } from "@/lib/services/github/client";

export interface RecordInstallationInput {
  orgId: string;
  installationId: string;
  githubAccountLogin: string;
  githubAccountId?: string | null;
  targetType?: string;
  repoSelection?: string;
  createdBy?: string | null;
}

/**
 * Upsert the installation for an org and prime its encrypted access token.
 * Idempotent on (orgId, installationId): re-running the install flow updates
 * the existing row rather than duplicating it.
 */
export async function recordInstallation(
  input: RecordInstallationInput,
): Promise<{ id: string }> {
  // Mint + encrypt the first installation token. If GitHub is unreachable we
  // still record the installation (token stays null) so the connect UI can
  // show it and a later backfill can retry the token mint.
  let accessTokenEnc: string | null = null;
  let tokenExpiresAt: Date | null = null;
  let lastError: string | null = null;
  try {
    const tok = await createInstallationToken(input.installationId);
    accessTokenEnc = encryptToken(tok.token);
    tokenExpiresAt = new Date(tok.expiresAt);
  } catch (error: unknown) {
    lastError = error instanceof Error ? error.message : "Token mint failed";
  }

  const common = {
    githubAccountLogin: input.githubAccountLogin,
    githubAccountId: input.githubAccountId ?? null,
    targetType: input.targetType ?? "Organization",
    repoSelection: input.repoSelection ?? "SELECTED",
    accessTokenEnc,
    tokenExpiresAt,
    status: "ACTIVE",
    lastError,
  };

  const row = await db.qtGithubInstallation.upsert({
    where: {
      orgId_installationId: {
        orgId: input.orgId,
        installationId: input.installationId,
      },
    },
    create: {
      orgId: input.orgId,
      installationId: input.installationId,
      createdBy: input.createdBy ?? null,
      backfillStatus: "PENDING",
      ...common,
    },
    update: common,
    select: { id: true },
  });
  return row;
}

/** Fetch an org's installations for the settings UI (no secrets in payload). */
export function listInstallations(orgId: string) {
  return db.qtGithubInstallation.findMany({
    where: { orgId },
    select: {
      id: true,
      installationId: true,
      githubAccountLogin: true,
      targetType: true,
      repoSelection: true,
      backfillStatus: true,
      backfilledFrom: true,
      status: true,
      lastError: true,
      tokenExpiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fully disconnect an installation for an org: delete its linked repos and all
 * linked dev rows (branches / commits / PRs) for those repos, then delete the
 * installation itself. Org-scoped throughout so one org can never remove
 * another's connection.
 *
 * This does NOT uninstall the App on GitHub — the operator does that from
 * GitHub to fully revoke access. This clears QuikTrack's stored connection +
 * data so the UI reflects a clean disconnected state.
 */
export async function disconnectInstallation(
  orgId: string,
  installationRowId: string,
): Promise<{ removed: boolean }> {
  const inst = await db.qtGithubInstallation.findFirst({
    where: { id: installationRowId, orgId },
    select: { id: true },
  });
  if (!inst) return { removed: false };

  // Scope the dev-row cleanup to this installation's repos.
  const repos = await db.qtGithubRepo.findMany({
    where: { orgId, installationId: installationRowId },
    select: { repoId: true },
  });
  const repoIds = repos.map((r) => r.repoId);

  if (repoIds.length > 0) {
    await db.qtDevBranch.deleteMany({ where: { orgId, repoId: { in: repoIds } } });
    await db.qtDevCommit.deleteMany({ where: { orgId, repoId: { in: repoIds } } });
    await db.qtDevPullRequest.deleteMany({ where: { orgId, repoId: { in: repoIds } } });
  }
  // QtGithubRepo cascades from the installation FK; delete explicitly first to
  // stay resilient if that relation changes.
  await db.qtGithubRepo.deleteMany({ where: { orgId, installationId: installationRowId } });
  await db.qtGithubInstallation.deleteMany({ where: { id: installationRowId, orgId } });

  return { removed: true };
}
