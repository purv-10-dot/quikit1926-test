"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
  Segmented,
  AddButton,
  EmptyState,
  RichTextField,
  UserMultiPicker,
  UserPicker,
  DropdownPicker,
  DatePicker,
  Pagination,
  type PickerUser,
} from "@quikit/ui";
import {
  CalendarDays,
  Pencil,
  Trash2,
  Save,
  History,
  Search,
  Filter as FilterIcon,
  RotateCcw,
} from "lucide-react";
import { TrashBanner } from "@quikit/ui";
import { UserAuditCell, DateAuditCell } from "@/components/table/AuditCells";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort } from "@/lib/store";
import { useColumnResize } from "@/lib/hooks/useColumnResize";
import { useStickyOffsets } from "@/lib/hooks/useStickyOffsets";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { HeaderCell } from "@/components/table/HeaderCell";

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  meetingDate: 110,
  client: 180,
  callStatus: 110,
  absentMembers: 180,
  weeklyDashboardNA: 180,
  actualStartTime: 110,
  actualEndTime: 110,
  goodNewsSharing: 130,
  goodNewsSharingTime: 130,
  kpDashboard: 130,
  kpDashboardTime: 130,
  gaps: 80,
  gapsTime: 100,
  www: 80,
  wwwTime: 100,
  feedback: 200,
  feedbackTime: 130,
  collectiveIntelligence: 160,
  collectiveIntelligenceTime: 130,
  opspReview: 110,
  opspTime: 100,
  createdBy: 160,
  updatedBy: 160,
  createdAt: 120,
  updatedAt: 120,
};
import { fmtFriendlyAuditEntry } from "@/lib/utils/auditLog";
import { ExportDataModal, type ExportRange } from "@/components/client-meetings/ExportDataModal";
import type { ExportSelection } from "@quikit/ui";
import { Download } from "lucide-react";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { notify } from "@/lib/utils/notify";

type Flag = "YES" | "NO" | "NA";
type Status =
  | "HELD"
  | "CALL_CANCELLED_BY_CLIENT"
  | "HOLIDAY_FOR_CLIENT"
  | "HOLIDAY_FOR_SUCCESS_ALCHEMIST"
  | "OTHER";

const FLAG_OPTS: Array<{ value: Flag; label: string }> = [
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
  { value: "NA", label: "NA" },
];

const STATUS_OPTS: Array<{ value: Status; label: string }> = [
  { value: "HELD", label: "Held" },
  { value: "CALL_CANCELLED_BY_CLIENT", label: "Call cancelled by Client" },
  { value: "HOLIDAY_FOR_CLIENT", label: "Holiday for Client" },
  {
    value: "HOLIDAY_FOR_SUCCESS_ALCHEMIST",
    label: "Holiday for Success Alchemist",
  },
  { value: "OTHER", label: "Other" },
];

const RADIO_FIELDS = [
  {
    key: "goodNewsSharing",
    label: "Good News Sharing",
    pairedTime: "segmentTime1",
  },
  { key: "kpDashboard", label: "K&P dashboard", pairedTime: "segmentTime2" },
  { key: "gaps", label: "GAPS", pairedTime: "segmentTime3" },
  { key: "www", label: "WWW", pairedTime: "segmentTime4" },
  {
    key: "feedback",
    label: "Customer/Employee Feedback",
    pairedTime: "segmentTime5",
  },
  {
    key: "collectiveIntelligence",
    label: "Collective Intelligence",
    pairedTime: "segmentTime6",
  },
  { key: "opspReview", label: "OPSP Review", pairedTime: "segmentTime7" },
] as const;

const SCORE_FIELDS = [
  { key: "kpiWeeklyQTD", label: "KPI Weekly QTD Update" },
  { key: "kpiCoding", label: "KPI Coding" },
  { key: "priorityNotes", label: "Priority Notes" },
  { key: "priorityStartEndDate", label: "Priority State and End Date" },
  { key: "priorityColor", label: "Priority Colour" },
] as const;

interface ClientOpt {
  id: string;
  name: string;
}
interface ClientMember {
  userId: string;
  name: string;
}
interface ClientDetail {
  id: string;
  name: string;
  members: ClientMember[];
}
interface MeetingRow {
  id: string;
  clientId: string;
  clientName: string;
  meetingDate: string;
  callStatus: Status;
  callStatusOther: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  segmentTime1: string | null;
  segmentTime2: string | null;
  segmentTime3: string | null;
  segmentTime4: string | null;
  segmentTime5: string | null;
  segmentTime6: string | null;
  segmentTime7: string | null;
  punctualityOverride: Flag;
  goodNewsSharing: Flag;
  kpDashboard: Flag;
  gaps: Flag;
  www: Flag;
  feedback: Flag;
  collectiveIntelligence: Flag;
  opspReview: Flag;
  absentClientMemberIds: string[];
  absentClientMemberNames: string[];
  dashboardNAClientMemberIds: string[];
  dashboardNAClientMemberNames: string[];
  // Audit columns appended by GET /api/client-meetings/weekly-meetings.
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
  createdByInitials: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedByInitials: string | null;
}
interface LogEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedByName: string;
  reason: string | null;
  createdAt: string;
}
interface MemberScore {
  userId: string;
  kpiWeeklyQTD: number;
  kpiCoding: number;
  priorityNotes: number;
  priorityStartEndDate: number;
  priorityColor: number;
}

const emptyScore = (userId: string): MemberScore => ({
  userId,
  kpiWeeklyQTD: 0,
  kpiCoding: 0,
  priorityNotes: 0,
  priorityStartEndDate: 0,
  priorityColor: 0,
});

