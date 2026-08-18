import { db } from "@/lib/db";

const BUILT_IN_TEMPLATES = [
  {
    key: "b2b-standard",
    name: "B2B Standard",
    description: "Classic B2B quotation with GST breakdown",
    layout: "b2b",
    themeColor: "#1d4ed8",
    isDefault: true,
  },
  {
    key: "saas-proposal",
    name: "SaaS Proposal",
    description: "Subscription-style proposal layout",
    layout: "saas",
    themeColor: "#7c3aed",
    isDefault: false,
  },
  {
    key: "construction",
    name: "Construction",
    description: "Project-based quote with milestone terms",
    layout: "construction",
    themeColor: "#b45309",
    isDefault: false,
  },
  {
    key: "services",
    name: "Service Proposal",
    description: "Professional services engagement",
    layout: "services",
    themeColor: "#059669",
    isDefault: false,
  },
] as const;

export async function ensureDefaultQuoteTemplates(orgId: string): Promise<void> {
  const count = await db.qceQuoteTemplate.count({ where: { orgId } });
  if (count > 0) return;
  await db.qceQuoteTemplate.createMany({
    data: BUILT_IN_TEMPLATES.map((t) => ({
      orgId,
      key: t.key,
      name: t.name,
      description: t.description,
      layout: t.layout,
      themeColor: t.themeColor,
      isDefault: t.isDefault,
      termsDefault:
        "Prices are valid for the period mentioned. Payment terms: 50% advance, balance on delivery. Subject to our standard terms.",
      watermarkText: null,
    })),
  });
}

export async function listQuoteTemplates(orgId: string) {
  await ensureDefaultQuoteTemplates(orgId);
  return db.qceQuoteTemplate.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function getQuoteTemplate(orgId: string, key: string) {
  await ensureDefaultQuoteTemplates(orgId);
  return db.qceQuoteTemplate.findFirst({
    where: { orgId, key, isActive: true },
  });
}
