/**
 * Merges lead-related events into one sortable feed for the unified timeline.
 */
import { activityHeadline } from "@/lib/utils/activity-headline";

export type TimelineItemKind =
  | "call"
  | "email"
  | "note"
  | "meeting"
  | "task"
  | "stage"
  | "system"
  | "opportunity"
  | "document"
  | "activity";

export type TimelineFilter =
  | "all"
  | "calls"
  | "emails"
  | "notes"
  | "tasks"
  | "meetings";

export interface UnifiedTimelineItem {
  id: string;
  kind: TimelineItemKind;
  at: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  /** The underlying QcfActivity id (activity-derived items only). Lets the row
   *  fetch the saved custom disposition field values for the "See form details"
   *  view. Absent on call-log / note / task / doc items. */
  activityId?: string | null;
  /** True only when this row represents a REAL call: either an actual call-log
   *  row, or a "Call" activity linked to one (linkedCallLogId set). A manual
   *  disposition update (no call) is false, so the row renders plain, not green. */
  isRealCall?: boolean;
  /** Present only on call items that have a recording. Rendered as an inline
   *  audio player (through the same-origin /api/telephony/recording proxy) in
   *  the unified timeline, matching the Call Disposition tab. */
  recordingUrl?: string | null;
  /** Structured call detail for a richer, LeadSquared-style call row
   *  (agent · through-number · duration). Present only on call items. */
  callDetail?: {
    agent: string | null;
    through: string | null;
    durationLabel: string | null;
  } | null;
  filterTags: TimelineFilter[];
}

function outcomeRedundantWithTitle(title: string, outcome: string | null | undefined): boolean {
  const o = (outcome ?? "").trim();
  if (!o) return true;
  const t = title.trim().toLowerCase();
  const ol = o.toLowerCase();
  if (t === ol) return true;
  if (t.endsWith(`· ${ol}`) || t.endsWith(`- ${ol}`)) return true;
  const digits = o.replace(/\D/g, "");
  if (digits.length >= 10 && t.includes(digits)) return true;
  return false;
}

function activitySubtitle(a: {
  subject: string | null;
  outcome: string | null;
  detailNotes?: string | null;
  type: string;
}): string | null {
  const title = a.subject?.trim() || a.type;
  const notes = a.detailNotes?.trim();
  if (notes) return notes;
  const outcome = a.outcome?.trim();
  if (outcome && !outcomeRedundantWithTitle(title, outcome)) return outcome;
  return null;
}

function classifyActivity(type: string, code: string | null): TimelineItemKind {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (code === "lead_system" || t.includes("leadcreated") || t.includes("leadsystem")) {
    return "system";
  }
  if (t.includes("email")) return "email";
  if (t.includes("meeting")) return "meeting";
  if (t.includes("stage")) return "stage";
  if (t.includes("call")) return "call";
  return "activity";
}

/**
 * Human-readable call length, LeadSquared-style: "11 seconds",
 * "1 minute", "3 minutes 58 seconds".
 */
function humanizeCallDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.trunc(sec ?? 0));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const mm = `${m} minute${m === 1 ? "" : "s"}`;
  return r ? `${mm} ${r} second${r === 1 ? "" : "s"}` : mm;
}

