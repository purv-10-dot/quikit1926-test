/**
 * Helpers for rendering AuditLog entries in the UI.
 *
 * AuditLog.oldValues / newValues are TEXT columns that hold a JSON-encoded
 * snapshot string (see schema.prisma:AuditLog and lib/api/auditLog.ts where
 * `safeStringify` is applied on write). The route handlers return that raw
 * string in the `oldValue` / `newValue` fields.
 *
 * Passing a string into `Object.entries` / `Object.keys` iterates each
 * character index instead of the JSON keys, producing rows like
 * `0="{", 1="\"", 2="c"`. These helpers parse the string first and provide
 * a single rendering path so every audit-log UI behaves consistently.
 */

const NOISE_KEYS = new Set([
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
]);

/**
 * Coerce an unknown audit-log value into a plain object.
 *  - object → returned as-is
 *  - JSON string → parsed
 *  - anything else / parse failure → null
 */
export function parseAuditValue(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Format a CREATE-style audit value as `key=value, key=value`.
 * Skips noisy meta keys (id, timestamps, audit fields).
 * If the value can't be parsed, returns the raw string verbatim (or "").
 */
export function fmtAuditPayload(raw: unknown): string {
  const obj = parseAuditValue(raw);
  if (!obj) return typeof raw === "string" ? raw : "";
  return Object.entries(obj)
    .filter(([k]) => !NOISE_KEYS.has(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
}

/**
 * Diff two audit values (old/new) and return only the keys that changed.
 * Used by the UPDATE rendering block to show field-level changes.
 * Returns [] if either side fails to parse or nothing changed.
 */
export function diffAuditPayload(
  rawOld: unknown,
  rawNew: unknown,
): Array<{ key: string; oldValue: unknown; newValue: unknown }> {
  const oldObj = parseAuditValue(rawOld) ?? {};
  const newObj = parseAuditValue(rawNew) ?? {};
  const keys = new Set<string>([
    ...Object.keys(oldObj),
    ...Object.keys(newObj),
  ]);
  const out: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
  for (const k of keys) {
    if (NOISE_KEYS.has(k)) continue;
    const oldV = oldObj[k];
    const newV = newObj[k];
    if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
    out.push({ key: k, oldValue: oldV, newValue: newV });
  }
  return out;
}

/* ─── Friendly meeting-log formatter ───────────────────────────────────────── */

/**
 * Field-name → human label map used by the Client-Meeting (Daily Huddle +
 * Weekly Meeting) audit logs. Anything not in this map falls back to a
 * "humanized" version of the camelCase key (`kpDashboard` → `K&P dashboard`).
 */
const MEETING_FIELD_LABELS: Record<string, string> = {
  clientId: "Client",
  meetingDate: "Meeting date",
  callStatus: "Status",
  actualStartTime: "Actual start",
  actualEndTime: "Actual end",
  segmentTime1: "Segment 1 time",
  segmentTime2: "Segment 2 time",
  segmentTime3: "Segment 3 time",
  segmentTime4: "Segment 4 time",
  segmentTime5: "Segment 5 time",
  segmentTime6: "Segment 6 time",
  segmentTime7: "Segment 7 time",
  goodNewsSharing: "Good news sharing",
  kpDashboard: "K&P dashboard",
  gaps: "GAPS",
  www: "WWW",
  feedback: "Customer/Employee feedback",
  collectiveIntelligence: "Collective intelligence",
  opspReview: "OPSP review",
  notesKPDashboard: "K&P dashboard notes",
  otherNotes: "Other notes",
  absentUserIds: "Absent members",
  dashboardNAUserIds: "Dashboard N/A members",
  absentClientMemberIds: "Absent members",
  dashboardNAClientMemberIds: "Dashboard N/A members",
  // Daily Huddle specific
  format1Status: "Yesterday's achievements",
  format2Status: "Today's priority",
  stuckCallStatus: "Stuck issues",
  punctualityOverride: "Punctuality override",
  yesterdaysAchievements: "Yesterday's achievements",
  todaysPriority: "Today's priority",
  stuckIssues: "Stuck issues",
  // SCORE_UPDATE keys
  userId: "Member",
  clientMemberId: "Member",
  kpiWeeklyQTD: "KPI Weekly QTD",
  kpiCoding: "KPI Color Coding",
  priorityNotes: "Priority Notes",
  priorityStartEndDate: "Priority Start/End Date",
  priorityColor: "Priority Color",
};

const STATUS_LABELS: Record<string, string> = {
  HELD: "Held",
  NOT_HELD: "Not Held",
  CALL_CANCELLED_BY_CLIENT: "Cancelled by client",
  PENDING: "Pending",
};

/**
 * Field-name → human label map used by OPSP Review audit logs (primary,
 * secondary, and Critical # Review rows). Kept separate from
 * MEETING_FIELD_LABELS so entity-specific label changes don't cross-contaminate.
 *
 * Primary review snapshots use compound keys `${period}.${field}` so the
 * diff renders one row per cell. The combos are precomputed below.
 */
const OPSP_PERIODS: Record<string, string> = {
  // Quarter (actions) — m1/m2/m3 are the three months of the quarter
  m1: "Month 1",
  m2: "Month 2",
  m3: "Month 3",
  // Yearly (goals) — one row per fiscal quarter
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  // 3-5yr (targets)
  y1: "Year 1",
  y2: "Year 2",
  y3: "Year 3",
  y4: "Year 4",
  y5: "Year 5",
};

const OPSP_CELL_FIELDS: Record<string, string> = {
  target: "Target",
  achieved: "Achieved",
  lastYear: "Last year same period",
  comment: "Comment",
};

export const OPSP_FIELD_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {
    // Flat (non-period) fields — used by Critical # Review + Secondary rows.
    targetValue: "Target",
    achievedValue: "Achieved",
    lastYearSamePeriod: "Last year same period",
    comment: "Comment",
    period: "Period",
    module: "Module",
    cardType: "Card type",
    status: "Status",
    horizon: "Horizon",
    rowIndex: "Row",
    category: "Category",
  };
  // Compound keys for Primary review snapshots: e.g. `m1.target` → "Month 1 · Target"
  for (const [pk, pl] of Object.entries(OPSP_PERIODS)) {
    for (const [fk, fl] of Object.entries(OPSP_CELL_FIELDS)) {
      out[`${pk}.${fk}`] = `${pl} · ${fl}`;
    }
  }
  return out;
})();

const FLAG_LABELS: Record<string, string> = {
  YES: "Yes",
  NO: "No",
  NA: "N/A",
};

/**
 * Humanize a camelCase / snake_case field name. Used as the fallback label
 * when a key isn't in MEETING_FIELD_LABELS. `kpDashboardTime` → `Kp dashboard time`.
 */
function humanizeKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const labelFor = (
  k: string,
  overrides?: Record<string, string>,
): string => overrides?.[k] ?? MEETING_FIELD_LABELS[k] ?? humanizeKey(k);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;
const CUID_RE = /^c[a-z0-9]{20,}$/;

/**
 * Render an audit field value as a human string.
 * - ISO timestamps → `Apr 30, 2026` (or `Apr 30, 2026, 10:15 AM` if a time is meaningful)
 * - Status / flag enums → friendly label
 * - cuid-looking strings → resolved via `nameById`, else trimmed `cmofp1…b6zb`
 * - null / undefined / "" → `—`
 */
export interface FriendlyAuditOptions {
  /** Resolve any id (clientId / userId / clientMemberId) → display name. */
  nameById?: (id: string) => string | undefined;
  /**
   * Per-call field-label override. Takes precedence over MEETING_FIELD_LABELS.
   * Use OPSP_FIELD_LABELS (or any entity-specific map) to render OPSP / KPI /
   * Priority / WWW logs without polluting the shared meeting map.
   */
  fieldLabels?: Record<string, string>;
}

const MEMBER_LIST_KEYS = new Set([
  "absentUserIds",
  "dashboardNAUserIds",
  "absentClientMemberIds",
  "dashboardNAClientMemberIds",
  "teamMemberIds",
]);

/**
 * Strip HTML to plain text. Rich-text fields (e.g. `notesKPDashboard`,
 * `otherNotes`) are stored as HTML by the editor, so without this the audit
 * log showed raw markup like `<p>note</p>`. Only touches strings that actually
 * look like HTML, leaving plain values (and lone `<`/`>`) untouched.
 */
function stripHtml(s: string): string {
  if (!/<\/?[a-z][\s\S]*>/i.test(s)) return s;
  const text = s
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || "—";
}

function fmtValue(
  key: string,
  v: unknown,
  opts: FriendlyAuditOptions = {},
): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (MEMBER_LIST_KEYS.has(key)) {
      return v
        .map((id) => {
          if (typeof id !== "string") return String(id);
          const resolved = opts.nameById?.(id);
          if (resolved) return resolved;
          return CUID_RE.test(id) ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
        })
        .join(", ");
    }
    return v.map((x) => fmtValue(key, x, opts)).join(", ");
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    // Thousand separators + cap at 2 decimal places. Matches the
    // formatReviewNumber() style used elsewhere on the OPSP Review screen
    // so audit-log values look the same as the table cells.
    return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);
  }
  if (typeof v === "string") {
    if (key === "callStatus" && STATUS_LABELS[v]) return STATUS_LABELS[v];
    if (FLAG_LABELS[v] && (key === "goodNewsSharing" || key === "kpDashboard" ||
        key === "gaps" || key === "www" || key === "feedback" ||
        key === "collectiveIntelligence" || key === "opspReview" ||
        key === "format1Status" || key === "format2Status" ||
        key === "stuckCallStatus" || key === "punctualityOverride")) {
      return FLAG_LABELS[v];
    }
    if (ISO_DATE_RE.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        // Date-only if midnight UTC (typical meetingDate); otherwise full
        // datetime.
        const isMidnight =
          d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
        return isMidnight
          ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : d.toLocaleString(undefined, {
              year: "numeric", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            });
      }
    }
    if (CUID_RE.test(v)) {
      const resolved = opts.nameById?.(v);
      if (resolved) return resolved;
      // Trim opaque cuid: `cmofp1fjg001toopvmm3gb6zb` → `cmofp1…3gb6zb`
      return `${v.slice(0, 6)}…${v.slice(-6)}`;
    }
    return stripHtml(v);
  }
  // Arrays / objects → JSON, but short
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export interface FriendlyAuditEntry {
  /** One-sentence summary, e.g. "Created — Held on Apr 30, 2026". */
  headline: string;
  /** Field-level rows for the body. UPDATE has both old + new; CREATE has only new. */
  rows: Array<{ label: string; oldValue?: string; newValue: string }>;
}

