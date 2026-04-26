"use client";

import { useCallback, useEffect, useState } from "react";
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
  TimePicker,
  type PickerUser,
} from "@quikit/ui";
import {
  CalendarDays,
  Pencil,
  Trash2,
  Save,
  Check,
  History,
  Search,
  Filter as FilterIcon,
} from "lucide-react";

type Flag = "YES" | "NO" | "NA";
type Status =
  | "HELD"
  | "CALL_CANCELLED_BY_CLIENT"
  | "HOLIDAY_FOR_CLIENT"
  | "HOLIDAY_FOR_SUCCESS_ALCHEMIST";

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
  actualStartTime: string | null;
  actualEndTime: string | null;
  segmentTime1: string | null;
  segmentTime2: string | null;
  segmentTime3: string | null;
  segmentTime4: string | null;
  segmentTime5: string | null;
  segmentTime6: string | null;
  segmentTime7: string | null;
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
  actualStartTime: "",
  actualEndTime: "",
  segmentTime1: "",
  segmentTime2: "",
  segmentTime3: "",
  segmentTime4: "",
  segmentTime5: "",
  segmentTime6: "",
  segmentTime7: "",
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
  return s === "HELD"
    ? "bg-green-100 text-green-700"
    : s === "CALL_CANCELLED_BY_CLIENT"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
}
function statusLabel(s: Status) {
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
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    id: string | null;
    form: typeof emptyForm;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "update">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Search + selection (KPI-style chrome).
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Log drawer.
  const [logsFor, setLogsFor] = useState<{ id: string; label: string } | null>(
    null
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Per-member scoring grid (Update tab, edit-only).
  const [scores, setScores] = useState<Record<string, MemberScore>>({});
  const [scoreSavedFor, setScoreSavedFor] = useState<Record<string, boolean>>(
    {}
  );
  const [scoreSavingFor, setScoreSavingFor] = useState<Record<string, boolean>>(
    {}
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterClientId ? `?clientId=${filterClientId}` : "";
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
  }, [filterClientId]);

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
    setScoreSavedFor({});
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
        actualStartTime: row.actualStartTime ?? "",
        actualEndTime: row.actualEndTime ?? "",
        segmentTime1: detail.segmentTime1 ?? "",
        segmentTime2: detail.segmentTime2 ?? "",
        segmentTime3: detail.segmentTime3 ?? "",
        segmentTime4: detail.segmentTime4 ?? "",
        segmentTime5: detail.segmentTime5 ?? "",
        segmentTime6: detail.segmentTime6 ?? "",
        segmentTime7: detail.segmentTime7 ?? "",
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
    // Hydrate per-member scores from the detail payload.
    const scoreMap: Record<string, MemberScore> = {};
    for (const s of (detail.memberScores ?? []) as MemberScore[]) {
      scoreMap[s.userId] = s;
    }
    setScores(scoreMap);
    setScoreSavedFor({});
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
      if (s === "HELD") return { ...e, form: { ...e.form, callStatus: s } };
      const cleared: typeof emptyForm = {
        ...e.form,
        callStatus: s,
        actualStartTime: "",
        actualEndTime: "",
        segmentTime1: "",
        segmentTime2: "",
        segmentTime3: "",
        segmentTime4: "",
        segmentTime5: "",
        segmentTime6: "",
        segmentTime7: "",
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
    setScoreSavedFor((prev) => ({ ...prev, [userId]: false }));
  }

  async function saveScore(userId: string) {
    if (!editing?.id) return;
    const cur = scores[userId] ?? emptyScore(userId);
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
        setScoreSavedFor((prev) => ({ ...prev, [userId]: true }));
        setTimeout(() => {
          setScoreSavedFor((prev) => ({ ...prev, [userId]: false }));
        }, 2500);
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
    if (
      f.actualStartTime &&
      f.actualEndTime &&
      f.actualEndTime <= f.actualStartTime
    ) {
      setError("Actual end time must be after start time");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        clientId: f.clientId,
        meetingDate: f.meetingDate,
        callStatus: f.callStatus,
        actualStartTime: f.actualStartTime || null,
        actualEndTime: f.actualEndTime || null,
        segmentTime1: f.segmentTime1 || null,
        segmentTime2: f.segmentTime2 || null,
        segmentTime3: f.segmentTime3 || null,
        segmentTime4: f.segmentTime4 || null,
        segmentTime5: f.segmentTime5 || null,
        segmentTime6: f.segmentTime6 || null,
        segmentTime7: f.segmentTime7 || null,
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
      let j: { success?: boolean; error?: string } = {};
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
      setEditing(null);
      await refresh();
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
    setSelectedIds(new Set());
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this weekly meeting?")) return;
    const res = await fetch(`/api/client-meetings/weekly-meetings/${id}`, {
      method: "DELETE",
    });
    if ((await res.json()).success) refresh();
  }

  const isEdit = !!editing?.id;
  const tabs = isEdit
    ? [
        { key: "edit", label: "Edit" },
        { key: "update", label: "Update" },
      ]
    : undefined;

  const pickerUsers: PickerUser[] = (clientDetail?.members ?? []).map(
    memberToPickerUser
  );

  // Filter rows by search query (client name or status, case-insensitive).
  const visibleRows = rows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.clientName.toLowerCase().includes(q) ||
      statusLabel(r.callStatus).toLowerCase().includes(q)
    );
  });
  const visibleIds = visibleRows.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

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
          {selectedIds.size > 0 && (
            <button
              onClick={bulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size} selected
            </button>
          )}

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

          <AddButton onClick={openCreate}>Add</AddButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No weekly meetings yet"
            message="Click Add to record your first weekly meeting."
          />
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-accent-50 text-gray-600 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAll(visibleIds)}
                      className="text-blue-600 border-gray-300"
                    />
                  </th>
                  <th className="px-1 py-2 w-8 text-center font-semibold">
                    Log
                  </th>
                  <th className="px-1 py-2 w-10 text-center font-semibold">
                    #
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Meeting Date
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Client Name
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Absent Members
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Weekly Dashboard NA
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Actual Start Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Actual End Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Good News Sharing
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Good News Sharing Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    K&amp;P dashboard
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    K&amp;P dashboard Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    GAPS
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    GAPS Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">WWW</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    WWW Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Customer/Employee Feedback
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Customer/Employee Feedback Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Collective Intelligence
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Collective Intelligence Time
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    OPSP Review
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    OPSP Time
                  </th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="border-t border-gray-100 hover:bg-blue-50/30"
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="text-blue-600 border-gray-300"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => openLogs(r)}
                        className="text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded p-1"
                        title="View audit log"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="text-gray-900 hover:underline"
                      >
                        {idx + 1}
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDate(r.meetingDate)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.clientName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(r.callStatus)}`}
                      >
                        {statusLabel(r.callStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.absentClientMemberNames.length
                        ? r.absentClientMemberNames.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.dashboardNAClientMemberNames.length
                        ? r.dashboardNAClientMemberNames.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.actualStartTime || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.actualEndTime || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.goodNewsSharing}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime1 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.kpDashboard}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime2 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.gaps}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime3 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.www}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime4 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.feedback}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime5 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.collectiveIntelligence}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime6 || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-center">
                      {r.opspReview}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.segmentTime7 || "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <RightPanel
          open={!!editing}
          onClose={() => setEditing(null)}
          size="lg"
          title="Weekly Meeting"
          subtitle={isEdit ? "Edit record" : "Create new record"}
          tabs={tabs}
          activeTab={isEdit ? activeTab : undefined}
          onTabChange={(k) => setActiveTab(k as "edit" | "update")}
          footer={
            activeTab === "update" && isEdit ? undefined : (
              <RightPanelFooter>
                <RightPanelCancelButton onClick={() => setEditing(null)} />
                <RightPanelSubmitButton
                  onClick={save}
                  saving={saving}
                  icon={isEdit ? "check" : "plus"}
                  label={isEdit ? "Update" : "Submit"}
                />
              </RightPanelFooter>
            )
          }
        >
          {!editing ? null : isEdit && activeTab === "update" ? (
            <UpdateScoreGrid
              members={clientDetail?.members ?? []}
              meetingDate={editing.form.meetingDate}
              scores={scores}
              savedFor={scoreSavedFor}
              savingFor={scoreSavingFor}
              onChange={updateScore}
              onSaveRow={saveScore}
            />
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

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

              <div className="grid grid-cols-2 gap-4">
                <Field label="Client Name" required>
                  <UserPicker
                    value={editing.form.clientId}
                    onChange={async (id) => {
                      updateField("clientId", id);
                      await loadClientDetail(id);
                    }}
                    users={clients.map(clientToPickerUser)}
                    placeholder="Select a client…"
                    disabled={isEdit}
                  />
                </Field>
                <Field label="Absent Members">
                  <UserMultiPicker
                    values={editing.form.absentClientMemberIds}
                    onChange={(v) => updateField("absentClientMemberIds", v)}
                    users={pickerUsers}
                    placeholder={pickerPlaceholder(
                      editing.form.clientId,
                      pickerUsers.length
                    )}
                    disabled={!editing.form.clientId}
                  />
                </Field>
              </div>

              <Field label="Weekly Dashboard NA">
                <UserMultiPicker
                  values={editing.form.dashboardNAClientMemberIds}
                  onChange={(v) => updateField("dashboardNAClientMemberIds", v)}
                  users={pickerUsers}
                  placeholder={pickerPlaceholder(
                    editing.form.clientId,
                    pickerUsers.length
                  )}
                  disabled={!editing.form.clientId}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Actual Start Time" required>
                  <TimePicker
                    value={editing.form.actualStartTime}
                    onChange={(v) => updateField("actualStartTime", v)}
                    disabled={editing.form.callStatus !== "HELD"}
                  />
                </Field>
                <Field label="Actual End Time" required>
                  <TimePicker
                    value={editing.form.actualEndTime}
                    onChange={(v) => updateField("actualEndTime", v)}
                    disabled={editing.form.callStatus !== "HELD"}
                  />
                </Field>
              </div>

              {RADIO_FIELDS.map((rf) => (
                <div key={rf.key} className="grid grid-cols-2 gap-4">
                  <Field label={rf.label} required>
                    <Segmented
                      value={editing.form[rf.key]}
                      onChange={(v) =>
                        setRadio(rf.key, rf.pairedTime, v as Flag)
                      }
                      options={FLAG_OPTS}
                      disabled={editing.form.callStatus !== "HELD"}
                    />
                  </Field>
                  <Field label={`${rf.label} Time`}>
                    <TimePicker
                      value={editing.form[rf.pairedTime]}
                      onChange={(v) => updateField(rf.pairedTime, v)}
                      disabled={
                        editing.form.callStatus !== "HELD" ||
                        editing.form[rf.key] !== "YES"
                      }
                    />
                  </Field>
                </div>
              ))}

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
            </>
          )}
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
              {logs.map((l) => (
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
                  <div className="text-gray-700">
                    <strong>{l.changedByName}</strong>
                    {l.reason && (
                      <span className="text-gray-500"> · {l.reason}</span>
                    )}
                  </div>
                  {l.oldValue && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] text-gray-500">
                        Old
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto">
                        {l.oldValue}
                      </pre>
                    </details>
                  )}
                  {l.newValue && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-gray-500">
                        New
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto">
                        {l.newValue}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </RightPanel>
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
  meetingDate: string;
  scores: Record<string, MemberScore>;
  savedFor: Record<string, boolean>;
  savingFor: Record<string, boolean>;
  onChange: (
    userId: string,
    key: keyof Omit<MemberScore, "userId">,
    v: number
  ) => void;
  onSaveRow: (userId: string) => void;
}

function UpdateScoreGrid({
  members,
  meetingDate,
  scores,
  savedFor,
  savingFor,
  onChange,
  onSaveRow,
}: UpdateScoreGridProps) {
  if (!members.length) {
    return (
      <p className="text-xs text-gray-400 italic">
        No members on this client roster.
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
              const saved = savedFor[m.userId];
              const isSaving = savingFor[m.userId];
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
                        max={1000}
                        step="0.01"
                        value={s[c.key]}
                        onChange={(e) =>
                          onChange(
                            m.userId,
                            c.key,
                            parseFloat(e.target.value || "0")
                          )
                        }
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onSaveRow(m.userId)}
                      disabled={isSaving}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium ${
                        saved
                          ? "bg-green-500 text-white"
                          : "bg-orange-500 text-white hover:bg-orange-600"
                      } disabled:opacity-50`}
                    >
                      {saved ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {saved ? "Updated" : isSaving ? "Saving…" : "Update"}
                    </button>
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
