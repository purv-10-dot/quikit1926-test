"use client";

/**
 * Weekly Meeting — list + create/edit drawer.
 *
 * Spec §5 behaviour ported:
 *   - Time-pair validation (end > start)
 *   - 7 format/quality radios + 1 punctuality override
 *   - 7 segment timings (mirror spec's time-2..time-8)
 *   - Auto-NA all radios + clear segment times when status ≠ "HELD"
 *   - Member-score grid: 5 KPI columns × client roster
 *
 * Radio↔time pairing (§5.4): when a radio flips to NO/NA, the paired segment
 * time is cleared. Mapping is radio index → segment index (1→1, 2→2, etc).
 */
import { useCallback, useEffect, useState } from "react";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton,
  Segmented, AddButton, EmptyState,
} from "@quikit/ui";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";

type Flag = "YES" | "NO" | "NA";
type Status = "HELD" | "NOT_HELD" | "CALL_CANCELLED_BY_CLIENT";
const FLAG_OPTS: Array<{ value: Flag; label: string }> = [{ value: "YES", label: "YES" }, { value: "NO", label: "NO" }, { value: "NA", label: "NA" }];
const STATUS_OPTS: Array<{ value: Status; label: string }> = [
  { value: "HELD", label: "Held" },
  { value: "NOT_HELD", label: "Not Held" },
  { value: "CALL_CANCELLED_BY_CLIENT", label: "Cancelled by Client" },
];

/** Radio fields in order + the segment-time fields they pair with (spec §5.4). */
const RADIO_FIELDS = [
  { key: "formatCheck1",        label: "Format Check 1",        pairedTime: "segmentTime1" },
  { key: "formatCheck2",        label: "Format Check 2",        pairedTime: "segmentTime2" },
  { key: "wwwReviewDone",       label: "WWW Review Done",       pairedTime: "segmentTime3" },
  { key: "feedbackDone",        label: "Customer/Employee Feedback", pairedTime: "segmentTime4" },
  { key: "collectiveIntelDone", label: "Collective Intelligence",    pairedTime: "segmentTime5" },
  { key: "kpGapsDiscussed",     label: "K&P Gaps Discussed",   pairedTime: "segmentTime6" },
  { key: "dashboardQuality",    label: "Dashboard Quality",     pairedTime: "segmentTime7" },
] as const;

const KPI_COLS = [
  { key: "kpiWeeklyQTD",         label: "KPI QTD" },
  { key: "kpiCoding",            label: "KPI Coding" },
  { key: "priorityNotes",        label: "Priority Notes" },
  { key: "priorityStartEndDate", label: "Priority Dates" },
  { key: "priorityColor",        label: "Priority Color" },
] as const;

interface ClientOpt { id: string; name: string }
interface ClientDetail { id: string; name: string; members: Array<{ userId: string; name: string }> }
interface MeetingRow {
  id: string; clientId: string; clientName: string;
  meetingDate: string; callStatus: Status;
  actualStartTime: string | null; actualEndTime: string | null;
  formatCheck1: Flag; formatCheck2: Flag; wwwReviewDone: Flag; feedbackDone: Flag;
  collectiveIntelDone: Flag; kpGapsDiscussed: Flag; dashboardQuality: Flag; punctualityOverride: Flag;
  totalMembers: number; absentUserIds: string[]; dashboardNAUserIds: string[];
}

type MemberScore = {
  userId: string;
  kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number;
  priorityStartEndDate: number; priorityColor: number;
};

