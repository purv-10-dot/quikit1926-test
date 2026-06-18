export interface WeekBucket {
  weekStart: string;
  weekLabel: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  color: string | null;
  projectKey: string;
}

export interface TeamMeta {
  id: string;
  name: string;
  color: string | null;
}

export interface HeatmapCell {
  weekIdx: number;
  /** Composite productivity score 0-100, or null when no activity. */
  productivity: number | null;
  created: number;
  closed: number;
}

export interface TeamHeatmapRow {
  teamId: string;
  teamName: string;
  cells: HeatmapCell[];
  /** Average productivity across the range — used for default "worst first" sort. */
  avgScore: number;
}

export interface TeamProductivityRow {
  teamId: string;
  teamName: string;
  productivity: number;
  /** Δ vs previous period (percentage points). null when no comparison loaded. */
  delta: number | null;
  created: number;
  closed: number;
}

export interface SlippingPoint {
  weekStart: string;
  weekLabel: string;
  slipped: number;
  blocked: number;
}

export interface WorkloadPoint {
  userId: string;
  name: string;
  /** Workload % vs the median load — 100 means median, 200 means double. */
  workload: number;
  /** Productivity score 0-100. */
  productivity: number;
  hoursLogged: number;
  tasksClosed: number;
}

export interface EmployeeRow {
  userId: string;
  name: string;
  avatar: string | null;
  teamName: string | null;
  productivity: number;
  tasksClosed: number;
  onTimeRate: number;
  /** Weekly productivity series for the sparkline. */
  trend: number[];
  /** Δ percentage points vs previous period (null if no compare). */
  delta: number | null;
}

export interface PreviousSeries {
  weeks: WeekBucket[];
  series: {
    productivity: number[];
    created: number[];
    closed: number[];
    slipped: number[];
  };
  summary: {
    productivity: number;
    totalCreated: number;
    totalClosed: number;
    totalSlipped: number;
    closedPct: number;
    velocity: number;
    delayedPct: number;
  };
  label: string;
}

export interface RangeMeta {
  from: string;
  to: string;
  label: string;
}

export interface ExecutiveReportData {
  range: RangeMeta;
  weeks: WeekBucket[];
  series: {
    /** Composite weekly productivity score 0-100. */
    productivity: number[];
    created: number[];
    closed: number[];
    slipped: number[];
    blocked: number[];
    estHours: number[];
    actualHours: number[];
  };
  slipping: SlippingPoint[];
  teams: TeamProductivityRow[];
  teamHeatmap: TeamHeatmapRow[];
  workload: WorkloadPoint[];
  employees: EmployeeRow[];
  summary: {
    productivity: number;
    totalCreated: number;
    totalClosed: number;
    totalSlipped: number;
    closedPct: number;
    velocity: number;
    delayedPct: number;
    estHours: number;
    actualHours: number;
  };
  previous?: PreviousSeries;
  weekOverWeek: WeekOverWeek;
  projects: ProjectMeta[];
  teamOptions: { id: string; label: string }[];
  sprintOptions: { id: string; label: string }[];
}

/**
 * Week-over-week summary. The dashboard's headline framing — always computed
 * from the LAST and SECOND-TO-LAST ISO week of the selected range, so the
 * comparison stays weekly even when the range is a month, quarter, or year.
 * `available` is false when the range has fewer than 2 weeks (e.g. user
 * picked a single week or a 3-day custom window).
 */
export interface WeekOverWeek {
  available: boolean;
  thisWeekLabel: string | null;
  lastWeekLabel: string | null;
  thisWeek: { productivity: number; closed: number; slipped: number };
  lastWeek: { productivity: number; closed: number; slipped: number };
  delta: {
    productivity: number;
    closedAbs: number;
    closedPct: number | null;
    slippedAbs: number;
    delayedPct: number;
  };
}

export type RangePreset =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "last-year"
  | "ytd"
  | "last-30"
  | "last-90"
  | "last-180"
  | "last-365"
  | "specific-quarter"
  | "specific-month"
  | "specific-year"
  | "custom";

export type CompareMode = "none" | "previous-period" | "previous-year";

