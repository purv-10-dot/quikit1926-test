"use client";

import { useEffect, useState } from "react";
import {
  History,
  PlusCircle,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  GitMerge,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface ResolvedRef {
  before: string | null;
  after: string | null;
}

interface ConversionDetail {
  accountName: string | null;
  contactName: string | null;
  opportunityName: string | null;
}

interface ChangeLogEntry {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  resolved: Record<string, ResolvedRef>;
  fields: string[];
  conversion: ConversionDetail | null;
  createdAt: string;
}

/** Internal audit action the conversion writes (UI labels it "Lead Converted"). */
const CONVERT_ACTION = "lead_convert_relink";

/**
 * The "Created" entry shows only the key identifying fields (Salesforce/HubSpot
 * style) instead of dumping every column. Order here is the display order.
 */
const CREATE_KEY_FIELDS = ["name", "company", "ownerName", "source", "stage", "status"] as const;

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  mobile: "Mobile",
  company: "Company",
  jobTitle: "Job title",
  country: "Country / region",
  industry: "Industry",
  secondaryEmail: "Secondary email",
  website: "Website",
  linkedinUrl: "LinkedIn URL",
  annualRevenueDisplay: "Annual revenue",
  descriptionInformation: "Description / Notes",
  topic: "Topic",
  technology: "Technology",
  budgetAmount: "Budget amount",
  budgetCurrency: "Budget currency",
  purchaseTimeframe: "Purchase timeframe",
  leadType: "Type of lead",
  firstName: "First name",
  lastName: "Last name",
  contactLinkedinUrl: "LinkedIn account",
  nextFollowUpAt: "Next follow-up date",
  lastContactedAt: "Last contacted on",
  followupNotes: "Follow-up notes",
  internalRemarks: "Internal remarks",
  requirementDetails: "Requirement details",
  addressLine1: "Street address",
  addressLine2: "Flat / building",
  cityName: "City",
  stateName: "State / province",
  postalCode: "Postal code",
  lat: "Latitude",
  long: "Longitude",
  source: "Source",
  stage: "Stage",
  status: "Status",
  substatus: "Sub-status",
  score: "Score",
  ownerId: "Owner",
  ownerName: "Owner",
  accountId: "Account",
  linkedContactId: "Contact",
  isStarred: "Starred",
  dynamicFields: "Custom fields",
  deletedAt: "Trash status",
};

/** Fields whose change is already represented by a paired display field —
 *  hide the raw ID row when its sibling is also in the diff to avoid
 *  duplicate "Owner changed" lines. */
const SUPPRESSED_WHEN_SIBLING: Record<string, string> = {
  ownerId: "ownerName",
};

