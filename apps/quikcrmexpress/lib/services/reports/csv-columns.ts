/**
 * Curated column definitions for the per-entity CSV exports.
 *
 * Each entry defines:
 *   - `columns`: the ordered set of CsvColumn<T> the writer uses to render
 *     header + body cells.
 *   - `select`: a Prisma select shape pulling only what `columns` needs
 *     (plus `id` for cursor pagination). Relation columns (e.g. account
 *     name, lead name) are joined here so the cursor iterator can stream
 *     them without per-row N+1 lookups.
 *
 * Date fields are formatted in the user's IANA tz (resolved upstream) via
 * `formatDateInTz`. Currency amounts emit raw numbers — the caller-facing
 * CSV keeps `currency` as a separate column so spreadsheet pivots work.
 */
import type { CsvColumn } from "./csv-stream";

function formatDateInTz(value: Date | string | null | undefined, tz: string): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // ISO 8601 with offset for the requested tz. Excel parses this fine.
  // We hand-build the formatter to avoid pulling date-fns-tz into the CSV
  // path (it lands in Phase 5).
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return d.toISOString();
  }
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "object" && value !== null ? String(value) : value;
  const n = Number(s as string | number);
  return Number.isFinite(n) ? n : null;
}

// ──────────────────────────────────────────── Leads ────────────────────────────

export type LeadCsvRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  source: string | null;
  stage: string;
  status: string;
  ownerName: string | null;
  score: number;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const LEAD_CSV_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  mobile: true,
  company: true,
  source: true,
  stage: true,
  status: true,
  ownerName: true,
  score: true,
  country: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function leadCsvColumns(tz: string): CsvColumn<LeadCsvRow>[] {
  return [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "mobile", label: "Mobile" },
    { key: "company", label: "Company" },
    { key: "source", label: "Source" },
    { key: "stage", label: "Stage" },
    { key: "status", label: "Status" },
    { key: "ownerName", label: "Owner" },
    { key: "score", label: "Score" },
    { key: "country", label: "Country" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
    { key: "updatedAt", label: "Updated", format: (r) => formatDateInTz(r.updatedAt, tz) },
  ];
}

// ──────────────────────────────────────── Opportunities ────────────────────────

export type OpportunityCsvRow = {
  id: string;
  name: string;
  account: { name: string } | null;
  leadId: string | null;
  stage: string;
  amount: unknown;
  currency: string | null;
  probability: number;
  weightedAmount: unknown;
  closeDate: Date | null;
  ownerName: string | null;
  createdAt: Date;
};

export const OPPORTUNITY_CSV_SELECT = {
  id: true,
  name: true,
  account: { select: { name: true } },
  leadId: true,
  stage: true,
  amount: true,
  currency: true,
  probability: true,
  weightedAmount: true,
  closeDate: true,
  ownerName: true,
  createdAt: true,
} as const;

export function opportunityCsvColumns(tz: string): CsvColumn<OpportunityCsvRow>[] {
  return [
    { key: "name", label: "Name" },
    { key: "accountName", label: "Account", format: (r) => r.account?.name ?? "" },
    { key: "leadId", label: "Lead Id" },
    { key: "stage", label: "Stage" },
    { key: "amount", label: "Amount", format: (r) => decimalToNumber(r.amount) },
    { key: "currency", label: "Currency" },
    { key: "probability", label: "Probability" },
    {
      key: "weightedAmount",
      label: "Weighted Amount",
      format: (r) => decimalToNumber(r.weightedAmount),
    },
    {
      key: "closeDate",
      label: "Close Date",
      format: (r) => (r.closeDate ? formatDateInTz(r.closeDate, tz) : ""),
    },
    { key: "ownerName", label: "Owner" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
  ];
}

// ──────────────────────────────────────────── Tasks ────────────────────────────

export type TaskCsvRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignedToUserId: string | null;
  relatedKind: string | null;
  relatedObjectId: string | null;
  createdAt: Date;
};

export const TASK_CSV_SELECT = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  dueDate: true,
  assignedToUserId: true,
  relatedKind: true,
  relatedObjectId: true,
  createdAt: true,
} as const;

