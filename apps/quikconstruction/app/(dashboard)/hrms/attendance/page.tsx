"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@quikit/ui";
import { CalendarCheck, ArrowLeft, Save } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Emp { id: string; empCode: string; firstName: string; lastName: string | null; }
interface Row { employeeId: string; status: "P" | "A" | "HD" | "L"; hoursWorked: number | null; remarks: string; }
interface Project { id: string; name: string; code: string }

const STATUSES: Array<{ key: Row["status"]; label: string; color: string }> = [
  { key: "P", label: "Present", color: "bg-green-100 text-green-700" },
  { key: "HD", label: "Half Day", color: "bg-amber-100 text-amber-700" },
  { key: "L", label: "Leave", color: "bg-blue-100 text-blue-700" },
  { key: "A", label: "Absent", color: "bg-red-100 text-red-700" },
];

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setSaved(false);
    const [empsR, attR] = await Promise.all([
      fetch("/api/hrms/employees").then(r => r.json()),
      fetch(`/api/hrms/attendance?date=${date}`).then(r => r.json()),
    ]);
    if (empsR.success) setEmployees(empsR.data);
    const m = new Map<string, Row>();
    if (attR.success) {
      for (const a of attR.data) {
        m.set(a.employeeId, { employeeId: a.employeeId, status: a.status, hoursWorked: a.hoursWorked ? Number(a.hoursWorked) : null, remarks: a.remarks ?? "" });
      }
    }
    setRows(m); setLoading(false);
  }, [date]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data)); }, []);

  function setRow(employeeId: string, partial: Partial<Row>) {
    setRows(prev => {
      const m = new Map(prev);
      const cur = m.get(employeeId) ?? { employeeId, status: "P" as const, hoursWorked: null, remarks: "" };
      m.set(employeeId, { ...cur, ...partial });
      return m;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const payload = Array.from(rows.values()).map(r => ({ ...r, projectId: projectId || null }));
      const res = await fetch("/api/hrms/attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, rows: payload }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setSaved(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/hrms" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> HRMS</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Attendance</h1><p className="text-xs text-gray-500">Mark P / HD / L / A per employee per day. Optional project tag.</p></div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-600">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1" />
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1">
            <option value="">(no project)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button onClick={save} disabled={busy || loading}><Save className="h-3.5 w-3.5 mr-1" />{busy ? "Saving…" : "Save Day"}</Button>
        </div>
      </div>
      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{err}</div>}
      {saved && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">Attendance saved for {date}.</div>}
      {loading ? <TableSkeleton rows={5} cols={6} /> : employees.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No employees yet" message="Add employees first." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Emp</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Hours</th>
              <th className="text-left px-3 py-2">Remarks</th>
            </tr></thead>
            <tbody>{employees.map(e => {
              const r = rows.get(e.id);
              const status = r?.status ?? null;
              return (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-3 py-2"><div className="font-medium text-gray-900">{e.firstName} {e.lastName ?? ""}</div><div className="text-[10px] font-mono text-gray-500">{e.empCode}</div></td>
                  <td className="px-3 py-2">
                    <div className="inline-flex rounded border border-gray-200 overflow-hidden">
                      {STATUSES.map(s => (
                        <button key={s.key} onClick={() => setRow(e.id, { status: s.key })} className={`px-2 py-1 text-[11px] font-semibold ${status === s.key ? s.color : "bg-white text-gray-500 hover:bg-gray-50"}`}>{s.key}</button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right"><input type="number" step="0.5" placeholder="—" style={{ width: 70 }} className="text-xs border border-gray-300 rounded px-2 py-1 text-right" value={r?.hoursWorked ?? ""} onChange={ev => setRow(e.id, { hoursWorked: ev.target.value ? Number(ev.target.value) : null })} /></td>
                  <td className="px-3 py-2"><input type="text" placeholder="—" className="w-full text-xs border border-gray-300 rounded px-2 py-1" value={r?.remarks ?? ""} onChange={ev => setRow(e.id, { remarks: ev.target.value })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
