"use client";

import { useEffect, useState } from "react";
import {
  History,
  PlusCircle,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RelativeTime } from "@/components/shared/relative-time";

interface ResolvedRef {
  before: string | null;
  after: string | null;
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
  createdAt: string;
}

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
  const lines = buildChangeLines(entry);

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
            <RelativeTime
              iso={entry.createdAt}
              className="shrink-0 text-xs text-crm-muted"
            />
          </div>

          {lines.length > 0 ? (
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

  const visibleFields = entry.fields.filter((f) => {
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

function labelForAction(action: string): string {
  switch (action) {
    case "CREATE":
      return "Created";
    case "UPDATE":
      return "Updated";
    case "DELETE":
      return "Moved to trash";
    case "RESTORE":
      return "Restored";
    case "PERMANENT_DELETE":
      return "Permanently deleted";
    default:
      return action;
  }
}

function iconForAction(action: string) {
  switch (action) {
    case "CREATE":
      return PlusCircle;
    case "UPDATE":
      return Pencil;
    case "DELETE":
      return Trash2;
    case "RESTORE":
      return RotateCcw;
    case "PERMANENT_DELETE":
      return AlertTriangle;
    default:
      return History;
  }
}

function accentForAction(action: string) {
  switch (action) {
    case "CREATE":
      return {
        border: "border-emerald-400",
        iconBg: "bg-emerald-100 text-emerald-700",
      };
    case "UPDATE":
      return {
        border: "border-blue-400",
        iconBg: "bg-blue-100 text-blue-700",
      };
    case "DELETE":
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
    default:
      return {
        border: "border-crm-border",
        iconBg: "bg-crm-panel text-crm-muted",
      };
  }
}
