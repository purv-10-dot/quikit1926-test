/**
 * Merges lead-related events into one sortable feed for the unified timeline.
 */

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
  filterTags: TimelineFilter[];
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
  }[];
  callLogs: {
    id: string;
    direction: string | null;
    status: string | null;
    durationSec: number | null;
    startTime: Date | string | null;
    createdAt: Date | string;
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
    const title =
      kind === "system" ? a.subject || "Lead created" : a.subject || a.type;
    const subtitle =
      kind === "system"
        ? a.outcome || a.detailNotes?.split("\n").find((l) => l.startsWith("Source:"))?.replace("Source:", "").trim() || null
        : a.outcome;
    items.push({
      id: `act:${a.id}`,
      kind,
      at: new Date(at).toISOString(),
      title,
      subtitle,
      meta: kind === "system" ? "System" : a.ownerName,
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
    items.push({
      id: `call:${c.id}`,
      kind: "call",
      at: new Date(at).toISOString(),
      title: `${c.direction ?? "Call"} · ${c.status ?? "logged"}`,
      subtitle: c.durationSec != null ? `${c.durationSec}s` : null,
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
