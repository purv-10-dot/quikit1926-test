/**
 * Repository listing + linking for a connected installation.
 *
 * Lists the repos GitHub exposes for an installation (live, via a fresh
 * installation token) and persists which ones QuikTrack tracks as QtGithubRepo,
 * optionally scoped to a Space (projectId). All DB access is org-scoped.
 */

import { db } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { createInstallationToken } from "@/lib/services/github/client";
import { makeScmProvider } from "@/lib/services/scm/provider-factory";
import type { ScmProvider } from "@/lib/services/scm/types";

/**
 * Return a valid installation access token for an org's installation, minting
 * (and re-caching, encrypted) a new one when the cached token is missing or
 * within 5 minutes of expiry.
 */
export async function getInstallationToken(
  orgId: string,
  installationRowId: string,
): Promise<string> {
  const inst = await db.qtGithubInstallation.findFirst({
    where: { id: installationRowId, orgId },
    select: { installationId: true, accessTokenEnc: true, tokenExpiresAt: true },
  });
  if (!inst) throw new Error("Installation not found for this org.");

  const fresh =
    inst.accessTokenEnc &&
    inst.tokenExpiresAt &&
    inst.tokenExpiresAt.getTime() - Date.now() > 5 * 60 * 1000;
  if (fresh && inst.accessTokenEnc) {
    return decryptToken(inst.accessTokenEnc);
  }

  const tok = await createInstallationToken(inst.installationId);
  await db.qtGithubInstallation.updateMany({
    where: { id: installationRowId, orgId },
    data: {
      accessTokenEnc: encryptToken(tok.token),
      tokenExpiresAt: new Date(tok.expiresAt),
    },
  });
  return tok.token;
}

/**
 * Build the SCM provider for an org's installation, with a fresh token. This
 * is what services should use for repo operations — it is provider-agnostic,
 * so GitLab/Bitbucket work here once their providers exist (see
 * lib/services/scm/provider-factory).
 */
export async function getProvider(
  orgId: string,
  installationRowId: string,
): Promise<ScmProvider> {
  const token = await getInstallationToken(orgId, installationRowId);
  // system defaults to "github"; a future column on QtGithubInstallation would
  // select gitlab/bitbucket here.
  return makeScmProvider({ token });
}

/** List repositories accessible to the installation (live from the provider). */
export async function listInstallationRepos(
  orgId: string,
  installationRowId: string,
): Promise<Array<{ repoId: string; repoFullName: string; defaultBranch: string }>> {
  const provider = await getProvider(orgId, installationRowId);
  return provider.listRepos();
}

export interface LinkRepoInput {
  orgId: string;
  installationRowId: string;
  repoId: string;
  repoFullName: string;
  defaultBranch?: string;
  projectId?: string | null;
}

/** Link (upsert) a repo to the org, optionally scoped to a Space. */
export async function linkRepo(input: LinkRepoInput): Promise<{ id: string }> {
  return db.qtGithubRepo.upsert({
    where: { orgId_repoId: { orgId: input.orgId, repoId: input.repoId } },
    create: {
      orgId: input.orgId,
      installationId: input.installationRowId,
      repoId: input.repoId,
      repoFullName: input.repoFullName,
      defaultBranch: input.defaultBranch ?? "main",
      projectId: input.projectId ?? null,
      isActive: true,
    },
    update: {
      repoFullName: input.repoFullName,
      projectId: input.projectId ?? null,
      isActive: true,
    },
    select: { id: true },
  });
}

/** Unlink a repo (soft — flips isActive so history/backfill rows survive). */
export async function unlinkRepo(orgId: string, repoId: string): Promise<number> {
  const res = await db.qtGithubRepo.updateMany({
    where: { orgId, repoId },
    data: { isActive: false },
  });
  return res.count;
}

/** Linked repos for the settings UI. */
export function listLinkedRepos(orgId: string) {
  return db.qtGithubRepo.findMany({
    where: { orgId },
    select: {
      id: true,
      repoId: true,
      repoFullName: true,
      defaultBranch: true,
      projectId: true,
      backfillStatus: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { repoFullName: "asc" },
  });
}

/**
 * Set (or clear, with null) the Space a linked repo belongs to. Scoped by
 * orgId; only affects an active linked repo. Returns rows affected.
 */
export async function setRepoProject(
  orgId: string,
  repoId: string,
  projectId: string | null,
): Promise<number> {
  const res = await db.qtGithubRepo.updateMany({
    where: { orgId, repoId, isActive: true },
    data: { projectId },
  });
  return res.count;
}
