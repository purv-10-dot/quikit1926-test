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
const STANDALONE_LABEL = "—"; // standalone (unlinked) activities show no record

type NormalizedKind =
  | "lead"
  | "opportunity"
  | "contact"
  | "account"
  | "prospect"
  | "upwork"
  | "unknown";

function normalizeKind(k: string): NormalizedKind {
  const lower = k.toLowerCase();
  if (lower === "lead") return "lead";
  if (lower === "opportunity") return "opportunity";
  if (lower === "contact") return "contact";
  if (lower === "account") return "account";
  if (lower === "prospect") return "prospect";
  if (lower === "upwork") return "upwork";
  return "unknown";
}

export async function resolveRelatedLabels(
  orgId: string,
  rows: ReadonlyArray<RowLike>,
): Promise<Map<string, string>> {
  const live = rows.filter((r) => !r.relatedOrphanedAt);
  const byKind: Record<Exclude<NormalizedKind, "unknown">, Set<string>> = {
    lead: new Set(),
    opportunity: new Set(),
    contact: new Set(),
    account: new Set(),
    prospect: new Set(),
    upwork: new Set(),
  };
  for (const r of live) {
    const k = normalizeKind(r.relatedKind);
    if (k === "unknown") continue;
    byKind[k].add(r.relatedObjectId);
  }

  const [leads, opps, contacts, accounts, prospects, upworkJobs] = await Promise.all([
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
    byKind.prospect.size
      ? prisma.crmProspect.findMany({
          where: { orgId, id: { in: [...byKind.prospect] } },
          select: { id: true, name: true, company: true },
        })
      : Promise.resolve([]),
    byKind.upwork.size
      ? prisma.crmUpworkJob.findMany({
          where: { orgId, id: { in: [...byKind.upwork] } },
          select: { id: true, jobTitle: true },
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
  for (const p of prospects) {
    // Same "Name — Company" shape the prospect picker shows, so the label in the
    // activities list matches what the user selected in the composer.
    const label = p.company ? `${p.name || FALLBACK_LABEL} — ${p.company}` : p.name;
    map.set(key("prospect", p.id), label || FALLBACK_LABEL);
  }
  for (const j of upworkJobs) map.set(key("upwork", j.id), j.jobTitle || FALLBACK_LABEL);

  // Build per-row label map keyed by raw `relatedObjectId` for caller convenience.
  // Caller looks up via labelOf(row) below — we expose that helper too.
  const rowMap = new Map<string, string>();
  for (const r of rows) {
    // Standalone (unlinked) activity: no related record — show "—", not "(deleted)".
    if (r.relatedKind === "None") {
      rowMap.set(rowKey(r), STANDALONE_LABEL);
      continue;
    }
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
