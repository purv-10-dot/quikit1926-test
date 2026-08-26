/**
 * Org-level Upwork Connects pricing configuration.
 *
 * Persisted in the EXISTING `CrmOrgWorkspaceSettings.settings` JSON blob under
 * the `upworkConnects` key — the same per-org settings singleton lead scoring,
 * field config and product fields already use (see
 * lib/services/leads/lead-scoring/config.ts, which this mirrors). No new table
 * and no migration: the requirement is a handful of scalars, and adding a
 * dedicated model for them would be a heavier change than the feature needs.
 *
 * WHY THIS IS CONFIG AND NOT A CONSTANT: the package price moves (100 Connects
 * may be $15 today and $20 later) and so does the USD→INR rate. Both are read
 * at calculation time, so changing them here changes every future calculation
 * without a code change. Nothing is hard-coded at the call site.
 *
 * NOT AN FX SERVICE: `usdToInr` is a manually configured number. Sales Cost has
 * no live exchange-rate mechanism today and this deliberately does not add one.
 *
 * Distinct from CONSUMPTION: this module answers "what does a Connect cost",
 * never "how many Connects were used" — the latter comes from CrmUpworkJob and
 * lives in connects-usage.ts.
 */
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_UPWORK_CONNECTS_CONFIG,
  type UpworkConnectsConfig,
} from "@/lib/services/sales-cost/connects-shared";

/**
 * Re-exported from connects-shared.ts so server-side callers can keep importing
 * everything Connects-related from this one module. The definitions live there
 * because client components need them too and this file imports Prisma.
 */
export {
  UPWORK_CONNECTS_TOOL_NAME,
  isUpworkConnectsTool,
  DEFAULT_UPWORK_CONNECTS_CONFIG,
  type UpworkConnectsConfig,
} from "@/lib/services/sales-cost/connects-shared";

/**
 * `packageConnects` must be > 0: it is a divisor, and a 0 would produce
 * Infinity in the cost. The upper bounds keep a typo from overflowing the
 * Decimal(18,2) the cost is ultimately stored in.
 */
export const upworkConnectsConfigSchema = z.object({
  packageConnects: z
    .number()
    .int("Package size must be a whole number of Connects")
    .positive("Package size must be greater than 0")
    .max(1_000_000),
  packagePriceUsd: z
    .number()
    .finite()
    .nonnegative("Package price cannot be negative")
    .max(1_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  usdToInr: z
    .number()
    .finite()
    .positive("Conversion rate must be greater than 0")
    .max(100_000),
});

interface SettingsTree {
  upworkConnects?: unknown;
  [k: string]: unknown;
}

async function readTree(orgId: string): Promise<SettingsTree> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

/**
 * Rewrites only the `upworkConnects` key, spreading the rest of the tree
 * through untouched — the blob is shared with lead scoring and field config,
 * so a blind overwrite here would wipe unrelated settings.
 */
async function writeTree(orgId: string, next: SettingsTree): Promise<void> {
  await prisma.crmOrgWorkspaceSettings.upsert({
    where: { orgId },
    create: { orgId, settings: next as object },
    update: { settings: next as object },
  });
}

/** Malformed stored JSON falls back to defaults rather than throwing. */
function parseConfig(raw: unknown): UpworkConnectsConfig {
  const parsed = upworkConnectsConfigSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_UPWORK_CONNECTS_CONFIG };
  return parsed.data;
}

export async function getUpworkConnectsConfig(orgId: string): Promise<UpworkConnectsConfig> {
  const tree = await readTree(orgId);
  return parseConfig(tree.upworkConnects ?? DEFAULT_UPWORK_CONNECTS_CONFIG);
}

/** Partial patch merged over the CURRENT stored values, then re-validated. */
export async function setUpworkConnectsConfig(
  orgId: string,
  patch: Partial<UpworkConnectsConfig>,
): Promise<UpworkConnectsConfig> {
  const tree = await readTree(orgId);
  const current = parseConfig(tree.upworkConnects ?? DEFAULT_UPWORK_CONNECTS_CONFIG);
  const merged: UpworkConnectsConfig = {
    packageConnects: patch.packageConnects ?? current.packageConnects,
    packagePriceUsd: patch.packagePriceUsd ?? current.packagePriceUsd,
    currency: patch.currency ?? current.currency,
    usdToInr: patch.usdToInr ?? current.usdToInr,
  };
  const validated = upworkConnectsConfigSchema.parse(merged);
  await writeTree(orgId, { ...tree, upworkConnects: validated });
  return validated;
}
