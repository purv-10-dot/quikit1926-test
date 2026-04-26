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
  UserMultiPicker, UserPicker,
  type PickerUser,
} from "@quikit/ui";
import { CalendarDays, Pencil, Trash2, Save, Check } from "lucide-react";

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
  goodNewsSharing: Flag;
  kpDashboard: Flag;
  gaps: Flag;
  www: Flag;
  feedback: Flag;
  collectiveIntelligence: Flag;
  opspReview: Flag;
  absentClientMemberIds: string[];
  dashboardNAClientMemberIds: string[];
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Weekly Meeting
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track your weekly client meetings
          </p>
        </div>
        <AddButton onClick={openCreate}>Add</AddButton>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={filterClientId}
          onChange={(e) => setFilterClientId(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

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
            <thead className="bg-accent-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-left">End</th>
                <th className="px-3 py-2 text-left">Good News</th>
                <th className="px-3 py-2 text-left">K&amp;P</th>
                <th className="px-3 py-2 text-left">GAPS</th>
                <th className="px-3 py-2 text-left">WWW</th>
                <th className="px-3 py-2 text-left">Feedback</th>
                <th className="px-3 py-2 text-left">Coll. Intel.</th>
                <th className="px-3 py-2 text-left">OPSP</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-100 hover:bg-blue-50/30"
                >
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
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {r.actualStartTime || "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {r.actualEndTime || "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.goodNewsSharing}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.kpDashboard}</td>
                  <td className="px-3 py-2 text-gray-600">{r.gaps}</td>
                  <td className="px-3 py-2 text-gray-600">{r.www}</td>
                  <td className="px-3 py-2 text-gray-600">{r.feedback}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.collectiveIntelligence}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.opspReview}</td>
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
                <input
                  type="date"
                  value={editing.form.meetingDate}
                  onChange={(e) => updateField("meetingDate", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Call Status" required>
                <select
                  value={editing.form.callStatus}
                  onChange={(e) => setCallStatus(e.target.value as Status)}
                  className={inputCls}
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                <input
                  type="time"
                  value={editing.form.actualStartTime}
                  onChange={(e) =>
                    updateField("actualStartTime", e.target.value)
                  }
                  disabled={editing.form.callStatus !== "HELD"}
                  className={inputCls}
                />
              </Field>
              <Field label="Actual End Time" required>
                <input
                  type="time"
                  value={editing.form.actualEndTime}
                  onChange={(e) => updateField("actualEndTime", e.target.value)}
                  disabled={editing.form.callStatus !== "HELD"}
                  className={inputCls}
                />
              </Field>
            </div>

            {RADIO_FIELDS.map((rf) => (
              <div key={rf.key} className="grid grid-cols-2 gap-4">
                <Field label={rf.label} required>
                  <Segmented
                    value={editing.form[rf.key]}
                    onChange={(v) => setRadio(rf.key, rf.pairedTime, v as Flag)}
                    options={FLAG_OPTS}
                    disabled={editing.form.callStatus !== "HELD"}
                  />
                </Field>
                <Field label={`${rf.label} Time`}>
                  <input
                    type="time"
                    value={editing.form[rf.pairedTime]}
                    onChange={(e) => updateField(rf.pairedTime, e.target.value)}
                    disabled={
                      editing.form.callStatus !== "HELD" ||
                      editing.form[rf.key] !== "YES"
                    }
                    className={inputCls}
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