export function taskCsvColumns(tz: string): CsvColumn<TaskCsvRow>[] {
  return [
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    {
      key: "dueDate",
      label: "Due Date",
      format: (r) => (r.dueDate ? formatDateInTz(r.dueDate, tz) : ""),
    },
    { key: "assignedToUserId", label: "Assigned To" },
    { key: "relatedKind", label: "Related Kind" },
    { key: "relatedObjectId", label: "Related Object Id" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
  ];
}

// ─────────────────────────────────────────── Accounts ──────────────────────────

export type AccountCsvRow = {
  id: string;
  name: string;
  segment: string | null;
  ownerName: string | null;
  industry: string | null;
  status: string | null;
  annualRevenueDisplay: string | null;
  city: string | null;
  countryCode: string | null;
  createdAt: Date;
};

export const ACCOUNT_CSV_SELECT = {
  id: true,
  name: true,
  segment: true,
  ownerName: true,
  industry: true,
  status: true,
  annualRevenueDisplay: true,
  city: true,
  countryCode: true,
  createdAt: true,
} as const;

export function accountCsvColumns(tz: string): CsvColumn<AccountCsvRow>[] {
  return [
    { key: "name", label: "Name" },
    { key: "segment", label: "Segment" },
    { key: "ownerName", label: "Owner" },
    { key: "industry", label: "Industry" },
    { key: "status", label: "Status" },
    { key: "annualRevenueDisplay", label: "Annual Revenue" },
    { key: "city", label: "City" },
    { key: "countryCode", label: "Country" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
  ];
}

// ─────────────────────────────────────────── Contacts ──────────────────────────

export type ContactCsvRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  account: { name: string } | null;
  createdAt: Date;
};

export const CONTACT_CSV_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  account: { select: { name: true } },
  createdAt: true,
} as const;

export function contactCsvColumns(tz: string): CsvColumn<ContactCsvRow>[] {
  return [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "accountName", label: "Account", format: (r) => r.account?.name ?? "" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
  ];
}

// ───────────────────────────────────────── Activities ──────────────────────────

export type ActivityCsvRow = {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: Date | null;
  relatedKind: string;
  relatedObjectId: string;
};

export const ACTIVITY_CSV_SELECT = {
  id: true,
  type: true,
  subject: true,
  outcome: true,
  ownerName: true,
  occurredAt: true,
  relatedKind: true,
  relatedObjectId: true,
} as const;

export function activityCsvColumns(tz: string): CsvColumn<ActivityCsvRow>[] {
  return [
    { key: "type", label: "Type" },
    { key: "subject", label: "Subject" },
    { key: "outcome", label: "Outcome" },
    { key: "ownerName", label: "Owner" },
    {
      key: "occurredAt",
      label: "Occurred At",
      format: (r) => (r.occurredAt ? formatDateInTz(r.occurredAt, tz) : ""),
    },
    { key: "relatedKind", label: "Related Kind" },
    { key: "relatedObjectId", label: "Related Object Id" },
  ];
}

// ────────────────────────────────────────── Call Logs ─────────────────────────

export type CallLogCsvRow = {
  id: string;
  sourceNumber: string | null;
  destinationNumber: string | null;
  direction: string | null;
  durationSec: number | null;
  dispositionName: string | null;
  status: string | null;
  ownerName: string | null;
  createdAt: Date;
  recordingUrl: string | null;
};

export const CALL_LOG_CSV_SELECT = {
  id: true,
  sourceNumber: true,
  destinationNumber: true,
  direction: true,
  durationSec: true,
  dispositionName: true,
  status: true,
  ownerName: true,
  createdAt: true,
  recordingUrl: true,
} as const;

export function callLogCsvColumns(tz: string): CsvColumn<CallLogCsvRow>[] {
  return [
    { key: "sourceNumber", label: "From" },
    { key: "destinationNumber", label: "To" },
    { key: "direction", label: "Direction" },
    { key: "durationSec", label: "Duration (sec)" },
    { key: "dispositionName", label: "Disposition" },
    { key: "status", label: "Status" },
    { key: "ownerName", label: "Owner" },
    { key: "createdAt", label: "Created", format: (r) => formatDateInTz(r.createdAt, tz) },
    { key: "recordingUrl", label: "Recording Url" },
  ];
}

// ──────────────────────────────── tz helper for handlers ──────────────────────

export function readTzFromCookieHeader(cookieHeader: string | null): string {
  if (!cookieHeader) return "UTC";
  const match = cookieHeader.match(/(?:^|;\s*)tz=([^;]+)/);
  if (!match) return "UTC";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "UTC";
  }
}
