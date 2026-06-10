import type { CrmActivity } from "@quikit/database";
import { resolveRelatedLabels, rowKey } from "./related-label-batch";

export type ActivityOutreachApi = {
  country: string;
  followupPriority: string;
  activityOwnerUserId: string | null;
  disposition: string;
  subDisposition: string;
  subSubDisposition: string;
  competitor: string;
  competitorDetails: string;
  channel: string;
  currentSystemDetails: string;
  detailNotes: string;
  scheduledAt: string | null;
};

export type ActivityLeadLogApi = {
  activityCode: string;
  logOutcome: string;
  detailNotes: string;
  followUpAt: string | null;
  opportunityId: string | null;
};

export type ActivityRow = {
  id: string;
  type: string;
  relatedKind: string;
  relatedObjectId: string;
  relatedLabel: string;
  subject: string;
  outcome: string;
  owner: string;
  ownerId: string | null;
  when: string;
  occurredAtIso: string;
  outreach?: ActivityOutreachApi;
  leadLog?: ActivityLeadLogApi;
  linkedCallLogId: string | null;
  detailNotes: string;
  followUpAt: string | null;
  relatedOrphanedAt: string | null;
};

function formatWhenInTz(d: Date | null | undefined, tz: string): string {
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16);
  }
}

function readOutreach(o: unknown): ActivityOutreachApi | undefined {
  if (!o || typeof o !== "object") return undefined;
  const x = o as Record<string, unknown>;
  return {
    country: typeof x.country === "string" ? x.country : "",
    followupPriority: typeof x.followupPriority === "string" ? x.followupPriority : "",
    activityOwnerUserId:
      typeof x.activityOwnerUserId === "string" && x.activityOwnerUserId
        ? x.activityOwnerUserId
        : null,
    disposition: typeof x.disposition === "string" ? x.disposition : "",
    subDisposition: typeof x.subDisposition === "string" ? x.subDisposition : "",
    subSubDisposition: typeof x.subSubDisposition === "string" ? x.subSubDisposition : "",
    competitor: typeof x.competitor === "string" ? x.competitor : "",
    competitorDetails: typeof x.competitorDetails === "string" ? x.competitorDetails : "",
    channel: typeof x.channel === "string" ? x.channel : "",
    currentSystemDetails: typeof x.currentSystemDetails === "string" ? x.currentSystemDetails : "",
    detailNotes: typeof x.detailNotes === "string" ? x.detailNotes : "",
    scheduledAt: typeof x.scheduledAt === "string" ? x.scheduledAt : null,
  };
}

function readLeadLog(d: CrmActivity): ActivityLeadLogApi | undefined {
  if (!d.activityCode && !d.logOutcome && !d.detailNotes && !d.followUpAt && !d.opportunityId) {
    return undefined;
  }
  return {
    activityCode: d.activityCode ?? "",
    logOutcome: d.logOutcome ?? "",
    detailNotes: d.detailNotes ?? "",
    followUpAt: d.followUpAt ? d.followUpAt.toISOString() : null,
    opportunityId: d.opportunityId ?? null,
  };
}

export async function toListRows(
  orgId: string,
  rows: ReadonlyArray<CrmActivity>,
  tz: string,
): Promise<ActivityRow[]> {
  const labelMap = await resolveRelatedLabels(orgId, rows);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    relatedKind: r.relatedKind,
    relatedObjectId: r.relatedObjectId,
    relatedLabel: labelMap.get(rowKey(r)) ?? "—",
    subject: r.subject ?? "",
    outcome: r.outcome ?? "",
    owner: r.ownerName ?? "",
    ownerId: r.ownerId ?? null,
    when: formatWhenInTz(r.occurredAt ?? r.createdAt, tz),
    occurredAtIso: (r.occurredAt ?? r.createdAt).toISOString(),
    outreach: readOutreach(r.outreach),
    leadLog: readLeadLog(r),
    linkedCallLogId: r.linkedCallLogId ?? null,
    detailNotes: r.detailNotes ?? "",
    followUpAt: r.followUpAt ? r.followUpAt.toISOString() : null,
    relatedOrphanedAt: r.relatedOrphanedAt ? r.relatedOrphanedAt.toISOString() : null,
  }));
}

export async function toListRow(
  orgId: string,
  row: CrmActivity,
  tz: string,
): Promise<ActivityRow> {
  const [out] = await toListRows(orgId, [row], tz);
  return out!;
}
