/**
 * Workspace phone configuration — reads the default country used to parse bare
 * (country-code-less) phone numbers.
 *
 * Stored on QceOrgWorkspaceSettings.settings.phoneConfig.defaultCountry — the
 * SAME JSON blob the lead pipeline config lives in (see pipeline-config.ts).
 * This is a plain JSON key read: no dedicated Prisma column or migration.
 */
import { prisma } from "@/lib/db/prisma";

interface PhoneSettingsTree {
  phoneConfig?: { defaultCountry?: unknown };
  [k: string]: unknown;
}

/**
 * Resolve the tenant's default phone country (e.g. "IN"), falling back to "IN".
 *
 * Deliberate India-default fallback: the CrmExpress tenant is India-only as of
 * 2026-07, so a missing `phoneConfig.defaultCountry` means "IN". This is NOT a
 * permanent assumption — revisit (make it required / genuinely per-tenant) if
 * non-India tenants appear.
 */
export async function getWorkspacePhoneDefaultCountry(orgId: string): Promise<string> {
  const row = await prisma.qceOrgWorkspaceSettings.findUnique({ where: { orgId } });
  const settings = ((row?.settings as PhoneSettingsTree | null) ?? {}) as PhoneSettingsTree;
  const country = settings.phoneConfig?.defaultCountry;
  return typeof country === "string" && country.trim()
    ? country.trim().toUpperCase()
    : "IN";
}
