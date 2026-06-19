// Batched related-label resolver. Avoid the per-row N+1 the reference service has:
//   - group rows by relatedKind (case-insensitive)
//   - one $in query per kind
//   - "(deleted)" short-circuit when relatedOrphanedAt is non-null
import { prisma } from "@/lib/db/prisma";

type RowLike = {
  relatedKind: string;
  relatedObjectId: string;
  relatedOrphanedAt?: Date | null;
};

const ORPHANED_LABEL = "(deleted)";
const FALLBACK_LABEL = "—";

function normalizeKind(k: string): "lead" | "opportunity" | "contact" | "account" | "unknown" {
  const lower = k.toLowerCase();
  if (lower === "lead") return "lead";
  if (lower === "opportunity") return "opportunity";
  if (lower === "contact") return "contact";
  if (lower === "account") return "account";
  return "unknown";
}

export async function resolveRelatedLabels(
  orgId: string,
  rows: ReadonlyArray<RowLike>,
): Promise<Map<string, string>> {
  const live = rows.filter((r) => !r.relatedOrphanedAt);
  const byKind: Record<"lead" | "opportunity" | "contact" | "account", Set<string>> = {
    lead: new Set(),
    opportunity: new Set(),
    contact: new Set(),
    account: new Set(),
  };
  for (const r of live) {
    const k = normalizeKind(r.relatedKind);
    if (k === "unknown") continue;
    byKind[k].add(r.relatedObjectId);
  }

  const [leads, opps, contacts, accounts] = await Promise.all([
    byKind.lead.size
      ? prisma.crmLead.findMany({
          where: { orgId, id: { in: [...byKind.lead] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    byKind.opportunity.size
      ? prisma.crmOpportunity.findMany({
          where: { orgId, id: { in: [...byKind.opportunity] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    byKind.contact.size
      ? prisma.crmContact.findMany({
          where: { orgId, id: { in: [...byKind.contact] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    byKind.account.size
      ? prisma.crmAccount.findMany({
          where: { orgId, id: { in: [...byKind.account] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const map = new Map<string, string>();
  const key = (kind: string, id: string) => `${normalizeKind(kind)}:${id}`;

  for (const l of leads) map.set(key("lead", l.id), l.name || FALLBACK_LABEL);
  for (const o of opps) map.set(key("opportunity", o.id), o.name || FALLBACK_LABEL);
  for (const c of contacts) {
    const label = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || FALLBACK_LABEL;
    map.set(key("contact", c.id), label);
  }
  for (const a of accounts) map.set(key("account", a.id), a.name || FALLBACK_LABEL);

  // Build per-row label map keyed by raw `relatedObjectId` for caller convenience.
  // Caller looks up via labelOf(row) below — we expose that helper too.
  const rowMap = new Map<string, string>();
  for (const r of rows) {
    if (r.relatedOrphanedAt) {
      rowMap.set(rowKey(r), ORPHANED_LABEL);
      continue;
    }
    const lookup = map.get(key(r.relatedKind, r.relatedObjectId));
    rowMap.set(rowKey(r), lookup ?? ORPHANED_LABEL);
  }
  return rowMap;
}

export function rowKey(r: RowLike): string {
  return `${r.relatedKind.toLowerCase()}:${r.relatedObjectId}`;
}
