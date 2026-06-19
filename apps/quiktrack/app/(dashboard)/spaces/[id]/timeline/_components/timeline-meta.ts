export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WORK_COL_WIDTH = 280;

export type ZoomLevel = "today" | "weeks" | "months" | "quarters";

/** Per-zoom geometry — column width in px and how many columns to render. */
export const ZOOM_PRESETS: Record<
  ZoomLevel,
  { width: number; count: number; before: number }
> = {
  // `before` = how many columns before the anchor (today/this-month/etc.)
  // we should render so the user can scroll back too.
  today: { width: 60, count: 60, before: 7 },
  weeks: { width: 140, count: 40, before: 4 },
  months: { width: 260, count: 18, before: 2 },
  quarters: { width: 360, count: 12, before: 1 },
};

export interface TimelineIssue {
  id: string;
  key: string;
  title: string;
  type: string; // EPIC | TASK | STORY | BUG | SUBTASK
  statusId: string;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  parentId: string | null;
  epicId: string | null;
  subtaskCount?: number;
}

export interface Member {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  } | null;
}

export interface Col {
  key: string;
  label: string;
  start: Date;
  end: Date; // exclusive
  width: number;
}

/** Generate `count` columns at the given zoom level, anchored so that today
 *  sits a few columns in (controlled by ZOOM_PRESETS[zoom].before). */
export function buildColumns(zoom: ZoomLevel, count: number): Col[] {
  const today = new Date();
  const cols: Col[] = [];
  const { before } = ZOOM_PRESETS[zoom];

  if (zoom === "today") {
    const start0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - before);
    for (let i = 0; i < count; i++) {
      const start = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      cols.push({
        key: start.toISOString().slice(0, 10),
        label: `${start.getDate()} ${MONTH_LABELS[start.getMonth()]?.slice(0, 3)}`,
        start,
        end,
        width: ZOOM_PRESETS.today.width,
      });
    }
    return cols;
  }

  if (zoom === "weeks") {
    // Snap to Monday for the anchor week.
    const dow = today.getDay() || 7; // 1..7 with Mon=1
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (dow - 1));
    const start0 = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - before * 7);
    for (let i = 0; i < count; i++) {
      const start = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i * 7);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const yy = String(start.getFullYear()).slice(-2);
      cols.push({
        key: start.toISOString().slice(0, 10),
        label: `${MONTH_LABELS[start.getMonth()]?.slice(0, 3)} ${start.getDate()} '${yy}`,
        start,
        end,
        width: ZOOM_PRESETS.weeks.width,
      });
    }
    return cols;
  }

  if (zoom === "quarters") {
    const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const start0 = new Date(today.getFullYear(), qStartMonth - before * 3, 1);
    for (let i = 0; i < count; i++) {
      const start = new Date(start0.getFullYear(), start0.getMonth() + i * 3, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      const q = Math.floor(start.getMonth() / 3) + 1;
      const yy = String(start.getFullYear()).slice(-2);
      cols.push({
        key: `${start.getFullYear()}-Q${q}`,
        label: `Q${q} '${yy}`,
        start,
        end,
        width: ZOOM_PRESETS.quarters.width,
      });
    }
    return cols;
  }

  // months
  const start0 = new Date(today.getFullYear(), today.getMonth() - before, 1);
  for (let i = 0; i < count; i++) {
    const start = new Date(start0.getFullYear(), start0.getMonth() + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const yy = String(start.getFullYear()).slice(-2);
    cols.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: `${MONTH_LABELS[start.getMonth()]} '${yy}`,
      start,
      end,
      width: ZOOM_PRESETS.months.width,
    });
  }
  return cols;
}

export function totalGridWidth(columns: Col[]): number {
  return columns.reduce((sum, c) => sum + c.width, 0);
}

/** Returns the X (px) of a date within the column strip, or null if out of range. */
export function dateToX(date: Date, columns: Col[]): number | null {
  if (!columns.length || Number.isNaN(date.getTime())) return null;
  let x = 0;
  for (const c of columns) {
    if (date >= c.start && date < c.end) {
      const span = c.end.getTime() - c.start.getTime();
      const fraction = span > 0 ? (date.getTime() - c.start.getTime()) / span : 0;
      return x + c.width * fraction;
    }
    x += c.width;
  }
  // Beyond the last column — clamp to the right edge.
  const last = columns[columns.length - 1]!;
  if (date >= last.end) return x;
  return null;
}

/** Returns the bar's [left, width] in px for a [start, end] interval, clamped to the visible columns. */
export function intervalToBar(
  start: string | null,
  end: string | null,
  columns: Col[],
): { left: number; width: number } | null {
  if (!start && !end) return null;
  const s = start ? new Date(start) : end ? new Date(end) : null;
  const e = end ? new Date(end) : start ? new Date(start) : null;
  if (!s || !e) return null;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const xs = dateToX(s, columns);
  const xe = dateToX(e, columns);
  if (xs == null && xe == null) return null;
  const total = totalGridWidth(columns);
  const left = Math.max(0, Math.min(total, xs ?? xe ?? 0));
  const right = Math.max(0, Math.min(total, xe ?? xs ?? 0));
  return { left, width: Math.max(8, right - left) };
}

export function initials(m: Member): string {
  const u = m.user;
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "?";
  return (u.email[0] ?? "?").toUpperCase();
}

export function fullName(m: Member): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

export function avatarColor(seed: string): string {
  const colors = ["#2563eb", "#16a34a", "#dc2626", "#ea580c", "#9333ea", "#0891b2"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length]!;
}
