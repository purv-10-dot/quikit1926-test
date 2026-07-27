"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/ui/select";
import { FileSpreadsheet, Plus, Clock, CheckCircle, XCircle, Download, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";

type Format = "PDF" | "XLSX" | "CSV" | "JSON";
type ReportType = "Headcount" | "Attrition" | "Attendance" | "ExpenseSummary" | "LeaveBalance" | "Recruitment" | "Performance" | "Custom";

interface Report {
  id: string; name: string; type: ReportType; format: Format; status: string;
  fileUrl: string | null; rowCount: number; scheduleCron: string | null;
  lastRunAt: string | null; createdAt: string; generatedBy: string;
}

const TYPES: ReportType[] = ["Headcount", "Attrition", "Attendance", "ExpenseSummary", "LeaveBalance", "Recruitment", "Performance", "Custom"];
const FORMATS: Format[] = ["PDF", "XLSX", "CSV", "JSON"];

export default function GeneratedReportsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Headcount" as ReportType, format: "XLSX" as Format, dateFrom: "", dateTo: "" });
  const [schedForm, setSchedForm] = useState({ name: "", type: "Headcount" as ReportType, format: "XLSX" as Format, scheduleCron: "0 9 1 * *", recipients: "" });

  const { data } = useQuery({
    queryKey: ["reports", "generated"],
    queryFn: () => api.get<Report[]>("/api/v1/hrms/reports?limit=100"),
  });

  const generateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/reports", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports", "generated"] }); setShowGenerate(false); },
  });

  const scheduleMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/reports/schedule", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports", "generated"] }); setShowSchedule(false); },
  });

  const reports = data?.data ?? [];

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline mb-4">
        <ArrowLeft size={13} /> Back to reports
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="text-[#22c55e]" />
          <h1 className="text-page-title text-gray-900">Generated Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSchedule(true)} className="flex items-center gap-1 border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
            <Clock size={13} /> Schedule
          </button>
          <button onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 btn btn-primary">
            <Plus size={13} /> Generate
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <FileSpreadsheet size={32} className="mx-auto mb-2 text-gray-300" /> No reports yet
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-table-head uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Format</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Schedule</th>
                <th className="text-left px-4 py-2">Last Run</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((r, i) => (
                <tr key={r.id} className="row-stagger" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2 text-[13px] font-medium">{r.name}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{r.type}</span></td>
                  <td className="px-4 py-2 text-xs">{r.format}</td>
                  <td className="px-4 py-2">
                    <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                      r.status === "ReportCompleted" ? "bg-green-100 text-green-700" :
                      r.status === "ReportFailed" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>
                      {r.status === "ReportCompleted" ? <CheckCircle size={10} /> : r.status === "ReportFailed" ? <XCircle size={10} /> : <Clock size={10} />}
                      {r.status.replace("Report", "")}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.scheduleCron ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString("en-IN") : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {r.fileUrl && <a href={r.fileUrl} className="text-[#22c55e] hover:text-[#15803d]"><Download size={12} /></a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Report">
        <form onSubmit={(e) => {
          e.preventDefault();
          generateMut.mutate({
            name: form.name, type: form.type, format: form.format,
            parameters: { dateFrom: form.dateFrom || undefined, dateTo: form.dateTo || undefined },
          });
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v as ReportType })}
                options={TYPES.map((t) => ({ value: t, label: t }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
              <Select
                value={form.format}
                onChange={(v) => setForm({ ...form, format: v as Format })}
                options={FORMATS.map((f) => ({ value: f, label: f }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowGenerate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Generate</button>
          </div>
        </form>
      </Modal>

      <Modal open={showSchedule} onClose={() => setShowSchedule(false)} title="Schedule Report">
        <form onSubmit={(e) => {
          e.preventDefault();
          scheduleMut.mutate({
            name: schedForm.name, type: schedForm.type, format: schedForm.format,
            scheduleCron: schedForm.scheduleCron,
            recipients: schedForm.recipients ? schedForm.recipients.split(",").map((r) => r.trim()) : undefined,
          });
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input required value={schedForm.name} onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={schedForm.type}
                onChange={(v) => setSchedForm({ ...schedForm, type: v as ReportType })}
                options={TYPES.map((t) => ({ value: t, label: t }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
              <Select
                value={schedForm.format}
                onChange={(v) => setSchedForm({ ...schedForm, format: v as Format })}
                options={FORMATS.map((f) => ({ value: f, label: f }))}
              /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
            <input required value={schedForm.scheduleCron} onChange={(e) => setSchedForm({ ...schedForm, scheduleCron: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono" />
            <div className="text-xs text-gray-500 mt-1">e.g. 0 9 1 * * — 9am on 1st of month</div></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Recipients (comma-separated)</label>
            <input value={schedForm.recipients} onChange={(e) => setSchedForm({ ...schedForm, recipients: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowSchedule(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Schedule</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