const emptyForm = {
  clientId: "",
  meetingDate: new Date().toISOString().slice(0, 10),
  callStatus: "HELD" as Status,
  callStatusOther: "",
  actualStartTime: "",
  actualEndTime: "",
  segmentTime1: "",
  segmentTime2: "",
  segmentTime3: "",
  segmentTime4: "",
  segmentTime5: "",
  segmentTime6: "",
  segmentTime7: "",
  // "Planned Deviation In Time" — YES → mark this call punctual regardless of
  // actualStartTime (an agreed deviation was honored). Default NO matches the
  // UI radio in the form (only YES/NO are user-selectable; NA only appears on
  // legacy rows that pre-date this field).
  punctualityOverride: "NO" as Flag,
  goodNewsSharing: "NA" as Flag,
  kpDashboard: "NA" as Flag,
  gaps: "NA" as Flag,
  www: "NA" as Flag,
  feedback: "NA" as Flag,
  collectiveIntelligence: "NA" as Flag,
  opspReview: "NA" as Flag,
  notesKPDashboard: "",
  otherNotes: "",
  absentClientMemberIds: [] as string[],
  dashboardNAClientMemberIds: [] as string[],
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function statusBadge(s: Status) {
  if (s === "HELD") return "bg-green-100 text-green-700";
  if (s === "CALL_CANCELLED_BY_CLIENT") return "bg-red-100 text-red-700";
  // OTHER uses a neutral gray badge so it visually reads as "uncategorized"
  // rather than blending into the holiday-style amber.
  if (s === "OTHER") return "bg-gray-100 text-gray-700";
  return "bg-amber-100 text-amber-700";
}
function statusLabel(s: Status, custom?: string | null) {
  // For OTHER rows, surface the user-entered text so the cell isn't a
  // useless "Other" — falls back to the bare label if the column is blank
  // (legacy rows or in-flight migration).
  if (s === "OTHER") return custom?.trim() || "Other";
  return STATUS_OPTS.find((o) => o.value === s)?.label ?? s;
}

/** Split "First Last" or single token into PickerUser shape. */
function memberToPickerUser(m: ClientMember): PickerUser {
  const parts = m.name.trim().split(/\s+/);
  return {
    id: m.userId,
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    email: "",
  };
}

function clientToPickerUser(c: ClientOpt): PickerUser {
  const parts = c.name.trim().split(/\s+/);
  return {
    id: c.id,
    firstName: parts[0] ?? c.name,
    lastName: parts.slice(1).join(" "),
    email: "",
  };
}

function pickerPlaceholder(clientId: string, count: number): string {
  if (!clientId) return "Pick a client first";
  if (count === 0) return "No members on this client's roster";
  return "Select members…";
}

export default function WeeklyMeetingPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("WeeklyMeeting");
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    id: string | null;
    form: typeof emptyForm;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "update">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Per-field validation errors (keyed by paired-time field name like
  // "segmentTime1"). Drives the red border + inline error message under
  // each Time input that's empty while its YES radio is set.
  const [timeFieldErrors, setTimeFieldErrors] = useState<Set<string>>(new Set());

  // Search + selection (KPI-style chrome).
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Trash view — when true, the list endpoint returns only soft-deleted rows
  // and per-row / bulk actions switch from Delete to Restore.
  const [viewTrash, setViewTrash] = useState(false);

  // Log drawer.
  const [logsFor, setLogsFor] = useState<{ id: string; label: string } | null>(
    null
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Per-member scoring grid (Update tab — works in Add and Edit).
  // Row-level state machine, independent per member:
  //   `scoreDirtyFor`  — user has typed values OR clicked Edit on a saved row.
  //                      Drives "Save button visible" in the grid.
  //   `scoreLockedFor` — row is committed (Edit-mode: persisted via PATCH;
  //                      Add-mode: staged locally for batch-PATCH after POST).
  //                      Drives "inputs disabled + Edit button visible".
  //   `scoreSavingFor` — row's PATCH is in flight (Edit-mode only).
  const [scores, setScores] = useState<Record<string, MemberScore>>({});
  const [scoreDirtyFor, setScoreDirtyFor] = useState<Record<string, boolean>>(
    {}
  );
  const [scoreLockedFor, setScoreLockedFor] = useState<Record<string, boolean>>(
    {}
  );
  const [scoreSavingFor, setScoreSavingFor] = useState<Record<string, boolean>>(
    {}
  );

  // Server-persisted column preferences (frozen / hidden / sort) via the
  // UserTablePreference table in app_quikscale. Same shape as KPI / Priority /
  // WWW — see lib/hooks/useTablePreferences.ts.
  const {
    hiddenCols,
    frozenCol: frozenUpTo,
    setFrozenCol,
    hideCol,
  } = useTablePrefs("weeklyMeeting");
  const { sortBy, sortOrder, setSort } = useTableSort("weeklyMeeting");
  const { getColWidth, startResize, colWidths } = useColumnResize("weeklyMeeting", COL_WIDTHS_DEFAULT);
  const isHidden = (key: string) => hiddenCols.includes(key);

  // Cascade-freeze: freezing column C makes every column FROM the always-frozen
  // left rail UP TO (and including) C sticky as a group. Mirrors KPI's
  // `useTableColumns` so the user-experience is identical across tables.
  //
  // The rail keys `_checkbox`, `_log`, `_id` are part of the order so the
  // sticky-offset hook measures them too — without them the user-frozen
  // columns would compute `left` starting at 0 and overlap the rail.
  // Every user column appears in render order so cascade-freeze covers the
  // full table, mirroring KPI. Adding a new column means appending it here
  // (and rendering its <Header />) — that's the only registration step.
  const COL_ORDER = useMemo(
    () => [
      "_checkbox", "_log", "_id",
      "meetingDate", "client", "callStatus",
      "absentMembers", "weeklyDashboardNA",
      "actualStartTime", "actualEndTime",
      "goodNewsSharing", "goodNewsSharingTime",
      "kpDashboard", "kpDashboardTime",
      "gaps", "gapsTime",
      "www", "wwwTime",
      "feedback", "feedbackTime",
      "collectiveIntelligence", "collectiveIntelligenceTime",
      "opspReview", "opspTime",
      "createdBy", "updatedBy", "createdAt", "updatedAt",
    ],
    [],
  );
  const hiddenSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  // Rail widths are inline-styled on the rail `<th>`s and aren't part of
  // `colWidths`. The hook needs them to seed offsets BEFORE the first
  // layout — otherwise frozen body cells flash at `left: 0` and get
  // covered by the always-frozen rail (z-[15]).
  const stickyFallback = useMemo(
    () => ({
      colOrder: COL_ORDER,
      railWidths: { _checkbox: 32, _log: 32, _id: 40 } as const,
      getColWidth,
    }),
    [COL_ORDER, getColWidth],
  );
  const { getStickyLeft } = useStickyOffsets(
    headerRowRef,
    frozenUpTo,
    hiddenSet,
    colWidths,
    stickyFallback,
  );
  const isFrozen = useCallback(
    (col: string): boolean => {
      if (!frozenUpTo) return false;
      const i = COL_ORDER.indexOf(col);
      const j = COL_ORDER.indexOf(frozenUpTo);
      // Unknown columns never freeze; the freeze stops at columns in COL_ORDER.
      return i !== -1 && j !== -1 && i <= j;
    },
    [frozenUpTo, COL_ORDER],
  );
  const handleFreeze = useCallback(
    (col: string) => setFrozenCol(frozenUpTo === col ? null : col),
    [frozenUpTo, setFrozenCol],
  );

  // Local alias that binds the table-scoped state (hide/freeze/sort/width) to
  // the extracted <HeaderCell> component. Each `<Header k="…" label="…" />`
  // call below renders one column header with sort arrow + ColMenu + resize
  // handle, returning null when the column is hidden.
  const Header = (props: {
    k: string;
    label: string;
    sortable?: boolean;
    sortKey?: string;
  }) => (
    <HeaderCell
      {...props}
      isHidden={isHidden}
      getColWidth={getColWidth}
      startResize={startResize}
      hideCol={hideCol}
      sortBy={sortBy}
      sortOrder={sortOrder}
      setSort={setSort}
      isFrozen={isFrozen}
      getStickyLeft={getStickyLeft}
      frozenUpTo={frozenUpTo}
      onFreeze={handleFreeze}
    />
  );

  // Helper for the matching <td> cells — combines the hide-via-Tailwind
  // `hidden` class with the explicit column width so table-layout: fixed
  // locks the data row to the same widths as the headers.
  function tdHideClass(k: string): string {
    return isHidden(k) ? "hidden" : "";
  }
  /** Style for body `<td>` cells. When the column is part of the frozen
   *  cascade range, also returns the measured `left` offset so the cell
   *  sits flush with the matching `<th>`. */
  function tdWidthStyle(k: string): React.CSSProperties {
    const w = getColWidth(k);
    if (isFrozen(k)) {
      return { width: w, minWidth: w, left: getStickyLeft(k) };
    }
    return { width: w };
  }
  /** Classes for body `<td>` cells when the column is in the frozen range.
   *  Returns empty string for non-frozen columns so callers can concat freely. */
  function tdStickyClass(k: string): string {
    return isFrozen(k) ? "sticky z-[10] bg-white" : "";
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qsParts: string[] = [];
      if (filterClientId) qsParts.push(`clientId=${filterClientId}`);
      if (viewTrash) qsParts.push("includeDeleted=true");
      if (sortBy) qsParts.push(`sortBy=${sortBy}`);
      if (sortBy && sortOrder) qsParts.push(`sortOrder=${sortOrder}`);
      const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
      const [m, c] = await Promise.all([
        fetch(`/api/client-meetings/weekly-meetings${qs}`).then((r) =>
          r.json()
        ),
        fetch("/api/client-meetings/clients").then((r) => r.json()),
      ]);
      if (m.success) setRows(m.data);
      if (c.success) setClients(c.data);
    } finally {
      setLoading(false);
    }
  }, [filterClientId, viewTrash, sortBy, sortOrder]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function loadClientDetail(clientId: string) {
    if (!clientId) {
      setClientDetail(null);
      return;
    }
    const res = await fetch(`/api/client-meetings/clients/${clientId}`);
    const j = await res.json();
    if (j.success) {
      // Use teamMembers (external roster) — that's what shows in the
      // Client Master "Team Members" column. Legacy `members` (tenant-user
      // memberships) is empty in modern tenants.
      const tm: Array<{ id: string; name: string }> = j.data.teamMembers ?? [];
      setClientDetail({
        id: j.data.id,
        name: j.data.name,
        members: tm.map((m) => ({ userId: m.id, name: m.name })),
      });
    }
  }

  async function openCreate() {
    setError("");
    setActiveTab("edit");
    const clientId = filterClientId || clients[0]?.id || "";
    setEditing({ id: null, form: { ...emptyForm, clientId } });
    setScores({});
    setScoreDirtyFor({});
    setScoreLockedFor({});
    setScoreSavingFor({});
    if (clientId) await loadClientDetail(clientId);
  }

  async function openEdit(row: MeetingRow) {
    setError("");
    setActiveTab("edit");
    await loadClientDetail(row.clientId);
    const detailRes = await fetch(
      `/api/client-meetings/weekly-meetings/${row.id}`
    );
    const detail = (await detailRes.json()).data;
    setEditing({
      id: row.id,
      form: {
        clientId: row.clientId,
        meetingDate: row.meetingDate.slice(0, 10),
        callStatus: row.callStatus,
        callStatusOther: row.callStatusOther ?? "",
        actualStartTime: row.actualStartTime ?? "",
        actualEndTime: row.actualEndTime ?? "",
        segmentTime1: detail.segmentTime1 ?? "",
        segmentTime2: detail.segmentTime2 ?? "",
        segmentTime3: detail.segmentTime3 ?? "",
        segmentTime4: detail.segmentTime4 ?? "",
        segmentTime5: detail.segmentTime5 ?? "",
        segmentTime6: detail.segmentTime6 ?? "",
        segmentTime7: detail.segmentTime7 ?? "",
        // Legacy rows pre-dating this column will have `NA`; coerce that to
        // `NO` for the UI radio (which only exposes YES/NO).
        punctualityOverride: (row.punctualityOverride === "YES" ? "YES" : "NO") as Flag,
        goodNewsSharing: row.goodNewsSharing,
        kpDashboard: row.kpDashboard,
        gaps: row.gaps,
        www: row.www,
        feedback: row.feedback,
        collectiveIntelligence: row.collectiveIntelligence,
        opspReview: row.opspReview,
        notesKPDashboard: detail.notesKPDashboard ?? "",
        otherNotes: detail.otherNotes ?? "",
        absentClientMemberIds: row.absentClientMemberIds,
        dashboardNAClientMemberIds: row.dashboardNAClientMemberIds,
      },
    });
    // Hydrate per-member scores from the detail payload. Rows with persisted
    // scores start LOCKED (Edit button visible) and DIRTY (so clicking Edit
    // immediately re-shows the Save button on the now-editable row).
    const scoreMap: Record<string, MemberScore> = {};
    const lockMap: Record<string, boolean> = {};
    const dirtyMap: Record<string, boolean> = {};
    for (const s of (detail.memberScores ?? []) as MemberScore[]) {
      scoreMap[s.userId] = s;
      lockMap[s.userId] = true;
      dirtyMap[s.userId] = true;
    }
    setScores(scoreMap);
    setScoreLockedFor(lockMap);
    setScoreDirtyFor(dirtyMap);
    setScoreSavingFor({});
  }

  function updateField<K extends keyof typeof emptyForm>(
    key: K,
    v: (typeof emptyForm)[K]
  ) {
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: v } } : null));
  }

  function setRadio(
    key: (typeof RADIO_FIELDS)[number]["key"],
    pairedTime: (typeof RADIO_FIELDS)[number]["pairedTime"],
    value: Flag
  ) {
    setEditing((e) => {
      if (!e) return null;
      const next = { ...e.form, [key]: value } as typeof emptyForm;
      if (value !== "YES") next[pairedTime] = "";
      return { ...e, form: next };
    });
  }

  function setCallStatus(s: Status) {
    setEditing((e) => {
      if (!e) return null;
      if (s === "HELD") {
        // Switching back to HELD clears any stale OTHER label.
        return { ...e, form: { ...e.form, callStatus: s, callStatusOther: "" } };
      }
      const cleared: typeof emptyForm = {
        ...e.form,
        callStatus: s,
        // Preserve whatever the user already typed when staying on / entering
        // OTHER; clear it for every other non-HELD status.
        callStatusOther: s === "OTHER" ? e.form.callStatusOther : "",
        actualStartTime: "",
        actualEndTime: "",
        segmentTime1: "",
        segmentTime2: "",
        segmentTime3: "",
        segmentTime4: "",
        segmentTime5: "",
        segmentTime6: "",
        segmentTime7: "",
        punctualityOverride: "NO",
        goodNewsSharing: "NA",
        kpDashboard: "NA",
        gaps: "NA",
        www: "NA",
        feedback: "NA",
        collectiveIntelligence: "NA",
        opspReview: "NA",
      };
      return { ...e, form: cleared };
    });
  }

  function updateScore(
    userId: string,
    key: keyof Omit<MemberScore, "userId">,
    v: number
  ) {
    setScores((prev) => {
      const cur = prev[userId] ?? emptyScore(userId);
      return { ...prev, [userId]: { ...cur, [key]: v } };
    });
    // Typing reveals the Save button. (Locked rows can't reach this path —
    // their inputs are disabled.)
    setScoreDirtyFor((prev) => ({ ...prev, [userId]: true }));
  }

  /** Re-open a saved row for editing. Save button reappears immediately. */
  function editScore(userId: string) {
    setScoreLockedFor((prev) => ({ ...prev, [userId]: false }));
    setScoreDirtyFor((prev) => ({ ...prev, [userId]: true }));
  }

  async function saveScore(userId: string) {
    const cur = scores[userId] ?? emptyScore(userId);
    // Add mode (no meeting id yet): stage the row locally. Persistence runs
    // after the meeting POST succeeds in `save()` below.
    if (!editing?.id) {
      setScoreLockedFor((prev) => ({ ...prev, [userId]: true }));
      return;
    }
    // Edit mode: PATCH straight away — same upsert endpoint as before.
    setScoreSavingFor((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(
        `/api/client-meetings/weekly-meetings/${editing.id}/scores/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kpiWeeklyQTD: cur.kpiWeeklyQTD,
            kpiCoding: cur.kpiCoding,
            priorityNotes: cur.priorityNotes,
            priorityStartEndDate: cur.priorityStartEndDate,
            priorityColor: cur.priorityColor,
          }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (j.success) {
        setScoreLockedFor((prev) => ({ ...prev, [userId]: true }));
      } else {
        setError(j.error ?? "Save failed");
      }
    } catch {
      setError("Network error while saving score");
    } finally {
      setScoreSavingFor((prev) => ({ ...prev, [userId]: false }));
    }
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    if (!f.clientId) {
      setError("Pick a client");
      return;
    }
    if (f.callStatus === "OTHER" && !f.callStatusOther.trim()) {
      setError("Please specify the call status text");
      return;
    }

    // ── Held → Actual Start/End times are mandatory ──────────────────────
    // The meeting actually happened, so its timing must be recorded. Mirrors
    // the YES→time UX (and the server-side refine in clientMeetingsSchema):
    // red-border the empty field(s) and scroll to the first.
    if (f.callStatus === "HELD") {
      const missingActual: string[] = [];
      if (!f.actualStartTime) missingActual.push("actualStartTime");
      if (!f.actualEndTime) missingActual.push("actualEndTime");
      if (missingActual.length > 0) {
        setTimeFieldErrors(new Set(missingActual));
        setError(
          "Actual Start Time and Actual End Time are required when the call status is Held",
        );
        const first = missingActual[0];
        requestAnimationFrame(() => {
          const el = document.querySelector(
            `[data-time-field="${first}"]`,
          ) as HTMLElement | null;
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => el.focus({ preventScroll: true }), 350);
          }
        });
        return;
      }
    }
    if (
      f.actualStartTime &&
      f.actualEndTime &&
      f.actualEndTime <= f.actualStartTime
    ) {
      setError("Actual end time must be after start time");
      return;
    }

    // ── YES → Time is mandatory ──────────────────────────────────────────
    // For each radio field (Good News Sharing, K&P dashboard, GAPS, WWW,
    // Customer/Employee Feedback, Collective Intelligence, OPSP Review):
    // if the user picked YES, the paired Time field must be filled.
    // YES means "yes, we did this segment" — and the time it took is the
    // measurable record we keep. NO / NA legitimately have no time.
    const missingTimes = RADIO_FIELDS.filter(
      (rf) => f[rf.key] === "YES" && !f[rf.pairedTime],
    );
    if (missingTimes.length > 0) {
      // Populate per-field errors so each empty Time input shows a red
      // border + inline error message inline (no scroll-to-top required).
      setTimeFieldErrors(new Set(missingTimes.map((rf) => rf.pairedTime)));
      const labels = missingTimes.map((rf) => rf.label).join(", ");
      setError(
        `Please enter the time for: ${labels}. Time is required when set to YES.`,
      );
      // Scroll the FIRST missing-time field into view so the user lands
      // directly on the error instead of staring at a Submit button that
      // didn't seem to do anything. requestAnimationFrame waits one tick
      // so the just-rendered red border is visible at scroll-end.
      const firstMissingKey = missingTimes[0].pairedTime;
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-time-field="${firstMissingKey}"]`,
        ) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Brief focus so screen readers announce the error region too.
          setTimeout(() => el.focus({ preventScroll: true }), 350);
        }
      });
      return;
    }
    // Clear any prior per-field errors on a successful pass.
    if (timeFieldErrors.size > 0) setTimeFieldErrors(new Set());

    setSaving(true);
    setError("");
    try {
      const body = {
        clientId: f.clientId,
        meetingDate: f.meetingDate,
        callStatus: f.callStatus,
        callStatusOther: f.callStatus === "OTHER" ? f.callStatusOther.trim() : null,
        actualStartTime: f.actualStartTime || null,
        actualEndTime: f.actualEndTime || null,
        segmentTime1: f.segmentTime1 || null,
        segmentTime2: f.segmentTime2 || null,
        segmentTime3: f.segmentTime3 || null,
        segmentTime4: f.segmentTime4 || null,
        segmentTime5: f.segmentTime5 || null,
        segmentTime6: f.segmentTime6 || null,
        segmentTime7: f.segmentTime7 || null,
        punctualityOverride: f.punctualityOverride,
        goodNewsSharing: f.goodNewsSharing,
        kpDashboard: f.kpDashboard,
        gaps: f.gaps,
        www: f.www,
        feedback: f.feedback,
        collectiveIntelligence: f.collectiveIntelligence,
        opspReview: f.opspReview,
        notesKPDashboard: f.notesKPDashboard || null,
        otherNotes: f.otherNotes || null,
        absentClientMemberIds: f.absentClientMemberIds,
        dashboardNAClientMemberIds: f.dashboardNAClientMemberIds,
      };
      const url = editing.id
        ? `/api/client-meetings/weekly-meetings/${editing.id}`
        : "/api/client-meetings/weekly-meetings";
      const method = editing.id ? "PUT" : "POST";
      let j: {
        success?: boolean;
        error?: string;
        data?: { id?: string };
      } = {};
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        j = await res
          .json()
          .catch(() => ({ success: false, error: `HTTP ${res.status}` }));
      } catch {
        setError("Network error — could not reach the server");
        return;
      }
      if (!j.success) {
        // Friendly: take the first line; collapse newlines from Prisma stack.
        const raw = (j.error ?? "Save failed").toString();
        const friendly = raw.split("\n")[0].slice(0, 240);
        setError(friendly);
        return;
      }

      // Add mode: now that the meeting exists, persist any staged or typed
      // per-member scores. We persist any row the user touched (locked OR
      // dirty) and that maps to a currently active (non-absent) member, so
      // an unsaved-but-typed row isn't silently discarded. The PATCH route
      // upserts on (meetingId, clientMemberId) so duplicates are impossible.
      const newId = !editing.id ? j.data?.id : null;
      if (newId) {
        const absentSetSubmit = new Set(f.absentClientMemberIds);
        const rosterIds = new Set(
          (clientDetail?.members ?? []).map((m) => m.userId)
        );
        const userIds = Object.keys(scores).filter(
          (uid) =>
            (scoreLockedFor[uid] || scoreDirtyFor[uid]) &&
            rosterIds.has(uid) &&
            !absentSetSubmit.has(uid)
        );
        if (userIds.length) {
          const results = await Promise.allSettled(
            userIds.map((uid) => {
              const s = scores[uid] ?? emptyScore(uid);
              return fetch(
                `/api/client-meetings/weekly-meetings/${newId}/scores/${uid}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    kpiWeeklyQTD: s.kpiWeeklyQTD,
                    kpiCoding: s.kpiCoding,
                    priorityNotes: s.priorityNotes,
                    priorityStartEndDate: s.priorityStartEndDate,
                    priorityColor: s.priorityColor,
                  }),
                }
              );
            })
          );
          const failed = results.filter(
            (r) =>
              r.status === "rejected" ||
              (r.status === "fulfilled" && !r.value.ok)
          ).length;
          if (failed > 0) {
            // Meeting was created; surface a non-blocking warning. User can
            // re-open the meeting and re-save the affected rows.
            const warn = `Meeting saved, but ${failed} member score row${failed === 1 ? "" : "s"} failed to save. Open the meeting to retry.`;
            setError(warn);
            notify.warning(warn);
            setEditing(null);
            await refresh();
            return;
          }
        }
      }

      notify.saved("Weekly meeting", editing.id ? "updated" : "created");
      setEditing(null);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
      notify.error(err, { context: "weekly meeting", fallback: "Couldn't save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function openLogs(row: MeetingRow) {
    setLogsFor({
      id: row.id,
      label: `${row.clientName} · ${fmtDate(row.meetingDate)}`,
    });
    setLogsLoading(true);
    try {
      const res = await fetch(
        `/api/client-meetings/weekly-meetings/${row.id}/logs`
      );
      const j = await res.json();
      setLogs(j.success ? (j.data as LogEntry[]) : []);
    } finally {
      setLogsLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(visibleIds: string[]) {
    setSelectedIds((s) => {
      const allSelected = visibleIds.every((id) => s.has(id));
      if (allSelected) {
        const next = new Set(s);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...s, ...visibleIds]);
    });
  }
  async function bulkDelete() {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected meetings?`)) return;
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/client-meetings/weekly-meetings/${id}`, {
          method: "DELETE",
        })
      )
    );
    notify.saved("Weekly meeting", "deleted");
    setSelectedIds(new Set());
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this weekly meeting?")) return;
    const res = await fetch(`/api/client-meetings/weekly-meetings/${id}`, {
      method: "DELETE",
    });
    if ((await res.json()).success) {
      notify.saved("Weekly meeting", "deleted");
      refresh();
    }
  }

  async function restoreOne(id: string) {
    const res = await fetch(`/api/client-meetings/weekly-meetings/${id}/restore`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.success) {
      notify.success("Weekly meeting restored");
      refresh();
    } else {
      notify.error(json.error ?? "Couldn't restore. Please try again.");
    }
  }

  async function bulkRestore() {
    if (!selectedIds.size) return;
    const res = await fetch(`/api/client-meetings/weekly-meetings/bulk-restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selectedIds] }),
    });
    const json = await res.json();
    if (json.success) {
      notify.success(`Restored ${json.data?.restored ?? 0} meeting${json.data?.restored === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      refresh();
    } else {
      notify.error(json.error ?? "Couldn't restore. Please try again.");
    }
  }

  // Drop any stale selection whenever the user enters/exits trash mode so
  // a "Delete N selected" / "Restore N selected" button doesn't carry over
  // ids that aren't visible.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewTrash]);

  const isEdit = !!editing?.id;
  // Update tab is exposed in both Add and Edit. The grid handles the "no
  // client selected yet" case with an inline hint, so we don't gate the
  // tab strip on clientId.
  const tabs = editing
    ? [
        { key: "edit", label: "Edit" },
        { key: "update", label: "Update" },
      ]
    : undefined;
  const hasClient = !!editing?.form.clientId;

  const pickerUsers: PickerUser[] = (clientDetail?.members ?? []).map(
    memberToPickerUser
  );

  // Update tab roster — present members only. Excludes BOTH:
  //   - Absent members (flagged on the Edit tab)
  //   - Weekly-Dashboard-NA members (also flagged on the Edit tab)
  // Reactive: toggling either flag in Edit removes/re-adds the row in Update
  // without a save round-trip. Per-member scores are keyed by
  // clientMemberId server-side, so any saved scores for a now-excluded
  // member are preserved in the DB and reappear if the user un-flags them.
  const absentSet = new Set(editing?.form.absentClientMemberIds ?? []);
  const dashboardNASet = new Set(editing?.form.dashboardNAClientMemberIds ?? []);
  const activeMembers = (clientDetail?.members ?? []).filter(
    (m) => !absentSet.has(m.userId) && !dashboardNASet.has(m.userId),
  );
  const allAbsent =
    (clientDetail?.members.length ?? 0) > 0 && activeMembers.length === 0;

  // Filter rows by search query (client name or status, case-insensitive).
  const visibleRows = rows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.clientName.toLowerCase().includes(q) ||
      statusLabel(r.callStatus, r.callStatusOther).toLowerCase().includes(q)
    );
  });
  const visibleIds = visibleRows.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  // Pagination — default 10 rows, options 10/20/30/50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [searchQuery, pageSize]);
  const pagedMeetings = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  const totalMeetingPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));

  return (
    <div className="flex flex-col h-full">
      {/* Page Header (KPI-style chrome) */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">
            Weekly Meeting
          </h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {rows.length} items
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && canDelete && !viewTrash && (
            <button
              onClick={bulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size} selected
            </button>
          )}
          {selectedIds.size > 0 && viewTrash && (
            <button
              onClick={bulkRestore}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore {selectedIds.size} selected
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewTrash((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors ${
              viewTrash
                ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title={viewTrash ? "Exit Trash" : "View Trash"}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {viewTrash ? "Exit Trash" : "View Trash"}
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>

          {/* Client filter (kept) */}
          <select
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white"
            title="Filter by client"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={clients.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-50"
            title="Export Data"
          >
            <Download className="h-3.5 w-3.5" /> Export Data
          </button>

          {canCreate && <AddButton onClick={openCreate}>Add</AddButton>}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-1 min-h-0">
        {viewTrash && (
          <div className="mb-3">
            <TrashBanner count={rows.length} onExit={() => setViewTrash(false)} />
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={viewTrash ? "Trash is empty" : "No weekly meetings yet"}
            message={viewTrash ? "Deleted weekly meetings will appear here." : "Click Add to record your first weekly meeting."}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <HorizontalScroller className="flex-1">
            <table
              className="text-xs bg-white border-separate border-spacing-0"
              style={{ width: "100%", minWidth: "max-content", tableLayout: "fixed" }}>
              <thead className="bg-accent-50 text-gray-600 sticky top-0 z-10">
                {/* `ref` + `data-col-key` on every `<th>` (rail + user cols)
                    feed useStickyOffsets so each frozen column gets a `left`
                    measured from the actual DOM — no hardcoded pixel offsets. */}
                <tr ref={headerRowRef}>
                  <th data-col-key="_checkbox"
                      className="sticky z-[35] px-2 py-2 bg-accent-50 border-r border-gray-200"
                      style={{ left: 0, width: 32, minWidth: 32, maxWidth: 32 }}>
                    <label
                      onClickCapture={(e) => {
                        if (!canDelete) {
                          e.preventDefault();
                          e.stopPropagation();
                          notify.error("You don't have permission to delete");
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={() => toggleSelectAll(visibleIds)} disabled={!canDelete}
                        className={`text-blue-600 border-gray-300 ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                      />
                    </label>
                  </th>
                  <th data-col-key="_log"
                      className="sticky z-[35] px-1 py-2 text-center font-semibold bg-accent-50 border-r border-gray-200"
                      style={{ left: 32, width: 32, minWidth: 32, maxWidth: 32 }}>
                    Log
                  </th>
                  <th data-col-key="_id"
                      className="sticky z-[35] px-1 py-2 text-center font-semibold bg-accent-50 border-r border-gray-200"
                      style={{ left: 64, width: 40, minWidth: 40, maxWidth: 40 }}>
                    #
                  </th>
                  <Header k="meetingDate" label="Meeting Date" sortable />
                  <Header k="client" label="Client Name" sortable sortKey="client" />
                  <Header k="callStatus" label="Status" sortable />
                  <Header k="absentMembers" label="Absent Members" />
                  <Header k="weeklyDashboardNA" label="Weekly Dashboard NA" />
                  <Header k="actualStartTime" label="Actual Start Time" sortable />
                  <Header k="actualEndTime" label="Actual End Time" sortable />
                  <Header k="goodNewsSharing" label="Good News Sharing" />
                  <Header k="goodNewsSharingTime" label="Good News Sharing Time" />
                  <Header k="kpDashboard" label="K&P dashboard" />
                  <Header k="kpDashboardTime" label="K&P dashboard Time" />
                  <Header k="gaps" label="GAPS" />
                  <Header k="gapsTime" label="GAPS Time" />
                  <Header k="www" label="WWW" />
                  <Header k="wwwTime" label="WWW Time" />
                  <Header k="feedback" label="Customer/Employee Feedback" />
                  <Header k="feedbackTime" label="Customer/Employee Feedback Time" />
                  <Header k="collectiveIntelligence" label="Collective Intelligence" />
                  <Header k="collectiveIntelligenceTime" label="Collective Intelligence Time" />
                  <Header k="opspReview" label="OPSP Review" />
                  <Header k="opspTime" label="OPSP Time" />
                  {/* Audit columns — populated by GET /api/client-meetings/weekly-meetings. */}
                  <Header k="createdBy" label="Created By" />
                  <Header k="updatedBy" label="Updated By" />
                  <Header k="createdAt" label="Created Date" sortable />
                  <Header k="updatedAt" label="Updated Date" sortable />
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {pagedMeetings.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="border-t border-gray-100 hover:bg-blue-50/30"
                  >
                    <td className="sticky z-[15] bg-white px-2 py-2 border-r border-gray-100"
                        style={{ left: 0, width: 32, minWidth: 32, maxWidth: 32 }}>
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete) {
                            e.preventDefault();
                            e.stopPropagation();
                            notify.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)} disabled={!canDelete}
                          className={`text-blue-600 border-gray-300 ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                        />
                      </label>
                    </td>
                    <td className="sticky z-[15] bg-white px-1 py-2 text-center border-r border-gray-100"
                        style={{ left: 32, width: 32, minWidth: 32, maxWidth: 32 }}>
                      <button
                        type="button"
                        onClick={() => openLogs(r)}
                        className="text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded p-1"
                        title="View audit log"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="sticky z-[15] bg-white px-1 py-2 text-center border-r border-gray-100"
                        style={{ left: 64, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="text-gray-900 hover:underline"
                      >
                        {(page - 1) * pageSize + idx + 1}
                      </button>
                    </td>
                    {/* Body cells — each pairs tdHideClass + tdWidthStyle so the column
                        collapses when hidden and locks to the resized width when shown.
                        The sticky-left rule mirrors the matching <th> when frozen. */}
                    <td style={tdWidthStyle("meetingDate")} className={`px-3 py-2 whitespace-nowrap overflow-hidden ${tdHideClass("meetingDate")} ${tdStickyClass("meetingDate")}`}>
                      {fmtDate(r.meetingDate)}
                    </td>
                    <td style={tdWidthStyle("client")} className={`px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis ${tdHideClass("client")} ${tdStickyClass("client")}`}>
                      {r.clientName}
                    </td>
                    <td style={tdWidthStyle("callStatus")} className={`px-3 py-2 whitespace-nowrap overflow-hidden ${tdHideClass("callStatus")} ${tdStickyClass("callStatus")}`}>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(r.callStatus)}`}
                        title={r.callStatus === "OTHER" ? r.callStatusOther ?? undefined : undefined}
                      >
                        {statusLabel(r.callStatus, r.callStatusOther)}
                      </span>
                    </td>
                    <td style={tdWidthStyle("absentMembers")} className={`px-3 py-2 ${tdHideClass("absentMembers")} ${tdStickyClass("absentMembers")}`}>
                      {r.absentClientMemberNames.length ? (
                        // Cap at ~3 lines (`max-h-[3.25rem]` ≈ 3 × `text-xs leading-snug`).
                        // Longer lists scroll inside the cell so the row height stays
                        // consistent across the table; the `title` tooltip surfaces the
                        // full text for users who don't want to scroll.
                        <div
                          className="max-h-[3.25rem] overflow-y-auto leading-snug break-all text-gray-600 cursor-default pr-1"
                          style={{ scrollbarWidth: "thin" }}
                          title={r.absentClientMemberNames.join(", ")}
                        >
                          {r.absentClientMemberNames.join(", ")}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td style={tdWidthStyle("weeklyDashboardNA")} className={`px-3 py-2 ${tdHideClass("weeklyDashboardNA")} ${tdStickyClass("weeklyDashboardNA")}`}>
                      {r.dashboardNAClientMemberNames.length ? (
                        <div
                          className="max-h-[3.25rem] overflow-y-auto leading-snug break-all text-gray-600 cursor-default pr-1"
                          style={{ scrollbarWidth: "thin" }}
                          title={r.dashboardNAClientMemberNames.join(", ")}
                        >
                          {r.dashboardNAClientMemberNames.join(", ")}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td style={tdWidthStyle("actualStartTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("actualStartTime")} ${tdStickyClass("actualStartTime")}`}>
                      {r.actualStartTime || "—"}
                    </td>
                    <td style={tdWidthStyle("actualEndTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("actualEndTime")} ${tdStickyClass("actualEndTime")}`}>
                      {r.actualEndTime || "—"}
                    </td>
                    <td style={tdWidthStyle("goodNewsSharing")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("goodNewsSharing")} ${tdStickyClass("goodNewsSharing")}`}>
                      {r.goodNewsSharing}
                    </td>
                    <td style={tdWidthStyle("goodNewsSharingTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("goodNewsSharingTime")} ${tdStickyClass("goodNewsSharingTime")}`}>
                      {r.segmentTime1 || "—"}
                    </td>
                    <td style={tdWidthStyle("kpDashboard")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("kpDashboard")} ${tdStickyClass("kpDashboard")}`}>
                      {r.kpDashboard}
                    </td>
                    <td style={tdWidthStyle("kpDashboardTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("kpDashboardTime")} ${tdStickyClass("kpDashboardTime")}`}>
                      {r.segmentTime2 || "—"}
                    </td>
                    <td style={tdWidthStyle("gaps")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("gaps")} ${tdStickyClass("gaps")}`}>
                      {r.gaps}
                    </td>
                    <td style={tdWidthStyle("gapsTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("gapsTime")} ${tdStickyClass("gapsTime")}`}>
                      {r.segmentTime3 || "—"}
                    </td>
                    <td style={tdWidthStyle("www")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("www")} ${tdStickyClass("www")}`}>
                      {r.www}
                    </td>
                    <td style={tdWidthStyle("wwwTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("wwwTime")} ${tdStickyClass("wwwTime")}`}>
                      {r.segmentTime4 || "—"}
                    </td>
                    <td style={tdWidthStyle("feedback")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("feedback")} ${tdStickyClass("feedback")}`}>
                      {r.feedback}
                    </td>
                    <td style={tdWidthStyle("feedbackTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("feedbackTime")} ${tdStickyClass("feedbackTime")}`}>
                      {r.segmentTime5 || "—"}
                    </td>
                    <td style={tdWidthStyle("collectiveIntelligence")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("collectiveIntelligence")} ${tdStickyClass("collectiveIntelligence")}`}>
                      {r.collectiveIntelligence}
                    </td>
                    <td style={tdWidthStyle("collectiveIntelligenceTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("collectiveIntelligenceTime")} ${tdStickyClass("collectiveIntelligenceTime")}`}>
                      {r.segmentTime6 || "—"}
                    </td>
                    <td style={tdWidthStyle("opspReview")} className={`px-3 py-2 text-gray-600 text-center overflow-hidden ${tdHideClass("opspReview")} ${tdStickyClass("opspReview")}`}>
                      {r.opspReview}
                    </td>
                    <td style={tdWidthStyle("opspTime")} className={`px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden ${tdHideClass("opspTime")} ${tdStickyClass("opspTime")}`}>
                      {r.segmentTime7 || "—"}
                    </td>
                    {/* Audit cells — Created By / Updated By / Created Date / Updated Date.
                        Populated by GET /api/client-meetings/weekly-meetings. */}
                    <td style={tdWidthStyle("createdBy")} className={`px-3 py-2 overflow-hidden ${tdHideClass("createdBy")} ${tdStickyClass("createdBy")}`}>
                      <UserAuditCell name={r.createdByName} initials={r.createdByInitials} />
                    </td>
                    <td style={tdWidthStyle("updatedBy")} className={`px-3 py-2 overflow-hidden ${tdHideClass("updatedBy")} ${tdStickyClass("updatedBy")}`}>
                      <UserAuditCell name={r.updatedByName} initials={r.updatedByInitials} />
                    </td>
                    <td style={tdWidthStyle("createdAt")} className={`px-3 py-2 whitespace-nowrap overflow-hidden ${tdHideClass("createdAt")} ${tdStickyClass("createdAt")}`}>
                      <DateAuditCell iso={r.createdAt} />
                    </td>
                    <td style={tdWidthStyle("updatedAt")} className={`px-3 py-2 whitespace-nowrap overflow-hidden ${tdHideClass("updatedAt")} ${tdStickyClass("updatedAt")}`}>
                      <DateAuditCell iso={r.updatedAt} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {viewTrash ? (
                        <button
                          onClick={() => restoreOne(r.id)}
                          className="text-gray-400 hover:text-green-600 p-1"
                          title="Restore"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(r)}
                            className="text-gray-400 hover:text-blue-500 p-1"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => remove(r.id)}
                            className="text-gray-400 hover:text-red-500 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </HorizontalScroller>
            {visibleRows.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalMeetingPages}
                total={visibleRows.length}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </div>
        )}

        <RightPanel
          open={!!editing}
          onClose={() => setEditing(null)}
          size="lg"
          title="Weekly Meeting"
          subtitle={isEdit ? "Edit record" : "Create new record"}
          tabs={tabs}
          activeTab={editing ? activeTab : undefined}
          onTabChange={(k) => setActiveTab(k as "edit" | "update")}
          footer={
            // Hide footer only on Edit-mode + Update tab (per-row PATCH covers
            // persistence). Add-mode keeps the footer on both tabs so the user
            // can Submit from either; the Submit handler runs the create POST
            // and then batch-PATCHes any staged/typed score rows.
            // RBAC v2: hide Save when the role doesn't grant the relevant action.
            isEdit && activeTab === "update" ? undefined : (
              // Column wrapper pins the server-error banner directly above
              // the Cancel/Submit row, visible without scrolling. The Update
              // tab has no submit, so the banner is also hidden there.
              <div className="flex flex-col gap-2 w-full">
                <FormErrorBanner message={error} />
                <RightPanelFooter>
                  <RightPanelCancelButton onClick={() => setEditing(null)} />
                  {(isEdit ? canUpdate : canCreate) && (
                    <RightPanelSubmitButton
                      onClick={save}
                      saving={saving}
                      icon={isEdit ? "check" : "plus"}
                      label={isEdit ? "Update" : "Submit"}
                    />
                  )}
                </RightPanelFooter>
              </div>
            )
          }
        >
          {!editing ? null : (() => {
            const drawerLocked = isEdit ? !canUpdate : !canCreate;
            return activeTab === "update" ? (
            <fieldset disabled={drawerLocked} className={drawerLocked ? "opacity-70" : ""}>
              {drawerLocked && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
                  Read-only — your role doesn&apos;t grant {isEdit ? "update" : "create"} access on Weekly Meeting.
                </div>
              )}
              <UpdateScoreGrid
                members={activeMembers}
                allAbsent={allAbsent}
                needsClient={!hasClient}
                meetingDate={editing.form.meetingDate}
                scores={scores}
                dirtyFor={scoreDirtyFor}
                lockedFor={scoreLockedFor}
                savingFor={scoreSavingFor}
                onChange={updateScore}
                onSaveRow={saveScore}
                onEditRow={editScore}
              />
            </fieldset>
          ) : (
            <>
              {drawerLocked && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Read-only — your role doesn&apos;t grant {isEdit ? "update" : "create"} access on Weekly Meeting.
                </div>
              )}
              <fieldset disabled={drawerLocked} className={drawerLocked ? "opacity-70" : ""}>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Meeting Date">
                  <DatePicker
                    value={editing.form.meetingDate}
                    onChange={(v) => updateField("meetingDate", v)}
                  />
                </Field>
                <Field label="Call Status" required>
                  <DropdownPicker
                    value={editing.form.callStatus}
                    onChange={(v) => setCallStatus(v as Status)}
                    options={STATUS_OPTS}
                  />
                </Field>
              </div>

              {editing.form.callStatus === "OTHER" && (
                // Free-text label shown only for the "Other" status. The save
                // handler trims this and the Zod refine on the server rejects
                // empty / whitespace-only values so a bare "Other" can't be
                // persisted.
                <Field label="Specify Other" required>
                  <input
                    type="text"
                    value={editing.form.callStatusOther}
                    onChange={(e) => updateField("callStatusOther", e.target.value)}
                    maxLength={200}
                    placeholder="Enter call status…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-accent-400 focus:ring-1 focus:ring-accent-400 focus:outline-none"
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Client Name" required>
                  <UserPicker
                    value={editing.form.clientId}
                    onChange={async (id) => {
                      updateField("clientId", id);
                      // Switching clients (Add mode only — disabled in Edit)
                      // invalidates the score grid: scores are keyed by the
                      // previous client's member ids. Wipe per-row UI state
                      // so the new roster starts fresh.
                      setScores({});
                      setScoreDirtyFor({});
                      setScoreLockedFor({});
                      setScoreSavingFor({});
                      await loadClientDetail(id);
                    }}
                    users={clients.map(clientToPickerUser)}
                    placeholder="Select a client…"
                    disabled={isEdit}
                  />
                </Field>
                {/* Planned Deviation In Time — feeds the punctuality metric on
                    the Dashboard. YES = treat this call as on-time regardless
                    of actualStartTime (an agreed schedule deviation was
                    honored); NO = use the normal time-grace check. Underlying
                    enum is ClientMeetingFlag (YES/NO/NA) — NA only appears on
                    legacy rows pre-dating this field. */}
                <Field label="Planned Deviation In Time">
                  <div className="flex items-center gap-6 px-3 py-2 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="punctualityOverride"
                        value="YES"
                        checked={editing.form.punctualityOverride === "YES"}
                        onChange={() => updateField("punctualityOverride", "YES")}
                        className="text-accent-600 focus:ring-accent-400"
                      />
                      <span className="text-gray-700">YES</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="punctualityOverride"
                        value="NO"
                        checked={editing.form.punctualityOverride !== "YES"}
                        onChange={() => updateField("punctualityOverride", "NO")}
                        className="text-accent-600 focus:ring-accent-400"
                      />
                      <span className="text-gray-700">NO</span>
                    </label>
                  </div>
                </Field>
              </div>

              <Field label="Absent Members">
                <UserMultiPicker
                  values={editing.form.absentClientMemberIds}
                  onChange={(v) => {
                    updateField("absentClientMemberIds", v);
                    // Newly-absent users can't also be Dashboard NA — drop
                    // any stale NA entries that overlap with the new absent
                    // list. Keeps the two pickers consistent.
                    const absentSet = new Set(v);
                    const cleanedNA = editing.form.dashboardNAClientMemberIds.filter(
                      (id) => !absentSet.has(id),
                    );
                    if (cleanedNA.length !== editing.form.dashboardNAClientMemberIds.length) {
                      updateField("dashboardNAClientMemberIds", cleanedNA);
                    }
                  }}
                  users={pickerUsers}
                  placeholder={pickerPlaceholder(
                    editing.form.clientId,
                    pickerUsers.length
                  )}
                  disabled={!editing.form.clientId}
                />
              </Field>

              <Field label="Weekly Dashboard NA">
                <UserMultiPicker
                  values={editing.form.dashboardNAClientMemberIds}
                  onChange={(v) => updateField("dashboardNAClientMemberIds", v)}
                  // Hide users already flagged Absent — they can't also be
                  // "Dashboard NA" (a member is either present-but-skipping-
                  // dashboard or absent altogether). If a user becomes absent
                  // after being marked NA, drop their NA selection too.
                  users={pickerUsers.filter(
                    (u) => !editing.form.absentClientMemberIds.includes(u.id),
                  )}
                  placeholder={pickerPlaceholder(
                    editing.form.clientId,
                    pickerUsers.length
                  )}
                  disabled={!editing.form.clientId}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Actual Start Time" required={editing.form.callStatus === "HELD"}>
                  <input
                    type="time"
                    data-time-field="actualStartTime"
                    value={editing.form.actualStartTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateField("actualStartTime", v);
                      if (v && timeFieldErrors.has("actualStartTime")) {
                        setTimeFieldErrors((prev) => {
                          const next = new Set(prev);
                          next.delete("actualStartTime");
                          return next;
                        });
                      }
                      if (
                        editing.form.actualEndTime &&
                        v &&
                        editing.form.actualEndTime <= v
                      ) {
                        updateField("actualEndTime", "");
                      }
                    }}
                    disabled={editing.form.callStatus !== "HELD"}
                    className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 disabled:bg-gray-50 ${
                      timeFieldErrors.has("actualStartTime")
                        ? "border-red-400 focus:ring-red-300 bg-red-50"
                        : "border-gray-200 focus:ring-accent-400"
                    }`}
                  />
                </Field>
                <Field label="Actual End Time" required={editing.form.callStatus === "HELD"}>
                  <input
                    type="time"
                    data-time-field="actualEndTime"
                    value={editing.form.actualEndTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (
                        editing.form.actualStartTime &&
                        v &&
                        v <= editing.form.actualStartTime
                      ) {
                        return;
                      }
                      updateField("actualEndTime", v);
                      if (v && timeFieldErrors.has("actualEndTime")) {
                        setTimeFieldErrors((prev) => {
                          const next = new Set(prev);
                          next.delete("actualEndTime");
                          return next;
                        });
                      }
                    }}
                    disabled={
                      editing.form.callStatus !== "HELD" || !editing.form.actualStartTime
                    }
                    min={editing.form.actualStartTime || undefined}
                    className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 disabled:bg-gray-50 ${
                      timeFieldErrors.has("actualEndTime")
                        ? "border-red-400 focus:ring-red-300 bg-red-50"
                        : "border-gray-200 focus:ring-accent-400"
                    }`}
                  />
                </Field>
              </div>

              {RADIO_FIELDS.map((rf) => {
                const hasTimeError = timeFieldErrors.has(rf.pairedTime);
                return (
                  <div key={rf.key} className="grid grid-cols-2 gap-4">
                    <Field label={rf.label} required>
                      <Segmented
                        value={editing.form[rf.key]}
                        onChange={(v) => {
                          setRadio(rf.key, rf.pairedTime, v as Flag);
                          // Toggling away from YES clears the time field; clear
                          // its error too so the next render isn't stuck red.
                          if (v !== "YES" && hasTimeError) {
                            setTimeFieldErrors((prev) => {
                              const next = new Set(prev);
                              next.delete(rf.pairedTime);
                              return next;
                            });
                          }
                        }}
                        options={FLAG_OPTS}
                        disabled={editing.form.callStatus !== "HELD"}
                      />
                    </Field>
                    <Field label={`${rf.label} Time`}>
                      <input
                        type="time"
                        data-time-field={rf.pairedTime}
                        value={editing.form[rf.pairedTime]}
                        onChange={(e) => {
                          updateField(rf.pairedTime, e.target.value);
                          // Typing a value clears this field's error inline so
                          // the user gets immediate feedback that they fixed it.
                          if (e.target.value && hasTimeError) {
                            setTimeFieldErrors((prev) => {
                              const next = new Set(prev);
                              next.delete(rf.pairedTime);
                              return next;
                            });
                          }
                        }}
                        disabled={
                          editing.form.callStatus !== "HELD" ||
                          editing.form[rf.key] !== "YES"
                        }
                        className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 disabled:bg-gray-50 ${
                          hasTimeError
                            ? "border-red-400 focus:ring-red-300 bg-red-50"
                            : "border-gray-200 focus:ring-accent-400"
                        }`}
                      />
                      {hasTimeError && (
                        <p className="mt-1 text-[11px] text-red-600">
                          Time is required when {rf.label} is set to YES.
                        </p>
                      )}
                    </Field>
                  </div>
                );
              })}

              <Field label="Notes K&P dashboard">
                <RichTextField
                  value={editing.form.notesKPDashboard}
                  onChange={(v) => updateField("notesKPDashboard", v)}
                  placeholder="Enter your content here..."
                />
              </Field>

              <Field label="Other Notes">
                <RichTextField
                  value={editing.form.otherNotes}
                  onChange={(v) => updateField("otherNotes", v)}
                  placeholder="Enter your content here..."
                />
              </Field>
              </fieldset>
            </>
          );
          })()}
        </RightPanel>

        <RightPanel
          open={!!logsFor}
          onClose={() => setLogsFor(null)}
          size="md"
          title="Audit log"
          subtitle={logsFor?.label}
        >
          {logsLoading ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No log entries yet.</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((l) => {
                // Build a friendly id → name resolver from in-memory data.
                const nameById = (id: string): string | undefined => {
                  const client = clients.find((c) => c.id === id);
                  if (client) return client.name;
                  const member = clientDetail?.members.find((m) => m.userId === id);
                  if (member) return member.name;
                  return undefined;
                };
                const friendly = fmtFriendlyAuditEntry(
                  l.action,
                  l.newValue,
                  l.oldValue,
                  { nameById },
                );
                return (
                  <li
                    key={l.id}
                    className="border border-gray-200 rounded-lg p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          l.action === "CREATE"
                            ? "bg-emerald-100 text-emerald-700"
                            : l.action === "UPDATE"
                              ? "bg-amber-100 text-amber-700"
                              : l.action === "DELETE"
                                ? "bg-red-100 text-red-700"
                                : l.action === "SCORE_UPDATE"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {l.action}
                      </span>
                      <span className="text-gray-400 text-[11px]">
                        {new Date(l.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-800 font-medium mb-0.5">
                      {friendly.headline}
                    </div>
                    <div className="text-gray-600 text-[11px] mb-1">
                      by <strong>{l.changedByName}</strong>
                      {l.reason && <span className="text-gray-500"> · {l.reason}</span>}
                    </div>
                    {friendly.rows.length > 0 && (
                      <table className="w-full mt-2 text-[11px] border-collapse">
                        <tbody>
                          {friendly.rows.map((r, i) => (
                            <tr key={i} className="border-t border-gray-100 first:border-t-0">
                              <td className="py-1 pr-3 text-gray-500 align-top whitespace-nowrap">{r.label}</td>
                              {r.oldValue !== undefined ? (
                                <td className="py-1 text-gray-700 align-top">
                                  <span className="text-gray-400 line-through mr-1.5">{r.oldValue}</span>
                                  <span className="text-gray-400 mr-1.5">→</span>
                                  <span className="font-medium">{r.newValue}</span>
                                </td>
                              ) : (
                                <td className="py-1 text-gray-700 align-top break-words">
                                  {r.newValue}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {/* Raw JSON kept inside a collapsed details block so devs
                        can still see the source payload when debugging. */}
                    {(l.oldValue || l.newValue) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-gray-400">
                          Raw payload
                        </summary>
                        {l.oldValue && (
                          <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto">
                            old: {l.oldValue}
                          </pre>
                        )}
                        {l.newValue && (
                          <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto">
                            new: {l.newValue}
                          </pre>
                        )}
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </RightPanel>

        <ExportDataModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          clients={clients}
          defaultClientId={filterClientId || null}
          onSubmit={async ({ from, to, clientId }: ExportRange) => {
            if (!clientId) {
              notify.error("Please select a client to export.");
              return;
            }
            // Backend builds the XLSX (with header block, member counts,
            // and Notes columns). We just stream the blob and trigger a
            // browser download.
            const res = await fetch("/api/client-meetings/export/weekly-detail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId, from, to }),
            });
            if (!res.ok) {
              const errJson = await res.json().catch(() => null);
              notify.error(errJson?.error, { context: "weekly meeting", fallback: "Couldn't export. Please try again." });
              return;
            }
            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const match = /filename="([^"]+)"/.exec(disposition);
            const filename = match?.[1] ?? `WeeklyMeetingExport_${from}_to_${to}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
        />
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50 disabled:text-gray-400";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

interface UpdateScoreGridProps {
  members: ClientMember[];
  /** True when the client roster has members but every one is marked absent. */
  allAbsent?: boolean;
  /** Add-mode early state — no client picked yet on the Edit tab. */
  needsClient?: boolean;
  meetingDate: string;
  scores: Record<string, MemberScore>;
  /** Row has unsaved input — drives Save-button visibility. */
  dirtyFor: Record<string, boolean>;
  /** Row is committed (Edit mode: PATCHed; Add mode: staged) — disables inputs and shows Edit. */
  lockedFor: Record<string, boolean>;
  savingFor: Record<string, boolean>;
  onChange: (
    userId: string,
    key: keyof Omit<MemberScore, "userId">,
    v: number
  ) => void;
  onSaveRow: (userId: string) => void;
  onEditRow: (userId: string) => void;
}

function UpdateScoreGrid({
  members,
  allAbsent = false,
  needsClient = false,
  meetingDate,
  scores,
  dirtyFor,
  lockedFor,
  savingFor,
  onChange,
  onSaveRow,
  onEditRow,
}: UpdateScoreGridProps) {
  if (needsClient) {
    return (
      <p className="text-xs text-gray-400 italic">
        Select a client on the Edit tab to load its members.
      </p>
    );
  }
  if (!members.length) {
    return (
      <p className="text-xs text-gray-400 italic">
        {allAbsent
          ? "All members are marked absent — no one to score."
          : "No members on this client roster."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <span className="inline-block bg-gray-700 text-white text-xs px-3 py-1.5 rounded">
        Meeting Date: {fmtDate(meetingDate)}
      </span>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Member Name</th>
              {SCORE_FIELDS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const s = scores[m.userId] ?? emptyScore(m.userId);
              const dirty = !!dirtyFor[m.userId];
              const locked = !!lockedFor[m.userId];
              const isSaving = !!savingFor[m.userId];
              const inputsDisabled = locked || isSaving;
              // Save shows once the user has typed values (or after Edit was
              // clicked on a saved row — onEditRow keeps dirty=true so Save
              // reappears immediately). Edit shows whenever the row is locked.
              const showSave = dirty && !locked;
              const showEdit = locked;
              return (
                <tr key={m.userId} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                    {m.name}
                  </td>
                  {SCORE_FIELDS.map((c) => (
                    <td key={c.key} className="px-3 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        // Render the input EMPTY when the stored value is the
                        // default 0 so the user sees a "0" placeholder instead
                        // of a literal value they have to clear before typing.
                        // Save logic still treats an empty / NaN field as 0
                        // via the parseFloat fallback in onChange.
                        value={s[c.key] === 0 ? "" : s[c.key]}
                        placeholder="0"
                        disabled={inputsDisabled}
                        onChange={(e) => {
                          // Clamp to [0, 100] — browser `max` only validates
                          // on submit; paste / typing / arrow-step can still
                          // produce out-of-range values without this guard.
                          const raw = parseFloat(e.target.value || "0");
                          const clamped = Number.isNaN(raw)
                            ? 0
                            : Math.min(100, Math.max(0, raw));
                          onChange(m.userId, c.key, clamped);
                        }}
                        className={`w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400 placeholder:text-gray-400 ${inputsDisabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {showEdit ? (
                      <button
                        type="button"
                        onClick={() => onEditRow(m.userId)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    ) : showSave ? (
                      <button
                        type="button"
                        onClick={() => onSaveRow(m.userId)}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
