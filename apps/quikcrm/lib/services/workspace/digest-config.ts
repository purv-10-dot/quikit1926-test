/**
 * Digest workspace settings, stored alongside the dashboard config in
 * CrmOrgWorkspaceSettings.settings.digest. Mirrors getDashboardConfig:
 * read-on-read, NO write, defaults computed in-memory on first read.
 *
 * Shape (decision-locked 2026-06-24):
 *   {
 *     enabled:        boolean,            // DEFAULT false — opt-in. A digest that
 *                                         //   emails leadership must be deliberately
 *                                         //   turned on, never defaulted-on.
 *     frequency:      "daily" | "weekly" | "off",
 *     recipientRoles: string[],           // SessionUser roles — leadership only
 *     types?:         string[],           // configured activity-type subset; absent
 *                                         //   → top-N-by-volume default (digest-run)
 *     optOut?:        string[],           // per-recipient opt-out userIds — shape is
 *                                         //   opt-out-ready so per-user control can be
 *                                         //   added later WITHOUT a rewrite
 *   }
 *
 * Settings UI is intentionally out of scope (same posture as dashboard-config).
 */

import { prisma } from "@/lib/db/prisma";

export type DigestFrequency = "daily" | "weekly" | "off";

export interface DigestConfig {
  enabled: boolean;
  frequency: DigestFrequency;
  recipientRoles: string[];
  types?: string[];
  optOut: string[];
  /**
   * Explicit recipient allow-list (REPLACE semantics): when NON-EMPTY, ONLY these
   * userIds receive the digest and recipientRoles is IGNORED. EMPTY ([]) or absent
   * → fall back to recipientRoles (NOT "email nobody"). "Name exactly who gets it."
   * Each named recipient is still scoped by their REAL role downstream
   * (allow-list = WHO gets it; role = WHAT they see).
   */
  recipientUserIds: string[];
}

// Leadership roles (decision 2): Administrators + SalesManagers. SalesUsers
// excluded (a SalesUser digest is self-surveillance, not management visibility).
export const DEFAULT_DIGEST_RECIPIENT_ROLES = ["Administrator", "SalesManager"];

interface SettingsTree {
  digest?: Partial<DigestConfig>;
  [k: string]: unknown;
}

export async function getDigestConfig(orgId: string): Promise<DigestConfig> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId } });
  const tree = ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
  const cfg = tree.digest ?? {};

  return {
    // DEFAULT DISABLED — opt-in. Only an explicit stored `true` enables it.
    enabled: cfg.enabled === true,
    frequency: isFrequency(cfg.frequency) ? cfg.frequency : "daily",
    recipientRoles:
      Array.isArray(cfg.recipientRoles) && cfg.recipientRoles.length > 0
        ? cfg.recipientRoles
        : DEFAULT_DIGEST_RECIPIENT_ROLES,
    ...(Array.isArray(cfg.types) ? { types: cfg.types } : {}),
    optOut: Array.isArray(cfg.optOut) ? cfg.optOut : [],
    // Allow-list: empty when absent → role fallback downstream (the empty-array
    // edge behaves exactly like absent, never "email nobody").
    recipientUserIds: Array.isArray(cfg.recipientUserIds) ? cfg.recipientUserIds : [],
  };
}

function isFrequency(v: unknown): v is DigestFrequency {
  return v === "daily" || v === "weekly" || v === "off";
}

/**
 * Toggle a user into/out of settings.digest.recipientUserIds (admin write path).
 *
 * Reads the FULL settings tree and splices in only the `digest` key, so sibling
 * keys (leadPipelineConfig, dashboard, …) are preserved — mirrors the read-tree /
 * write-tree merge in pipeline-config.ts.
 *
 * AUTO-FLIP enabled (both directions): enabled = (recipientUserIds.length > 0)
 * after the toggle — first recipient on flips it true, last off flips it false.
 * Keeps "has recipients" and "is enabled" in sync (no recipients-but-disabled
 * silent-nothing, no enabled-but-empty digestCount:0).
 *
 * Idempotent: adding a present id / removing an absent id is a no-op set.
 */
export async function setDigestRecipient(
  orgId: string,
  userId: string,
  enabled: boolean,
): Promise<{ enabled: boolean; recipientUserIds: string[] }> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId } });
  const tree = ((row?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const digest = (tree.digest as Partial<DigestConfig> | undefined) ?? {};

  const current = new Set(Array.isArray(digest.recipientUserIds) ? digest.recipientUserIds : []);
  if (enabled) current.add(userId);
  else current.delete(userId);
  const recipientUserIds = [...current];

  const nextDigest = {
    ...digest,
    recipientUserIds,
    enabled: recipientUserIds.length > 0, // auto-flip both directions
  };
  const nextTree = { ...tree, digest: nextDigest };

  await prisma.crmOrgWorkspaceSettings.upsert({
    where: { orgId },
    create: { orgId, settings: nextTree as object },
    update: { settings: nextTree as object },
  });

  return { enabled: nextDigest.enabled, recipientUserIds };
}
