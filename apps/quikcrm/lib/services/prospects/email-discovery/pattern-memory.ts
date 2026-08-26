/**
 * Per-org, per-domain memory of the email pattern that worked.
 *
 * The source implementation kept this in a module-level `Map`. That works for a
 * long-lived cron process but not for a serverless route, where every cold start
 * begins with an empty cache and re-pays for a provider lookup it already made.
 * Persisting to Postgres makes the second prospect at a company effectively free
 * and shares the knowledge across instances.
 *
 * Scoped by orgId rather than globally: cross-tenant data sharing is prohibited
 * repo-wide, and there is no exemption for "it's only a pattern".
 */
import { db } from "@/lib/db";
import { isEmailPattern } from "./patterns";

/** The learned pattern for a domain, or "" when none is stored. */
export async function getRememberedPattern(orgId: string, domain: string): Promise<string> {
  if (!orgId || !domain) return "";
  const row = await db.crmOrgEmailPattern.findUnique({
    where: { org_email_pattern_uk: { orgId, domain } },
    select: { pattern: true },
  });
  return row?.pattern ?? "";
}

/**
 * Remember the pattern for a domain.
 *
 * Only patterns in the known set are stored — a provider can return notation we
 * failed to normalise, and persisting that would poison every later run at the
 * domain with a key `buildFromPattern` cannot honour.
 *
 * Never throws: pattern memory is an optimisation, and failing to record it must
 * not fail a discovery run that already found an address.
 */
export async function rememberPattern(
  orgId: string,
  domain: string,
  pattern: string,
  source: string,
): Promise<void> {
  if (!orgId || !domain || !isEmailPattern(pattern)) return;
  try {
    await db.crmOrgEmailPattern.upsert({
      where: { org_email_pattern_uk: { orgId, domain } },
      create: { orgId, domain, pattern, source },
      update: { pattern, source },
    });
  } catch (error: unknown) {
    console.error("[email-discovery] rememberPattern failed", error);
  }
}