const PRIORITY_KEYS = ["clientId", "meetingDate", "callStatus"] as const;

/**
 * Convert a meeting-audit entry into UI-ready, human-readable shape.
 *
 * - CREATE → headline summarises the call (date + status); rows show the most
 *   informative fields from the new value.
 * - UPDATE → headline counts changed fields; rows are old → new diffs only.
 * - SCORE_UPDATE → headline names the member; rows list the 5 KPI fields.
 * - DELETE / RESTORE → headline only.
 */
export function fmtFriendlyAuditEntry(
  action: string,
  rawNew: unknown,
  rawOld: unknown,
  opts: FriendlyAuditOptions = {},
): FriendlyAuditEntry {
  const newObj = parseAuditValue(rawNew) ?? {};
  const oldObj = parseAuditValue(rawOld) ?? {};

  if (action === "DELETE") {
    return { headline: "Deleted", rows: [] };
  }
  if (action === "RESTORE") {
    return { headline: "Restored", rows: [] };
  }

  if (action === "SCORE_UPDATE") {
    const memberId = (newObj.userId ?? newObj.clientMemberId) as string | undefined;
    const memberName = memberId ? (opts.nameById?.(memberId) ?? null) : null;
    const headline = memberName
      ? `Scored ${memberName}`
      : memberId
        ? `Scored member ${memberId.slice(0, 6)}…`
        : "Updated scores";
    const scoreKeys = ["kpiWeeklyQTD", "kpiCoding", "priorityNotes", "priorityStartEndDate", "priorityColor"];
    const rows = scoreKeys
      .filter((k) => newObj[k] !== undefined)
      .map((k) => ({ label: labelFor(k, opts.fieldLabels), newValue: fmtValue(k, newObj[k], opts) }));
    return { headline, rows };
  }

  if (action === "UPDATE") {
    const changes = diffAuditPayload(rawOld, rawNew);
    const headline = changes.length === 0
      ? "Updated"
      : `Updated ${changes.length} field${changes.length === 1 ? "" : "s"}`;
    const rows = changes.map((c) => ({
      label: labelFor(c.key, opts.fieldLabels),
      oldValue: fmtValue(c.key, c.oldValue, opts),
      newValue: fmtValue(c.key, c.newValue, opts),
    }));
    return { headline, rows };
  }

  // CREATE (default fallback)
  const status = newObj.callStatus ? fmtValue("callStatus", newObj.callStatus, opts) : null;
  const date = newObj.meetingDate ? fmtValue("meetingDate", newObj.meetingDate, opts) : null;
  const headline = [
    "Created",
    date && `for ${date}`,
    status && `— ${status}`,
  ].filter(Boolean).join(" ");
  // Surface the 3 most informative keys at the top, then any other non-noise fields.
  const ordered = [
    ...PRIORITY_KEYS.filter((k) => newObj[k] !== undefined),
    ...Object.keys(newObj).filter((k) => !NOISE_KEYS.has(k) && !PRIORITY_KEYS.includes(k as typeof PRIORITY_KEYS[number])),
  ];
  const rows = ordered.map((k) => ({
    label: labelFor(k, opts.fieldLabels),
    newValue: fmtValue(k, newObj[k], opts),
  }));
  return { headline, rows };
}
