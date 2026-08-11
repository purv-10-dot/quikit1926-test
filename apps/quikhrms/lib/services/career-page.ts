import { prisma } from "@/lib/prisma";

/**
 * Resolve an orgId from a career-page URL slug. Tries the HR-chosen custom
 * slug (`CompanySettings.careerPageSlug`) first, falling back to the org's
 * own immutable `Org.slug` — so the default link keeps working forever even
 * after a custom one is set (an alias, not a replacement).
 */
export async function resolveOrgIdByCareerSlug(slug: string): Promise<string | null> {
  const bySettings = await prisma.companySettings.findFirst({
    where: { careerPageSlug: slug },
    select: { orgId: true },
  });
  if (bySettings) return bySettings.orgId;

  const org = await prisma.org.findUnique({ where: { slug }, select: { id: true } });
  return org?.id ?? null;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Validate a candidate custom career-page slug's format (not uniqueness). */
export function isValidCareerSlugFormat(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && SLUG_PATTERN.test(slug);
}

/**
 * True if `slug` is free to claim as a custom career-page slug — not already
 * used as ANOTHER org's custom slug, and not colliding with ANOTHER org's
 * default `Org.slug`. Setting your own custom slug equal to your OWN default
 * Org.slug is allowed (a harmless no-op alias) — both checks exclude the
 * requesting org itself.
 */
export async function isCareerSlugAvailable(slug: string, excludeOrgId: string): Promise<boolean> {
  const [takenBySettings, orgWithSlug] = await Promise.all([
    prisma.companySettings.findFirst({ where: { careerPageSlug: slug, orgId: { not: excludeOrgId } }, select: { id: true } }),
    prisma.org.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  const takenByOtherOrgSlug = !!orgWithSlug && orgWithSlug.id !== excludeOrgId;
  return !takenBySettings && !takenByOtherOrgSlug;
}
