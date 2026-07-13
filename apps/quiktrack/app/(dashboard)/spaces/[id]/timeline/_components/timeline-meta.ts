export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON3 = MONTH_LABELS.map((m) => m.slice(0, 3));

export const WORK_COL_WIDTH = 260;

/** QuikInfra-style Gantt: a per-DAY axis at three zoom levels (day-column
 *  width shrinks as you zoom out). */
export type ZoomLevel = "week" | "month" | "quarter";

export const DAY_WIDTH: Record<ZoomLevel, number> = { week: 16, month: 6, quarter: 3 };
/** Padding days added on each side of the data's date range, per zoom. */
const PAD_DAYS: Record<ZoomLevel, number> = { week: 7, month: 14, quarter: 30 };
/** Minimum columns so a short/empty schedule still fills the axis. */
const MIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** One day = one column. `label` is "" when hidden at the current zoom. */
export interface Col {
  key: string;
  label: string;
  start: Date;
  end: Date; // exclusive (next day)
  width: number;
  weekend: boolean;
  isToday: boolean;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build the per-day columns spanning the data's date range (domainStart →
 * domainEnd) plus padding — NOT anchored on today. This makes the bars sit where
 * the work actually is, like a construction-schedule Gantt.
 */
export function buildColumns(zoom: ZoomLevel, domainStart: Date, domainEnd: Date): Col[] {
  const width = DAY_WIDTH[zoom];
  const pad = PAD_DAYS[zoom];
  const start0 = new Date(
    domainStart.getFullYear(),
    domainStart.getMonth(),
    domainStart.getDate() - pad,
  );
  const end0 = new Date(domainEnd.getFullYear(), domainEnd.getMonth(), domainEnd.getDate() + pad);
  const spanDays = Math.round((end0.getTime() - start0.getTime()) / DAY_MS) + 1;
  const count = Math.max(MIN_DAYS, spanDays);
  const todayKey = dateKey(new Date());
  const cols: Col[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const dow = start.getDay();
    const weekend = dow === 0 || dow === 6;
    const first = i === 0;
    let label = "";
    const yy = String(start.getFullYear()).slice(-2);
    if (zoom === "week") {
      // Label Mondays (+ the first column) to reduce clutter.
      if (dow === 1 || first) label = `${start.getDate()} ${MON3[start.getMonth()]}`;
    } else if (zoom === "month") {
      // Month: label the 1st of each month (+ the first column).
      if (start.getDate() === 1 || first) {
        label = `${MON3[start.getMonth()]} '${yy}`;
      }
    } else {
      // Quarter: label the 1st of each quarter (Jan/Apr/Jul/Oct) + the first column.
      if ((start.getDate() === 1 && start.getMonth() % 3 === 0) || first) {
        label = `Q${Math.floor(start.getMonth() / 3) + 1} '${yy}`;
      }
    }
    cols.push({ key: dateKey(start), label, start, end, width, weekend, isToday: dateKey(start) === todayKey });
  }
  return cols;
}

export function totalGridWidth(columns: Col[]): number {
  return columns.reduce((sum, c) => sum + c.width, 0);
}

/** X (px) of a date within the column strip, or null if before the range. */
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
  const last = columns[columns.length - 1]!;
  if (date >= last.end) return x; // clamp to the right edge
  return null;
}

/** Bar [left, width] in px for a [start, end] interval, clamped to visible columns. */
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
  // A due date is inclusive of that day — extend to the end of the day so a
  // single-day task spans a full column.
  const eEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  const xs = dateToX(s, columns);
  const xe = dateToX(eEnd, columns);
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
