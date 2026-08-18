import parser from "cron-parser";

/**
 * Recurrence → cron translation + next-run computation for the QuikFlow
 * scheduler (Data-Level Design §10 / Deep-Analysis §4.11 `schedule.tick`).
 * Pure + framework-free so it's unit-testable; `computeNextRun` takes an
 * explicit `from` so tests are deterministic (no hidden Date.now()).
 *
 * Recurrence tokens mirror the Global module's `recurrence` field (the xlsx
 * Shared Pick-lists): every day / weekday / week / month / quarter / year.
 * Quarters here are CALENDAR quarters (Jan/Apr/Jul/Oct) — fiscal-quarter
 * schedules are a later refinement.
 */
export type Recurrence =
  | "every_day"
  | "every_weekday"
  | "every_week"
  | "every_month"
  | "every_quarter"
  | "every_year";

export interface ScheduleConfig {
  recurrence: Recurrence;
  /** "HH:MM" 24h. Default 09:00. */
  time?: string;
  /** mon..sun — used by every_week. Default mon. */
  dayOfWeek?: string;
  /** 1..28 — used by every_month. Default 1. */
  dayOfMonth?: number;
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function hhmm(time: string | undefined): { h: number; m: number } {
  const [hh, mm] = (time ?? "09:00").split(":");
  const h = Math.min(23, Math.max(0, Number(hh) || 0));
  const m = Math.min(59, Math.max(0, Number(mm) || 0));
  return { h, m };
}

/** Recurrence config → a standard 5-field cron expression. */
export function toCron(cfg: ScheduleConfig): string {
  const { h, m } = hhmm(cfg.time);
  switch (cfg.recurrence) {
    case "every_day":
      return `${m} ${h} * * *`;
    case "every_weekday":
      return `${m} ${h} * * 1-5`;
    case "every_week": {
      const d = DOW[(cfg.dayOfWeek ?? "mon").toLowerCase()] ?? 1;
      return `${m} ${h} * * ${d}`;
    }
    case "every_month": {
      const dom = cfg.dayOfMonth && cfg.dayOfMonth >= 1 && cfg.dayOfMonth <= 28 ? cfg.dayOfMonth : 1;
      return `${m} ${h} ${dom} * *`;
    }
    case "every_quarter":
      return `${m} ${h} 1 1,4,7,10 *`;
    case "every_year":
      return `${m} ${h} 1 1 *`;
  }
}

/**
 * Next fire time strictly after `from`, in the given IANA timezone (default
 * UTC). Returns null for an unparseable cron.
 */
export function computeNextRun(cron: string, from: Date, tz = "UTC"): Date | null {
  try {
    const it = parser.parseExpression(cron, { currentDate: from, tz });
    return it.next().toDate();
  } catch {
    return null;
  }
}
