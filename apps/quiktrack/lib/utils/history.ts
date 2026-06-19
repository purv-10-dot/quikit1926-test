export interface HistoryEntry {
  id: string;
  kind: "project" | "board" | "list" | "task" | "epic" | "dashboard";
  title: string;
  meta?: string | null;
  href: string;
  icon?: string | null;
  color?: string | null;
  ts: number;
}

interface ApiActivityRow {
  id: string;
  projectId: string;
  kind: HistoryEntry["kind"];
  ref: string;
  title: string;
  meta: string | null;
  href: string;
  icon: string | null;
  color: string | null;
  viewedAt: string;
}

interface RecordInput {
  projectId: string;
  kind: HistoryEntry["kind"];
  ref?: string;
  title: string;
  meta?: string | null;
  href: string;
  icon?: string | null;
  color?: string | null;
}

/** Fire-and-forget POST to /api/activity. Errors are swallowed — the activity
 *  feed is best-effort and must never disrupt navigation. */
export function recordActivity(input: RecordInput) {
  if (typeof window === "undefined") return;
  void fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => undefined);
}

export async function fetchActivity(limit = 30): Promise<HistoryEntry[]> {
  try {
    const res = await fetch(`/api/activity?limit=${limit}`);
    const j = await res.json();
    if (!j?.success) return [];
    return (j.data as ApiActivityRow[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      meta: r.meta,
      href: r.href,
      icon: r.icon,
      color: r.color,
      ts: new Date(r.viewedAt).getTime(),
    }));
  } catch {
    return [];
  }
}

export function groupHistoryByDay(entries: HistoryEntry[]): {
  group: string;
  items: HistoryEntry[];
}[] {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const lastWeek = today - 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, HistoryEntry[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };
  for (const e of entries) {
    if (e.ts >= today) buckets.Today!.push(e);
    else if (e.ts >= yesterday) buckets.Yesterday!.push(e);
    else if (e.ts >= lastWeek) buckets["This week"]!.push(e);
    else buckets.Earlier!.push(e);
  }
  return (Object.keys(buckets) as (keyof typeof buckets)[])
    .filter((k) => buckets[k]!.length > 0)
    .map((k) => ({ group: k as string, items: buckets[k]! }));
}

export function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString();
}