export function LeadChangeLogTimeline({ leadId }: { leadId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leads/${leadId}/changelog`, {
          credentials: "include",
        });
        const json = await res.json();
        if (cancel) return;
        if (!json?.success) throw new Error(json?.error ?? "Failed to load change log");
        setItems((json.data?.items ?? []) as ChangeLogEntry[]);
      } catch (e) {
        if (!cancel) toast.error(e instanceof Error ? e.message : "Failed to load change log");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [leadId, toast]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-crm-muted">Loading change log…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-crm-muted">
            No changes recorded yet.
          </p>
        ) : (
          <ol className="space-y-3" data-testid="change-log-list">
            {items.map((entry) => (
              <ChangeLogEntryCard key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ChangeLogEntryCard({ entry }: { entry: ChangeLogEntry }) {
  const Icon = iconForAction(entry.action);
  const accent = accentForAction(entry.action);
  const actor = entry.userName ?? (entry.userId ? "Unknown user" : "System");
  const isConversion = entry.action === CONVERT_ACTION;
  const conversionLines = isConversion ? buildConversionLines(entry.conversion) : [];
  const lines = isConversion ? [] : buildChangeLines(entry);

  return (
    <li className="rounded-lg border border-crm-border bg-white shadow-sm">
      <div className={`flex items-start gap-3 border-l-4 ${accent.border} px-4 py-3`}>
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-crm-text">
              {labelForAction(entry.action)}
              <span className="font-normal text-crm-muted"> by </span>
              <span className="font-medium text-crm-text">{actor}</span>
            </p>
            <ChangeLogTime iso={entry.createdAt} />
          </div>

          {isConversion ? (
            conversionLines.length > 0 ? (
              <>
                <p className="mt-2 text-xs font-medium text-crm-text">Converted to:</p>
                <ul className="mt-1 space-y-1">
                  {conversionLines.map((line, i) => (
                    <li
                      key={`${entry.id}:c${i}`}
                      className="flex items-start gap-2 text-xs text-crm-text"
                    >
                      <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-crm-muted" />
                      <span className="min-w-0 break-words">{line}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null
          ) : lines.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {lines.map((line, i) => (
                <li
                  key={`${entry.id}:${i}`}
                  className="flex items-start gap-2 text-xs text-crm-text"
                >
                  <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-crm-muted" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          ) : entry.action === "UPDATE" ? (
            <p className="mt-2 text-xs text-crm-muted">No field-level details captured.</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** "Converted to: • Account: X • Contact: Y • Opportunity: Z" — only the parts
 *  that exist. */
function buildConversionLines(c: ConversionDetail | null): React.ReactNode[] {
  if (!c) return [];
  const lines: React.ReactNode[] = [];
  const row = (label: string, value: string) => (
    <>
      <strong className="font-medium">{label}:</strong>{" "}
      <span className="font-medium text-crm-text">{value}</span>
    </>
  );
  if (c.accountName) lines.push(row("Account", c.accountName));
  if (c.contactName) lines.push(row("Contact", c.contactName));
  if (c.opportunityName) lines.push(row("Opportunity", c.opportunityName));
  return lines;
}

/**
 * Change-log timestamp: "Today, 11:18 AM" / "Yesterday, 4:20 PM" /
 * "Jun 28, 2026, 9:15 AM". Local-time (these are interactive, client-rendered
 * timestamps); SSR-safe via useHasMounted (renders the stable UTC string until
 * mounted to avoid a hydration mismatch).
 */
function ChangeLogTime({ iso }: { iso: string }) {
  const mounted = useHasMounted();
  const label = mounted ? formatChangeLogTime(iso) : formatDateTime(iso);
  return (
    <time dateTime={iso} className="shrink-0 text-xs text-crm-muted" suppressHydrationWarning>
      {label}
    </time>
  );
}

function formatChangeLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${date}, ${time}`;
}

/**
 * Builds one human-readable narrative line per changed field, in the form
 * "Owner changed from Alok Shukla to Trashika Mukati". Empty values render as
 * "added X" / "removed (was X)" instead of "empty → X" so the user reads
 * intent, not raw state.
 */
function buildChangeLines(entry: ChangeLogEntry): React.ReactNode[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const lines: React.ReactNode[] = [];

  // CREATE: show only the key identifying fields (in a fixed order), never the
  // full column dump. UPDATE: show every field that actually changed.
  const sourceFields =
    entry.action === "CREATE"
      ? CREATE_KEY_FIELDS.filter((f) => entry.fields.includes(f))
      : entry.fields;

  const visibleFields = sourceFields.filter((f) => {
    const sibling = SUPPRESSED_WHEN_SIBLING[f];
    if (sibling && entry.fields.includes(sibling)) return false;
    return true;
  });

  for (const f of visibleFields) {
    const resolved = entry.resolved[f];
    const rawBefore = before[f];
    const rawAfter = after[f];
    const beforeStr = resolved ? resolved.before : displayValue(rawBefore);
    const afterStr = resolved ? resolved.after : displayValue(rawAfter);
    const beforeEmpty = isEmptyDisplay(beforeStr);
    const afterEmpty = isEmptyDisplay(afterStr);

    // Skip rows whose before/after are both effectively empty — no signal.
    if (beforeEmpty && afterEmpty) continue;

    const label = labelForField(f);

    if (entry.action === "CREATE") {
      // CREATE rows describe the seed values, not transitions.
      if (afterEmpty) continue;
      lines.push(
        <>
          <strong className="font-medium">{label}:</strong>{" "}
          <ValueText text={afterStr} />
        </>,
      );
      continue;
    }

    if (beforeEmpty) {
      lines.push(
        <>
          <strong className="font-medium">{label}</strong> set to{" "}
          <ValueText text={afterStr} />
        </>,
      );
    } else if (afterEmpty) {
      lines.push(
        <>
          <strong className="font-medium">{label}</strong> cleared{" "}
          <span className="text-crm-muted">(was <ValueText text={beforeStr} />)</span>
        </>,
      );
    } else {
      lines.push(
        <>
          <strong className="font-medium">{label}</strong> changed from{" "}
          <ValueText text={beforeStr} /> to <ValueText text={afterStr} />
        </>,
      );
    }
  }
  return lines;
}

function ValueText({ text }: { text: string | null }) {
  if (text === null || text === "") return <span className="text-crm-muted italic">empty</span>;
  return <span className="font-medium text-crm-text">{text}</span>;
}

function isEmptyDisplay(v: string | null): boolean {
  return v === null || v === "" || v === undefined;
}

function displayValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "[unserializable]";
    }
  }
  return String(v);
}

