import { db } from "@/lib/db";
import { toNumber } from "@/lib/services/quotes/decimal";
import { loadRevisionChain } from "@/lib/services/quotes/quote-service";

export interface VersionLineDiff {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export interface VersionComparison {
  quoteA: { id: string; quoteNumber: string; versionNumber: number };
  quoteB: { id: string; quoteNumber: string; versionNumber: number };
  headerChanges: VersionLineDiff[];
  lineChanges: {
    lineNumber: number;
    productName: string;
    changes: VersionLineDiff[];
  }[];
}

export async function compareQuoteVersions(
  tenantId: string,
  quoteIdA: string,
  quoteIdB: string,
): Promise<VersionComparison> {
  const [a, b] = await Promise.all([
    db.crmQuote.findFirst({
      where: { id: quoteIdA, tenantId },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    }),
    db.crmQuote.findFirst({
      where: { id: quoteIdB, tenantId },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    }),
  ]);
  if (!a || !b) throw new Error("One or both quotes not found");

  const headerChanges: VersionLineDiff[] = [];
  const pushNum = (field: string, from: number, to: number) => {
    if (from !== to) headerChanges.push({ field, from, to });
  };
  pushNum("grandTotal", toNumber(a.grandTotal), toNumber(b.grandTotal));
  pushNum("overallDiscount", toNumber(a.overallDiscountAmount), toNumber(b.overallDiscountAmount));
  pushNum("freight", toNumber(a.freightAmount), toNumber(b.freightAmount));

  const lineChanges: VersionComparison["lineChanges"] = [];
  const maxLines = Math.max(a.lines.length, b.lines.length);
  for (let i = 0; i < maxLines; i++) {
    const la = a.lines[i];
    const lb = b.lines[i];
    if (!la || !lb) continue;
    const changes: VersionLineDiff[] = [];
    if (toNumber(la.quantity) !== toNumber(lb.quantity)) {
      changes.push({ field: "quantity", from: toNumber(la.quantity), to: toNumber(lb.quantity) });
    }
    if (toNumber(la.unitPrice) !== toNumber(lb.unitPrice)) {
      changes.push({ field: "unitPrice", from: toNumber(la.unitPrice), to: toNumber(lb.unitPrice) });
    }
    if (toNumber(la.discountPct) !== toNumber(lb.discountPct)) {
      changes.push({
        field: "discountPct",
        from: toNumber(la.discountPct),
        to: toNumber(lb.discountPct),
      });
    }
    if (changes.length > 0) {
      lineChanges.push({
        lineNumber: la.lineNumber,
        productName: la.productName,
        changes,
      });
    }
  }

  return {
    quoteA: { id: a.id, quoteNumber: a.quoteNumber, versionNumber: a.versionNumber },
    quoteB: { id: b.id, quoteNumber: b.quoteNumber, versionNumber: b.versionNumber },
    headerChanges,
    lineChanges,
  };
}

export async function listComparableVersions(tenantId: string, quoteId: string) {
  const row = await db.crmQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { parentQuoteId: true },
  });
  return loadRevisionChain(tenantId, quoteId, row?.parentQuoteId ?? null);
}