export function buildUnifiedTimeline(input: {
  activities: {
    id: string;
    type: string;
    subject: string | null;
    outcome: string | null;
    ownerName: string | null;
    occurredAt: Date | string | null;
    createdAt: Date | string;
    activityCode?: string | null;
    detailNotes?: string | null;
    linkedCallLogId?: string | null;
  }[];
  callLogs: {
    id: string;
    direction: string | null;
    status: string | null;
    durationSec: number | null;
    startTime: Date | string | null;
    createdAt: Date | string;
    recordingUrl?: string | null;
    sourceNumber?: string | null;
    ownerName?: string | null;
  }[];
  notes: { id: string; content: string; createdAt: Date | string }[];
  tasks: {
    id: string;
    subject: string;
    status: string;
    dueDate: Date | string | null;
    createdAt: Date | string;
  }[];
  opportunities: {
    id: string;
    name: string;
    stage: string;
    createdAt: Date | string;
  }[];
  documents: { id: string; name: string; createdAt: Date | string }[];
}): UnifiedTimelineItem[] {
  const items: UnifiedTimelineItem[] = [];

  for (const a of input.activities) {
    const kind = classifyActivity(a.type, a.activityCode ?? null);
    const at = a.occurredAt ?? a.createdAt;
    // Stage 3-D(c): non-system activity titles compose through the SAME
    // activityHeadline the Call Disposition tab uses, so one event reads
    // identically in both tabs (Call -> clean subject; else type · subject ·
    // outcome). System rows keep their bespoke "Lead created" fallback.
    const title =
      kind === "system" ? a.subject || "Lead created" : activityHeadline(a);
    const subtitle =
      kind === "system"
        ? a.outcome || a.detailNotes?.split("\n").find((l) => l.startsWith("Source:"))?.replace("Source:", "").trim() || null
        : activitySubtitle(a);
    items.push({
      id: `act:${a.id}`,
      kind,
      activityId: a.id,
      // A "call"-classified activity is only a REAL call when it's linked to a
      // call-log row; a manual disposition "Call" activity has no link.
      isRealCall: kind === "call" && !!a.linkedCallLogId,
      at: new Date(at).toISOString(),
      title,
      subtitle,
      meta: kind === "system" ? "System" : a.ownerName?.trim() || null,
      filterTags:
        kind === "email"
          ? ["emails", "all"]
          : kind === "meeting"
            ? ["meetings", "all"]
            : kind === "stage" || kind === "system"
              ? ["all"]
              : kind === "call"
                ? ["calls", "all"]
                : ["all"],
    });
  }

  for (const c of input.callLogs) {
    const at = c.startTime ?? c.createdAt;
    // LeadSquared-style row: "Outbound Call" title, then a structured
    // "by <agent> · through <number>" line and a "Duration: …" line, with the
    // recording player rendered by the row component when recordingUrl is set.
    const dir = (c.direction ?? "").toLowerCase();
    const directionLabel = dir.startsWith("in") ? "Inbound Call" : "Outbound Call";
    items.push({
      id: `call:${c.id}`,
      kind: "call",
      // An actual call-log row is always a real call.
      isRealCall: true,
      at: new Date(at).toISOString(),
      title: directionLabel,
      subtitle: null,
      recordingUrl: c.recordingUrl ?? null,
      callDetail: {
        agent: c.ownerName?.trim() || null,
        through: (c.sourceNumber ?? "").trim() || null,
        durationLabel: c.durationSec != null ? humanizeCallDuration(c.durationSec) : null,
      },
      filterTags: ["calls", "all"],
    });
  }

  for (const n of input.notes) {
    items.push({
      id: `note:${n.id}`,
      kind: "note",
      at: new Date(n.createdAt).toISOString(),
      title: "Note added",
      subtitle: n.content.slice(0, 120),
      filterTags: ["notes", "all"],
    });
  }

  for (const t of input.tasks) {
    const at = t.dueDate ?? t.createdAt;
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      at: new Date(at).toISOString(),
      title: t.subject,
      subtitle: t.status,
      filterTags: ["tasks", "all"],
    });
  }

  for (const o of input.opportunities) {
    items.push({
      id: `opp:${o.id}`,
      kind: "opportunity",
      at: new Date(o.createdAt).toISOString(),
      title: o.name,
      subtitle: o.stage,
      filterTags: ["all"],
    });
  }

  for (const d of input.documents) {
    items.push({
      id: `doc:${d.id}`,
      kind: "document",
      at: new Date(d.createdAt).toISOString(),
      title: d.name,
      subtitle: "File uploaded",
      filterTags: ["all"],
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}

export function filterTimeline(
  items: UnifiedTimelineItem[],
  filter: TimelineFilter,
): UnifiedTimelineItem[] {
  if (filter === "all") return items;
  return items.filter((i) => i.filterTags.includes(filter));
}

export function groupTimelineByDate(
  items: UnifiedTimelineItem[],
): { dateLabel: string; items: UnifiedTimelineItem[] }[] {
  const map = new Map<string, UnifiedTimelineItem[]>();
  for (const item of items) {
    const d = new Date(item.at);
    const key = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([dateLabel, group]) => ({
    dateLabel,
    items: group,
  }));
}