function labelForField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/Id$/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Maps audit actions — including internal snake_case ones — to user-friendly
 *  labels so the change log never surfaces raw action names. */
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Lead Created",
  UPDATE: "Record Updated",
  DELETE: "Deleted",
  RESTORE: "Restored",
  PERMANENT_DELETE: "Permanently Deleted",
  lead_convert_relink: "Lead Converted",
  // Defensive mappings for other internal action names that could appear.
  create: "Lead Created",
  update: "Record Updated",
  delete: "Deleted",
  system_update: "Record Updated",
  bulk_update: "Bulk Updated",
  merge: "Merged",
};

function labelForAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Last-resort humanizer — never show a raw snake_case action name.
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function iconForAction(action: string) {
  switch (action) {
    case "CREATE":
    case "create":
      return PlusCircle;
    case "UPDATE":
    case "update":
    case "system_update":
    case "bulk_update":
      return Pencil;
    case "DELETE":
    case "delete":
      return Trash2;
    case "RESTORE":
      return RotateCcw;
    case "PERMANENT_DELETE":
      return AlertTriangle;
    case CONVERT_ACTION:
    case "merge":
      return GitMerge;
    default:
      return History;
  }
}

function accentForAction(action: string) {
  switch (action) {
    case "CREATE":
    case "create":
      return {
        border: "border-emerald-400",
        iconBg: "bg-emerald-100 text-emerald-700",
      };
    case "UPDATE":
    case "update":
    case "system_update":
    case "bulk_update":
      return {
        border: "border-blue-400",
        iconBg: "bg-blue-100 text-blue-700",
      };
    case "DELETE":
    case "delete":
      return {
        border: "border-amber-400",
        iconBg: "bg-amber-100 text-amber-700",
      };
    case "RESTORE":
      return {
        border: "border-violet-400",
        iconBg: "bg-violet-100 text-violet-700",
      };
    case "PERMANENT_DELETE":
      return {
        border: "border-red-400",
        iconBg: "bg-red-100 text-red-700",
      };
    case CONVERT_ACTION:
    case "merge":
      return {
        border: "border-teal-400",
        iconBg: "bg-teal-100 text-teal-700",
      };
    default:
      return {
        border: "border-crm-border",
        iconBg: "bg-crm-panel text-crm-muted",
      };
  }
}