const emptyForm = {
  clientId: "", meetingDate: new Date().toISOString().slice(0, 10),
  callStatus: "HELD" as Status,
  actualStartTime: "", actualEndTime: "",
  segmentTime1: "", segmentTime2: "", segmentTime3: "", segmentTime4: "",
  segmentTime5: "", segmentTime6: "", segmentTime7: "",
  formatCheck1: "NA" as Flag, formatCheck2: "NA" as Flag, wwwReviewDone: "NA" as Flag,
  feedbackDone: "NA" as Flag, collectiveIntelDone: "NA" as Flag, kpGapsDiscussed: "NA" as Flag,
  dashboardQuality: "NA" as Flag, punctualityOverride: "NA" as Flag,
  totalMembers: 0, notes: "",
  absentUserIds: [] as string[], dashboardNAUserIds: [] as string[],
  memberScores: [] as MemberScore[],
};

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
function statusBadge(s: Status) { return s === "HELD" ? "bg-green-100 text-green-700" : s === "NOT_HELD" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"; }

export default function WeeklyMeetingPage() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null); // active client roster
  const [filterClientId, setFilterClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterClientId ? `?clientId=${filterClientId}` : "";
      const [m, c] = await Promise.all([
        fetch(`/api/client-meetings/weekly-meetings${qs}`).then(r => r.json()),
        fetch("/api/client-meetings/clients").then(r => r.json()),
      ]);
      if (m.success) setRows(m.data);
      if (c.success) setClients(c.data);
    } finally { setLoading(false); }
  }, [filterClientId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadClientDetail(clientId: string) {
    if (!clientId) { setClientDetail(null); return; }
    const res = await fetch(`/api/client-meetings/clients/${clientId}`);
    const j = await res.json();
    if (j.success) setClientDetail({ id: j.data.id, name: j.data.name, members: j.data.members.map((m: { userId: string; name: string }) => ({ userId: m.userId, name: m.name })) });
  }

  async function openCreate() {
    setError("");
    const clientId = filterClientId || clients[0]?.id || "";
    setEditing({ id: null, form: { ...emptyForm, clientId } });
    if (clientId) await loadClientDetail(clientId);
  }

  async function openEdit(row: MeetingRow) {
    setError("");
    await loadClientDetail(row.clientId);
    const detailRes = await fetch(`/api/client-meetings/weekly-meetings/${row.id}`);
    const detail = (await detailRes.json()).data;
    setEditing({
      id: row.id,
      form: {
        clientId: row.clientId,
        meetingDate: row.meetingDate.slice(0, 10),
        callStatus: row.callStatus,
        actualStartTime: row.actualStartTime ?? "", actualEndTime: row.actualEndTime ?? "",
        segmentTime1: detail.segmentTime1 ?? "", segmentTime2: detail.segmentTime2 ?? "",
        segmentTime3: detail.segmentTime3 ?? "", segmentTime4: detail.segmentTime4 ?? "",
        segmentTime5: detail.segmentTime5 ?? "", segmentTime6: detail.segmentTime6 ?? "",
        segmentTime7: detail.segmentTime7 ?? "",
        formatCheck1: row.formatCheck1, formatCheck2: row.formatCheck2,
        wwwReviewDone: row.wwwReviewDone, feedbackDone: row.feedbackDone,
        collectiveIntelDone: row.collectiveIntelDone, kpGapsDiscussed: row.kpGapsDiscussed,
        dashboardQuality: row.dashboardQuality, punctualityOverride: row.punctualityOverride,
        totalMembers: row.totalMembers, notes: detail.notes ?? "",
        absentUserIds: row.absentUserIds, dashboardNAUserIds: row.dashboardNAUserIds,
        memberScores: (detail.memberScores ?? []) as MemberScore[],
      },
    });
  }

  function updateField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    if (!editing) return;
    setEditing({ ...editing, form: { ...editing.form, [key]: value } });
  }

  function updateStatus(next: Status) {
    if (!editing) return;
    if (next !== "HELD") {
      // Spec §5.3: force all radios to NA and clear segment times.
      setEditing({
        ...editing,
        form: {
          ...editing.form, callStatus: next,
          actualStartTime: "", actualEndTime: "",
          segmentTime1: "", segmentTime2: "", segmentTime3: "", segmentTime4: "",
          segmentTime5: "", segmentTime6: "", segmentTime7: "",
          formatCheck1: "NA", formatCheck2: "NA", wwwReviewDone: "NA",
          feedbackDone: "NA", collectiveIntelDone: "NA", kpGapsDiscussed: "NA",
          dashboardQuality: "NA",
        },
      });
    } else {
      setEditing({ ...editing, form: { ...editing.form, callStatus: next } });
    }
  }

  /** Radio→time pairing: flipping a radio to NO/NA clears the paired segment time. */
  function updateRadio(key: typeof RADIO_FIELDS[number]["key"], pairedTime: typeof RADIO_FIELDS[number]["pairedTime"], value: Flag) {
    if (!editing) return;
    setEditing({
      ...editing,
      form: {
        ...editing.form,
        [key]: value,
        ...(value === "YES" ? {} : { [pairedTime]: "" }),
      },
    });
  }

  function updateScore(userId: string, col: keyof MemberScore, value: number) {
    if (!editing) return;
    const next = [...editing.form.memberScores];
    const idx = next.findIndex(s => s.userId === userId);
    const base: MemberScore = idx === -1
      ? { userId, kpiWeeklyQTD: 0, kpiCoding: 0, priorityNotes: 0, priorityStartEndDate: 0, priorityColor: 0 }
      : { ...next[idx] };
    (base[col] as number) = Math.max(0, Math.min(100, value));
    if (idx === -1) next.push(base); else next[idx] = base;
    setEditing({ ...editing, form: { ...editing.form, memberScores: next } });
  }

  function getScore(userId: string, col: keyof MemberScore): number {
    const s = editing?.form.memberScores.find(s => s.userId === userId);
    return (s?.[col] as number | undefined) ?? 0;
  }

  async function handleSubmit() {
    if (!editing) return;
    const f = editing.form;
    if (!f.clientId) { setError("Pick a client"); return; }
    if (!f.meetingDate) { setError("Meeting date required"); return; }
    if (f.actualStartTime && f.actualEndTime && f.actualEndTime <= f.actualStartTime) {
      setError("Actual end time must be after start time"); return;
    }
    setSaving(true); setError("");
    try {
      const body = {
        ...f,
        meetingDate: new Date(f.meetingDate).toISOString(),
        actualStartTime: f.actualStartTime || null, actualEndTime: f.actualEndTime || null,
        segmentTime1: f.segmentTime1 || null, segmentTime2: f.segmentTime2 || null,
        segmentTime3: f.segmentTime3 || null, segmentTime4: f.segmentTime4 || null,
        segmentTime5: f.segmentTime5 || null, segmentTime6: f.segmentTime6 || null,
        segmentTime7: f.segmentTime7 || null,
        notes: f.notes || null,
      };
      const url = editing.id ? `/api/client-meetings/weekly-meetings/${editing.id}` : "/api/client-meetings/weekly-meetings";
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed"); return; }
      setEditing(null);
      await refresh();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this weekly meeting?")) return;
    const res = await fetch(`/api/client-meetings/weekly-meetings/${id}`, { method: "DELETE" });
    const j = await res.json();
    if (j.success) refresh(); else alert(j.error ?? "Failed");
  }

  const isHeld = editing?.form.callStatus === "HELD";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800">Weekly Meeting</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{rows.length} meetings</span>
          <select value={filterClientId} onChange={e => setFilterClientId(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <AddButton onClick={openCreate} disabled={clients.length === 0}>Add Weekly Meeting</AddButton>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={CalendarDays}
              title={clients.length === 0 ? "Add a client first" : "No weekly meetings yet"}
              message="Weekly meetings capture format checks, segment timings, dashboard quality, and a per-member KPI score card."
              action={clients.length > 0 ? { label: "Log a weekly meeting", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-accent-50 z-10">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Date</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Client</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Status</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Timing</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Attend</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 border-b border-gray-200">Quality</th>
                  <th className="w-24 px-4 py-2 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-blue-50/30 border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-700 font-medium whitespace-nowrap">{fmtDate(r.meetingDate)}</td>
                    <td className="px-4 py-2 text-gray-700">{r.clientName}</td>
                    <td className="px-4 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(r.callStatus)}`}>{STATUS_OPTS.find(o => o.value === r.callStatus)?.label}</span></td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.actualStartTime && r.actualEndTime ? `${r.actualStartTime} – ${r.actualEndTime}` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.totalMembers > 0 ? `${r.totalMembers - r.absentUserIds.length}/${r.totalMembers}` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-gray-600">{r.dashboardQuality === "YES" ? "✓" : r.dashboardQuality === "NO" ? "✗" : "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(r.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <RightPanel
          open onClose={() => setEditing(null)}
          size="lg"
          title={editing.id ? "Edit Weekly Meeting" : "Add Weekly Meeting"}
          subtitle={editing.id ? "Update meeting details" : "Create new record"}
          footer={
            <RightPanelFooter>
              <RightPanelCancelButton onClick={() => setEditing(null)} />
              <RightPanelSubmitButton onClick={handleSubmit} saving={saving}
                icon={editing.id ? "check" : "plus"}
                label={editing.id ? "Save Changes" : "Create Meeting"} />
            </RightPanelFooter>
          }
        >
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Date <span className="text-red-500">*</span></label>
              <input type="date" value={editing.form.meetingDate}
                onChange={e => updateField("meetingDate", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Call Status</label>
              <select value={editing.form.callStatus} onChange={e => updateStatus(e.target.value as Status)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client <span className="text-red-500">*</span></label>
              <select value={editing.form.clientId} disabled={!!editing.id}
                onChange={async e => { updateField("clientId", e.target.value); await loadClientDetail(e.target.value); }}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50">
                <option value="">Select…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Actual Start</label>
              <input type="time" disabled={!isHeld} value={editing.form.actualStartTime}
                onChange={e => updateField("actualStartTime", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Actual End</label>
              <input type="time" disabled={!isHeld} value={editing.form.actualEndTime}
                onChange={e => updateField("actualEndTime", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Format Checks & Segment Timings</p>
            <div className="space-y-2">
              {RADIO_FIELDS.map(rf => (
                <div key={rf.key} className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="text-[11px] text-gray-600 block mb-1">{rf.label}</label>
                    <Segmented
                      value={editing.form[rf.key]}
                      onChange={v => updateRadio(rf.key, rf.pairedTime, v as Flag)}
                      options={FLAG_OPTS}
                      disabled={!isHeld}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-600 block mb-1">Segment Time</label>
                    <input type="time"
                      disabled={!isHeld || editing.form[rf.key] !== "YES"}
                      value={editing.form[rf.pairedTime]}
                      onChange={e => updateField(rf.pairedTime, e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50 disabled:text-gray-400" />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-[11px] text-gray-600 block mb-1">Punctuality Override</label>
                <Segmented value={editing.form.punctualityOverride}
                  onChange={v => updateField("punctualityOverride", v as Flag)}
                  options={FLAG_OPTS} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Total Members Invited</label>
              <input type="number" min={0} value={editing.form.totalMembers}
                onChange={e => updateField("totalMembers", parseInt(e.target.value || "0", 10))}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Absent ({editing.form.absentUserIds.length})</label>
              <select multiple
                value={editing.form.absentUserIds}
                onChange={e => updateField("absentUserIds", Array.from(e.target.selectedOptions).map(o => o.value))}
                className="w-full h-20 px-2 py-1 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                {(clientDetail?.members ?? []).map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {/* Member score grid — KPI × Member */}
          {clientDetail && clientDetail.members.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Weekly Member Scores (0–100)</p>
              <div className="border border-gray-200 rounded-lg overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 border-b border-gray-200">Member</th>
                      {KPI_COLS.map(k => <th key={k.key} className="text-center px-2 py-2 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">{k.label}</th>)}
                      <th className="text-center px-2 py-2 font-semibold text-gray-500 border-b border-gray-200">Dashboard NA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientDetail.members.map(m => (
                      <tr key={m.userId} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{m.name}</td>
                        {KPI_COLS.map(k => (
                          <td key={k.key} className="px-1 py-1">
                            <input type="number" min={0} max={100}
                              value={getScore(m.userId, k.key as keyof MemberScore)}
                              onChange={e => updateScore(m.userId, k.key as keyof MemberScore, parseInt(e.target.value || "0", 10))}
                              className="w-16 px-2 py-1 text-center text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400" />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox"
                            checked={editing.form.dashboardNAUserIds.includes(m.userId)}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...editing.form.dashboardNAUserIds, m.userId]
                                : editing.form.dashboardNAUserIds.filter(u => u !== m.userId);
                              updateField("dashboardNAUserIds", next);
                            }}
                            className="rounded border-gray-300 text-blue-600" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea rows={3} value={editing.form.notes}
              onChange={e => updateField("notes", e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
          </div>
        </RightPanel>
      )}
    </div>
  );
}