export interface ExecutiveFilters {
  rangePreset: RangePreset;
  year?: number;
  quarter?: number;
  month?: number;
  customFrom?: string;
  customTo?: string;
  compareMode: CompareMode;
  projectIds: string[];
  assigneeIds: string[];
  teamIds: string[];
  sprintIds: string[];
}

export interface SavedView {
  id: string;
  name: string;
  filtersJson: Record<string, unknown>;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_FILTERS: ExecutiveFilters = {
  rangePreset: "last-90",
  // The dashboard does NOT use the parallel previous-period series anymore —
  // week-over-week deltas are computed from the last 2 weekly buckets of the
  // current range. compareMode stays in the type for wire-format compat but
  // is locked to "none" so the API skips the extra queries.
  compareMode: "none",
  projectIds: [],
  assigneeIds: [],
  teamIds: [],
  sprintIds: [],
};

export function normalizeFilters(raw: Record<string, unknown> | undefined | null): ExecutiveFilters {
  if (!raw) return { ...DEFAULT_FILTERS };
  if (typeof raw.rangePreset === "string") {
    return {
      rangePreset: raw.rangePreset as RangePreset,
      year: typeof raw.year === "number" ? raw.year : undefined,
      quarter: typeof raw.quarter === "number" ? raw.quarter : undefined,
      month: typeof raw.month === "number" ? raw.month : undefined,
      customFrom: typeof raw.customFrom === "string" ? raw.customFrom : undefined,
      customTo: typeof raw.customTo === "string" ? raw.customTo : undefined,
      // Comparison is always week-over-week (last 2 weekly buckets of the
      // current range). compareMode is locked to "none" so the API doesn't
      // spend queries on a parallel previous-period series that the UI no
      // longer renders.
      compareMode: "none",
      projectIds: stringArray(raw.projectIds),
      assigneeIds: stringArray(raw.assigneeIds),
      teamIds: stringArray(raw.teamIds),
      sprintIds: stringArray(raw.sprintIds),
    };
  }
  // Legacy shape: { weeksBack, compareToPrevious, ... }
  const weeksBack = typeof raw.weeksBack === "number" ? raw.weeksBack : 12;
  const compare = raw.compareToPrevious === true;
  const presetFromWeeks: RangePreset =
    weeksBack <= 7 ? "last-30" : weeksBack <= 13 ? "last-90" : weeksBack <= 27 ? "last-180" : "last-365";
  // Ignore legacy `compareToPrevious` — comparison is built into the weekly
  // series (last vs prior week) and doesn't need a parallel range query.
  void compare;
  return {
    rangePreset: presetFromWeeks,
    compareMode: "none",
    projectIds: stringArray(raw.projectIds),
    assigneeIds: stringArray(raw.assigneeIds),
    teamIds: stringArray(raw.teamIds),
    sprintIds: stringArray(raw.sprintIds),
  };
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

export interface PresetGroupOption {
  value: RangePreset;
  label: string;
  needsConfig?: "quarter" | "month" | "year" | "custom";
}

export const PRESET_GROUPS: { heading: string; items: PresetGroupOption[] }[] = [
  {
    heading: "This / Last",
    items: [
      { value: "this-week", label: "This week" },
      { value: "last-week", label: "Last week" },
      { value: "this-month", label: "This month" },
      { value: "last-month", label: "Last month" },
      { value: "this-quarter", label: "This quarter" },
      { value: "last-quarter", label: "Last quarter" },
      { value: "this-year", label: "This year" },
      { value: "last-year", label: "Last year" },
      { value: "ytd", label: "Year to date" },
    ],
  },
  {
    heading: "Rolling window",
    items: [
      { value: "last-30", label: "Last 30 days" },
      { value: "last-90", label: "Last 90 days" },
      { value: "last-180", label: "Last 180 days" },
      { value: "last-365", label: "Last 12 months" },
    ],
  },
  {
    heading: "Specific period",
    items: [
      { value: "specific-quarter", label: "Specific quarter…", needsConfig: "quarter" },
      { value: "specific-month", label: "Specific month…", needsConfig: "month" },
      { value: "specific-year", label: "Specific year…", needsConfig: "year" },
      { value: "custom", label: "Custom date range…", needsConfig: "custom" },
    ],
  },
];

/**
 * Compare-mode dropdown options. The `previous-period` label adapts to the
 * selected range — e.g. picking "This week" turns it into "Week over Week",
 * "This quarter" turns it into "Quarter over Quarter". Underneath, the
 * comparison logic is identical (range.from minus its own length); only the
 * label changes so leadership reads the dashboard in business terms.
 */
export interface CompareOption {
  value: CompareMode;
  label: string;
  hint: string;
}

interface CompareLabelSet {
  /** What we call this comparison in the dropdown trigger button. */
  label: string;
  /** Second line in the dropdown list — a plain-English clarifier. */
  hint: string;
}

const PREVIOUS_PERIOD_LABELS: Partial<Record<RangePreset, CompareLabelSet>> = {
  "this-week":      { label: "Week over Week",   hint: "vs the prior week" },
  "last-week":      { label: "Week over Week",   hint: "vs the week before last" },
  "this-month":     { label: "Month over Month", hint: "vs the prior month" },
  "last-month":     { label: "Month over Month", hint: "vs the month before last" },
  "specific-month": { label: "Month over Month", hint: "vs the prior month" },
  "this-quarter":   { label: "Quarter over Quarter", hint: "vs the prior quarter" },
  "last-quarter":   { label: "Quarter over Quarter", hint: "vs the quarter before last" },
  "specific-quarter": { label: "Quarter over Quarter", hint: "vs the prior quarter" },
  "this-year":      { label: "Year over Year",   hint: "vs the prior year" },
  "last-year":      { label: "Year over Year",   hint: "vs the year before last" },
  "specific-year":  { label: "Year over Year",   hint: "vs the prior year" },
  "ytd":            { label: "Year over Year",   hint: "Year-to-date vs last year-to-date" },
  "last-30":        { label: "Month over Month", hint: "vs the prior 30 days" },
  "last-90":        { label: "Quarter over Quarter", hint: "vs the prior 90 days" },
  "last-180":       { label: "Period over Period",   hint: "vs the prior 180 days" },
  "last-365":       { label: "Year over Year",   hint: "vs the prior 12 months" },
  "custom":         { label: "Period over Period",   hint: "vs an equal-length window immediately before" },
};

const PREVIOUS_YEAR_LABELS: Partial<Record<RangePreset, CompareLabelSet>> = {
  "this-week":      { label: "Same Week, Last Year",    hint: "Same dates one year earlier" },
  "last-week":      { label: "Same Week, Last Year",    hint: "Same dates one year earlier" },
  "this-month":     { label: "Same Month, Last Year",   hint: "Same dates one year earlier" },
  "last-month":     { label: "Same Month, Last Year",   hint: "Same dates one year earlier" },
  "specific-month": { label: "Same Month, Last Year",   hint: "Same dates one year earlier" },
  "this-quarter":   { label: "Same Quarter, Last Year", hint: "Same dates one year earlier" },
  "last-quarter":   { label: "Same Quarter, Last Year", hint: "Same dates one year earlier" },
  "specific-quarter": { label: "Same Quarter, Last Year", hint: "Same dates one year earlier" },
};

export function getCompareOptions(rangePreset: RangePreset): CompareOption[] {
  const periodLabels = PREVIOUS_PERIOD_LABELS[rangePreset] ?? {
    label: "Period over Period",
    hint: "vs an equal-length window immediately before",
  };
  const yearLabels = PREVIOUS_YEAR_LABELS[rangePreset] ?? {
    label: "Same Period, Last Year",
    hint: "Same dates one year earlier",
  };
  return [
    { value: "none", label: "No Comparison", hint: "Show this period only" },
    { value: "previous-period", label: periodLabels.label, hint: periodLabels.hint },
    { value: "previous-year", label: yearLabels.label, hint: yearLabels.hint },
  ];
}

/** @deprecated — kept for old callers; use `getCompareOptions(rangePreset)`. */
export const COMPARE_OPTIONS: CompareOption[] = getCompareOptions("last-90");
