import { db } from "@/lib/db";
import type { CompanyProfilePatchInput } from "@/lib/validators/company-profile";

export type CompanyProfileDto = {
  companyName: string;
  logoUrl: string | null;
  website: string | null;
  phone: string | null;
  industry: string | null;
  employees: string | null;
};

export type TenantCompanyBranding = {
  companyName: string;
  logoUrl: string | null;
  website: string | null;
  phone: string | null;
};

const FALLBACK_NAME = "Your Company";

/**
 * Branding shown on quote PDFs and settings.
 * Primary: QcfCompanyProfile (Settings → Company).
 * Fallback: QuikIT org name (tenantId === org.id).
 */
export async function getTenantCompanyBranding(
  tenantId: string,
): Promise<TenantCompanyBranding> {
  const [profile, org] = await Promise.all([
    db.qcfCompanyProfile.findUnique({
      where: { tenantId },
      select: { companyName: true, logoUrl: true, website: true, phone: true },
    }),
    db.org.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    }),
  ]);

  const profileName = profile?.companyName?.trim();
  const orgName = org?.name?.trim();

  return {
    companyName: profileName || orgName || FALLBACK_NAME,
    logoUrl: profile?.logoUrl ?? org?.logoUrl ?? null,
    website: profile?.website ?? null,
    phone: profile?.phone ?? null,
  };
}

/** Settings form — merges profile row with org fallbacks for display defaults. */
export async function getCompanyProfileForSettings(
  tenantId: string,
): Promise<CompanyProfileDto> {
  const [profile, org] = await Promise.all([
    db.qcfCompanyProfile.findUnique({ where: { tenantId } }),
    db.org.findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } }),
  ]);
  const orgName = org?.name?.trim() || FALLBACK_NAME;
  return {
    companyName: profile?.companyName?.trim() || orgName,
    logoUrl: profile?.logoUrl ?? org?.logoUrl ?? null,
    website: profile?.website ?? null,
    phone: profile?.phone ?? null,
    industry: profile?.industry ?? null,
    employees: profile?.employees ?? null,
  };
}

export async function upsertCompanyProfile(
  tenantId: string,
  input: CompanyProfilePatchInput,
): Promise<CompanyProfileDto> {
  const row = await db.qcfCompanyProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      companyName: input.companyName,
      industry: input.industry,
      website: input.website,
      phone: input.phone,
      employees: input.employees,
      logoUrl: input.logoUrl,
    },
    update: {
      companyName: input.companyName,
      industry: input.industry,
      website: input.website,
      phone: input.phone,
      employees: input.employees,
      logoUrl: input.logoUrl,
    },
  });
  return {
    companyName: row.companyName,
    logoUrl: row.logoUrl,
    website: row.website,
    phone: row.phone,
    industry: row.industry,
    employees: row.employees,
  };
}
