import { db } from "@/lib/db";
import { getQuoteEnterpriseSettings, type QuoteCpqRule } from "./settings";

export interface CpqSuggestion {
  productId: string;
  productName: string;
  sku: string | null;
  listPrice: number;
  reason: string;
}

export interface BundleComponent {
  productId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

/** Expand a bundle product into component lines for the quote. */
export async function expandProductBundle(
  orgId: string,
  bundleProductId: string,
): Promise<BundleComponent[]> {
  const product = await db.qcfProduct.findFirst({
    where: { id: bundleProductId, orgId, deletedAt: null, productType: "Bundle" },
    select: {
      id: true,
      name: true,
      sku: true,
      listPrice: true,
      gstRate: true,
      dynamicFields: true,
    },
  });
  if (!product) return [];

  const rawBundle = product.dynamicFields as { bundleComponents?: BundleComponent[] } | null;
  const configured = rawBundle?.bundleComponents ?? [];

  if (configured.length > 0) return configured;

  return [
    {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: 1,
      unitPrice: Number(String(product.listPrice)),
      gstRate: Number(String(product.gstRate)),
    },
  ];
}

export async function getCpqSuggestions(
  orgId: string,
  quoteId: string,
  lineProductIds: string[],
): Promise<CpqSuggestion[]> {
  const settings = await getQuoteEnterpriseSettings(orgId);
  const rules: QuoteCpqRule[] = settings.cpqRules;
  if (rules.length === 0) return [];

  const existing = new Set(lineProductIds);
  const suggestIds = new Set<string>();

  for (const rule of rules) {
    if (lineProductIds.includes(rule.whenProductId)) {
      for (const id of rule.suggestProductIds) {
        if (!existing.has(id)) suggestIds.add(id);
      }
    }
  }
  if (suggestIds.size === 0) return [];

  const products = await db.qcfProduct.findMany({
    where: { orgId, id: { in: [...suggestIds] }, deletedAt: null, isActive: true },
    select: { id: true, name: true, sku: true, listPrice: true },
  });

  return products.map((p) => ({
    productId: p.id,
    productName: p.name,
    sku: p.sku,
    listPrice: Number(String(p.listPrice)),
    reason: "Recommended add-on",
  }));
}
