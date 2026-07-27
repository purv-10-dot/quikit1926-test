"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { ArrowLeft, CheckCircle, Clock, PauseCircle, SkipForward, MessageSquare, Send, FileText, CalendarClock, X, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { withBasePath } from "@/lib/utils/base-path";
import { useToast } from "@/components/hrms/toast";
import { EXIT_INTERVIEW_QUESTIONS } from "@/lib/data/exit-interview";

type TaskStatus = "TaskPending" | "TaskInProgress" | "TaskCompleted" | "TaskSkipped" | "TaskBlocked";

interface Task { id: string; title: string; description: string | null; department: string | null; category: string; status: TaskStatus; notes: string | null; sortOrder: number; stepType?: string | null; config?: Record<string, unknown> | null; dueDate?: string | null; }

// Rich offboarding step-type labels + a one-line config summary for the checklist.
const STEP_TYPE_LABEL: Record<string, string> = {
  CustomTask: "Custom Task", AssetReturn: "Asset Return", AccessRevoke: "Access Revocation",
  KnowledgeTransfer: "Knowledge Transfer", Clearance: "Clearance", ExitInterview: "Exit Interview",
  ReadPolicy: "Policy Re-acknowledge", SendEmail: "Send Email",
};
function stepSummary(stepType?: string | null, config?: Record<string, unknown> | null): string | null {
  if (!stepType || !config) return null;
  if (stepType === "AssetReturn") {
    const list = Array.isArray(config.assets) ? (config.assets as { type: string; qty?: number; custom?: string }[]) : [];
    return list.length ? list.map((a) => `${a.type === "Custom" ? (a.custom?.trim() || "Custom") : a.type} ×${a.qty || 1}`).join(", ") : null;
  }
  if (stepType === "AccessRevoke") {
    const list = Array.isArray(config.systems) ? (config.systems as string[]) : [];
    const other = typeof config.otherSystems === "string" ? config.otherSystems.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const all = [...list, ...other];
    return all.length ? all.join(", ") : null;
  }
  if (stepType === "ReadPolicy") {
    const n = Array.isArray(config.files) ? config.files.length : 0;
    return n ? `${n} file${n === 1 ? "" : "s"} to acknowledge` : null;
  }
  if (stepType === "SendEmail") {
    const n = Array.isArray(config.templates) ? (config.templates as string[]).filter(Boolean).length : 0;
    return n ? `${n} email${n === 1 ? "" : "s"}` : null;
  }
  return null;
}
interface Clearance { overallProgress: number; groups: Array<{ department: string; total: number; completed: number; pending: number; blocked: number; progress: number; clearanceGranted: boolean }>; }
interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string; reason: string;
  status: string; exitInterviewDone: boolean; exitInterviewNotes: string | null; exitInterviewAt: string | null;
  progress: number; totalTasks: number; completedTasks: number; tasks: Task[]; automated?: boolean;
  templateId?: string | null;
  employee: {
    id: string; firstName: string; lastName: string; displayName: string | null; employeeCode: string;
    jobTitle: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
    reportingManager: { firstName: string; lastName: string } | null;
  } | null;
}

// A step the offboarding automation can send on its own.
function sendableStep(stepType?: string | null, config?: Record<string, unknown> | null): boolean {
  const st = stepType ?? "CustomTask";
  const cfg = config ?? {};
  if (st === "SendEmail") return Array.isArray(cfg.templates) && (cfg.templates as unknown[]).filter(Boolean).length > 0;
  if (st === "ReadPolicy") return Array.isArray(cfg.files) && (cfg.files as unknown[]).length > 0;
  if (["CustomTask", "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance"].includes(st)) {
    const ids = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : (cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : []);
    return ids.length > 0;
  }
  return false;
}

export default function OffboardingDetailPage({ params }: { params: { employeeId: string } }) {
  const { employeeId } = params;
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showInterview, setShowInterview] = useState(false);
  const [interview, setInterview] = useState<Record<string, string>>({});
  const [signatureName, setSignatureName] = useState("");

  const { data } = useQuery({
    queryKey: ["offboarding", employeeId],
    queryFn: () => api.get<Instance>(`/api/v1/hrms/offboarding/${employeeId}`),
  });

  const { data: clearance } = useQuery({
    queryKey: ["offboarding", "clearance", employeeId],
    queryFn: () => api.get<Clearance>(`/api/v1/hrms/offboarding/clearance/${employeeId}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.put(`/api/v1/hrms/offboarding/tasks/${taskId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboarding"] }),
  });

  const dueDateMut = useMutation({
    mutationFn: ({ taskId, dueDate }: { taskId: string; dueDate: string | null }) =>
      api.put(`/api/v1/hrms/offboarding/tasks/${taskId}`, { dueDate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }),
    onError: (e: unknown) => toast.error("Couldn't set deadline", e instanceof Error ? e.message : undefined),
  });

  const automationMut = useMutation({
    mutationFn: (enabled: boolean) => api.post(`/api/v1/hrms/offboarding/${employeeId}/start-automation`, { enabled }),
    onSuccess: (_r, enabled) => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success(enabled ? "Automation started" : "Automation stopped", enabled ? "Each step now triggers the next as the previous completes." : undefined); },
    onError: (e: unknown) => toast.error("Couldn't update automation", e instanceof Error ? e.message : undefined),
  });
  const sendEmailMut = useMutation({
    mutationFn: (taskId: string) => api.post<{ sent: number }>(`/api/v1/hrms/offboarding/tasks/${taskId}/send-emails`, {}),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success(`${r.data.sent} email${r.data.sent === 1 ? "" : "s"} sent`, "This step is now complete."); },
    onError: (e: unknown) => toast.error("Couldn't send emails", e instanceof Error ? e.message : undefined),
  });
  const notifyAssigneesMut = useMutation({
    mutationFn: (taskId: string) => api.post(`/api/v1/hrms/offboarding/tasks/${taskId}/notify-assignees`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success("Sent", "The assignee(s) have been emailed."); },
    onError: (e: unknown) => toast.error("Couldn't send", e instanceof Error ? e.message : undefined),
  });
  const ackRequestMut = useMutation({
    mutationFn: (taskId: string) => api.post(`/api/v1/hrms/offboarding/tasks/${taskId}/ack-request`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success("Request sent", "The employee has been emailed an acknowledgement link."); },
    onError: (e: unknown) => toast.error("Couldn't send request", e instanceof Error ? e.message : undefined),
  });

  // Apply a template to an offboarding that was started without one (empty checklist).
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const { data: tplData } = useQuery({
    queryKey: ["offboarding-templates", "active"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/hrms/offboarding/templates?isActive=true&limit=100"),
  });
  const offTemplates = tplData?.data ?? [];
  const applyTemplateMut = useMutation({
    mutationFn: (templateId: string) => api.post(`/api/v1/hrms/offboarding/${employeeId}/apply-template`, { templateId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success("Template applied", "The checklist has been populated."); },
    onError: (e: unknown) => toast.error("Couldn't apply template", e instanceof Error ? e.message : undefined),
  });
  // Re-apply: rebuild the checklist from the latest version of the template.
  const reApplyMut = useMutation({
    mutationFn: (templateId: string) => api.post(`/api/v1/hrms/offboarding/${employeeId}/apply-template`, { templateId, replace: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); toast.success("Template re-applied", "The checklist was rebuilt from the latest template."); },
    onError: (e: unknown) => toast.error("Couldn't re-apply template", e instanceof Error ? e.message : undefined),
  });

  const interviewMut = useMutation({
    mutationFn: (body: Record<string, string>) => api.post(`/api/v1/hrms/offboarding/${employeeId}/exit-interview`, body),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => toast.error("Couldn't submit", e.message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding", employeeId] });
      setShowInterview(false);
      setInterview({});
      setSignatureName("");
    },
  });

  const sendExitMut = useMutation({
    mutationFn: () => api.post<{ to?: string }>(`/api/v1/hrms/offboarding/${employeeId}/exit-interview/send`, {}),
    onSuccess: (res) => toast.success("Exit interview emailed", res.data?.to ? `Sent to ${res.data.to}` : undefined),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => toast.error("Couldn't send", e.message),
  });

  const inst = data?.data;
  const cl = clearance?.data;
  if (!inst) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  // The step automation would send next — used to label the rest "Queued".
  const firstPendingSendableId = inst.tasks.find(
    (t) => sendableStep(t.stepType, t.config) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped",
  )?.id ?? null;

  const emp = inst.employee;
  const fullName = emp ? (emp.displayName ?? `${emp.firstName} ${emp.lastName}`.trim()) : inst.employeeId;
  const initials = emp
    ? `${emp.firstName?.[0] ?? ""}${emp.lastName?.[0] ?? ""}`.toUpperCase() || fullName.slice(0, 2).toUpperCase()
    : fullName.slice(0, 2).toUpperCase();
  const roleLine = [emp?.designation?.title ?? emp?.jobTitle, emp?.department?.name].filter(Boolean).join(" · ");
  const managerName = emp?.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}`.trim() : "—";
  const active = inst.status !== "OffboardCompleted" && inst.status !== "OffboardCancelled";
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const total = inst.totalTasks;
  const completed = inst.completedTasks;
  const pending = Math.max(0, total - completed);
  const today = new Date(new Date().toDateString());
  const overdue = inst.tasks.filter((t) => {
    const done = t.status === "TaskCompleted" || t.status === "TaskSkipped";
    return !!t.dueDate && !done && new Date(t.dueDate.slice(0, 10)) < today;
  }).length;

  const letters = [
    { key: "resignation", label: "Resignation Acceptance", desc: "Acknowledges the resignation & confirms the last working day.", url: `/api/v1/hrms/offboarding/${inst.employeeId}/resignation-letter` },
    { key: "relieving", label: "Relieving Letter", desc: "Formally releases the employee from their duties.", url: `/api/v1/hrms/offboarding/${inst.employeeId}/exit-letter/relieving` },
    { key: "experience", label: "Experience Letter", desc: "Certifies tenure, role & conduct for future employers.", url: `/api/v1/hrms/offboarding/${inst.employeeId}/exit-letter/experience` },
  ];

  // Completion ring geometry.
  const R = 34, C = 2 * Math.PI * R;
  const ringOffset = C * (1 - inst.progress / 100);

  return (
    <div className="w-full pb-10">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <Link href="/offboarding" className="inline-flex items-center gap-1 text-xs font-medium text-[#16a34a] hover:underline mb-4">
        <ArrowLeft size={14} /> Back to offboarding
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* ===================== MAIN COLUMN ===================== */}
        <div className="space-y-4 min-w-0">
          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 w-14 rounded-2xl grid place-items-center text-lg font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{fullName}</h1>
                  <p className="text-xs text-gray-500 truncate">{roleLine || "Employee"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {active && (
                  <button onClick={() => automationMut.mutate(!inst.automated)} disabled={automationMut.isPending}
                    title={inst.automated ? "Stop auto-sending steps" : "Send the first step and auto-send each next step as the previous completes"}
                    className={clsx("inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors",
                      inst.automated ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700 shadow-sm")}>
                    {inst.automated ? "⏸ Stop automation" : "▶ Start Offboarding"}
                  </button>
                )}
                <span className={clsx("px-3 py-1.5 rounded-full text-[11px] font-semibold",
                  inst.status === "OffboardCompleted" ? "bg-green-100 text-green-700" :
                  inst.status === "OffboardCancelled" ? "bg-gray-100 text-gray-600" :
                  "bg-emerald-50 text-emerald-700")}>
                  {inst.status}
                </span>
              </div>
            </div>

            {/* Meta strip */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-gray-100 bg-gray-100">
              {[
                { label: "Employee ID", value: emp?.employeeCode ?? "—" },
                { label: "Department", value: emp?.department?.name ?? "—" },
                { label: "Reporting Manager", value: managerName },
                { label: "Resignation", value: fmt(inst.resignationDate) },
                { label: "Last Working Day", value: fmt(inst.lastWorkingDate) },
              ].map((m) => (
                <div key={m.label} className="bg-white px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div>
                  <div className="text-xs font-medium text-gray-900 mt-0.5 truncate" title={m.value}>{m.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[11px] text-gray-500">
              <span className="font-medium text-gray-600">Reason:</span> {inst.reason}
            </div>

            {inst.automated && active && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 text-[#166534] px-3 py-2 text-xs">
                ⚙ <span><b>Automation running.</b> Each step&apos;s request is sent automatically when the previous step is completed.</span>
              </div>
            )}
          </div>

          {/* Progress card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-gray-900">Offboarding Progress</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{completed}/{total} <span className="text-gray-400">({inst.progress}%)</span></span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-500" style={{ width: `${inst.progress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "Completed", value: completed, cls: "bg-green-50 text-green-700 border-green-100" },
                { label: "Pending", value: pending, cls: "bg-amber-50 text-amber-700 border-amber-100" },
                { label: "Overdue", value: overdue, cls: "bg-red-50 text-red-700 border-red-100" },
              ].map((s) => (
                <div key={s.label} className={clsx("rounded-xl border px-3 py-2.5 text-center", s.cls)}>
                  <div className="text-xl font-bold tabular-nums">{s.value}</div>
                  <div className="text-[11px] font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Letters workflow cards */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Exit Documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {letters.map((l, i) => (
                <button key={l.key}
                  onClick={() => window.open(withBasePath(l.url), "_blank", "noopener")}
                  title={`Open the ${l.label.toLowerCase()} as a PDF`}
                  className="group text-left rounded-xl border border-gray-200 p-3.5 hover:border-green-300 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-6 w-6 rounded-full bg-green-100 text-green-700 grid place-items-center text-[11px] font-bold">{i + 1}</span>
                    <FileText size={15} className="text-gray-400 group-hover:text-green-600" />
                  </div>
                  <div className="text-xs font-semibold text-gray-900">{l.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{l.desc}</div>
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                    View PDF <ChevronRight size={12} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Exit Interview card */}
          {(() => {
            let exitResp: Record<string, unknown> | null = null;
            try { exitResp = inst.exitInterviewNotes ? JSON.parse(inst.exitInterviewNotes) as Record<string, unknown> : null; } catch { exitResp = null; }
            const s = (v: unknown) => (v == null || v === "" ? "" : String(v));
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 grid place-items-center flex-shrink-0">
                      <MessageSquare size={18} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[13px] font-semibold text-gray-900">Exit Interview</h2>
                      <p className="text-[11px] text-gray-500 mt-0.5">Capture the employee&apos;s feedback before their last day.</p>
                    </div>
                  </div>
                  {inst.exitInterviewDone ? (
                    <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-semibold flex-shrink-0">
                      Submitted{inst.exitInterviewAt ? ` · ${new Date(inst.exitInterviewAt).toLocaleDateString("en-IN")}` : ""}
                    </span>
                  ) : (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => sendExitMut.mutate()} disabled={sendExitMut.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                        <Send size={12} /> {sendExitMut.isPending ? "Sending…" : "Email to employee"}
                      </button>
                      <button onClick={() => setShowInterview(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        <MessageSquare size={12} /> Fill manually
                      </button>
                    </div>
                  )}
                </div>
                {inst.exitInterviewDone && exitResp ? (
                  <div className="space-y-3 border-t border-gray-100 pt-3">
                    {EXIT_INTERVIEW_QUESTIONS.map((q) => {
                      const val = s(exitResp![q.key]);
                      const explain = q.explainKey ? s(exitResp![q.explainKey]) : "";
                      if (!val && !explain) return null;
                      return (
                        <div key={q.key}>
                          <p className="text-[11px] font-semibold text-gray-500">{q.label}</p>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{val || "—"}{explain ? ` — ${explain}` : ""}</p>
                        </div>
                      );
                    })}
                    {s(exitResp.rating) && <div><p className="text-[11px] font-semibold text-gray-500">Overall experience</p><p className="text-sm text-gray-800">{s(exitResp.rating)}/5</p></div>}
                    {s(exitResp.notes) && <div><p className="text-[11px] font-semibold text-gray-500">Notes</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{s(exitResp.notes)}</p></div>}
                    {typeof exitResp.wouldRejoin === "boolean" && <div><p className="text-[11px] font-semibold text-gray-500">Would rejoin</p><p className="text-sm text-gray-800">{exitResp.wouldRejoin ? "Yes" : "No"}</p></div>}
                    {s(exitResp.signatureName) && <div><p className="text-[11px] font-semibold text-gray-500">Signed by</p><p className="text-sm text-gray-800">{s(exitResp.signatureName)}</p></div>}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {/* Department clearance */}
          {cl && cl.groups.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Department Clearance</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {cl.groups.map((g) => (
                  <div key={g.department} className={clsx("border rounded-xl p-3", g.clearanceGranted ? "border-green-300 bg-green-50/30" : "border-gray-200")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-semibold">{g.department}</span>
                      {g.clearanceGranted && <CheckCircle size={14} className="text-green-600" />}
                    </div>
                    <div className="text-xs text-gray-500">{g.completed}/{g.total} tasks</div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div className={clsx("h-full", g.clearanceGranted ? "bg-green-500" : "bg-green-400")} style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-[13px] font-semibold text-gray-900">Offboarding Checklist</h2>
              {inst.templateId && inst.tasks.length > 0 && active && (
                <button
                  onClick={() => {
                    if (window.confirm("Re-apply the latest template?\n\nThis rebuilds the checklist from the current template — existing steps (and their progress) are replaced.")) {
                      reApplyMut.mutate(inst.templateId!);
                    }
                  }}
                  disabled={reApplyMut.isPending}
                  title="Rebuild the checklist from the latest version of this template"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-50">
                  {reApplyMut.isPending ? "Re-applying…" : "Re-apply template"}
                </button>
              )}
            </div>

            {inst.tasks.length === 0 ? (
              active ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                  <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 grid place-items-center text-gray-300 mb-3">
                    <FileText size={22} />
                  </div>
                  <div className="text-[13px] font-semibold text-gray-900">No checklist assigned yet</div>
                  <p className="text-xs text-gray-500 mt-1 mb-4">This offboarding was started without a template. Pick one to populate the checklist.</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <div className="min-w-[240px]">
                      <Select size="sm" value={applyTemplateId} onChange={setApplyTemplateId}
                        placeholder="Choose a template…"
                        options={[{ value: "", label: "Choose a template…" }, ...offTemplates.map((t) => ({ value: t.id, label: t.name }))]} />
                    </div>
                    <button onClick={() => applyTemplateMut.mutate(applyTemplateId)} disabled={!applyTemplateId || applyTemplateMut.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60">
                      {applyTemplateMut.isPending ? "Applying…" : "Apply template"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No checklist tasks.</p>
              )
            ) : (
              <div className="space-y-2">
                {inst.tasks.map((t, i) => (
                  <div key={t.id} className={clsx("row-stagger rounded-xl border p-4",
                    t.status === "TaskCompleted" ? "border-green-200 bg-green-50/30" :
                    t.status === "TaskBlocked" ? "border-red-200" : "border-gray-200")} style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-500 grid place-items-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                          <h3 className={clsx("text-[13px] font-semibold", t.status === "TaskCompleted" ? "line-through text-gray-400" : "text-gray-900")}>{t.title}</h3>
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{t.stepType ? STEP_TYPE_LABEL[t.stepType] ?? t.stepType : t.category}</span>
                          {t.department && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[11px] font-medium">{t.department}</span>}
                        </div>
                        {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                        {(() => { const s = stepSummary(t.stepType, t.config); return s ? <div className="text-[11px] text-gray-500 mt-1">{s}</div> : null; })()}
                        {(() => {
                          const due = t.dueDate ? t.dueDate.slice(0, 10) : "";
                          const done = t.status === "TaskCompleted" || t.status === "TaskSkipped";
                          const isOverdue = !!due && !done && new Date(due) < new Date(new Date().toDateString());
                          return (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <CalendarClock size={12} className={isOverdue ? "text-red-500" : "text-gray-400"} />
                              <input type="date" value={due}
                                onChange={(e) => dueDateMut.mutate({ taskId: t.id, dueDate: e.target.value || null })}
                                className={clsx("bg-transparent border rounded-md px-1.5 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-green-400",
                                  isOverdue ? "border-red-300 text-red-600" : due ? "border-amber-200 text-amber-700" : "border-gray-200 text-gray-500")} />
                              {isOverdue && <span className="text-[10px] font-bold text-red-600">OVERDUE</span>}
                              {due && <button onClick={() => dueDateMut.mutate({ taskId: t.id, dueDate: null })} className="text-gray-300 hover:text-red-500" title="Clear deadline"><X size={11} /></button>}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {t.stepType === "SendEmail" && t.status !== "TaskCompleted" && (() => {
                          const n = Array.isArray(t.config?.templates) ? (t.config!.templates as string[]).filter(Boolean).length : 0;
                          return (
                            <button onClick={() => sendEmailMut.mutate(t.id)} disabled={sendEmailMut.isPending || n === 0}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
                              <Send size={11} /> {sendEmailMut.isPending ? "Sending…" : n > 1 ? `Send ${n} now` : "Send now"}
                            </button>
                          );
                        })()}
                        {t.stepType === "ReadPolicy" && t.status !== "TaskCompleted" && (() => {
                          const cfg = (t.config ?? {}) as Record<string, unknown>;
                          const n = Array.isArray(cfg.files) ? (cfg.files as unknown[]).length : 0;
                          if (n === 0) return null;
                          return (
                            <button onClick={() => ackRequestMut.mutate(t.id)} disabled={ackRequestMut.isPending}
                              className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60",
                                cfg.requestSentAt ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                              <Send size={11} /> {ackRequestMut.isPending ? "Sending…" : cfg.requestSentAt ? "Resend request" : "Send acknowledgement request"}
                            </button>
                          );
                        })()}
                        {["CustomTask", "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance"].includes(t.stepType ?? "") && t.status !== "TaskCompleted" && (() => {
                          const cfg = (t.config ?? {}) as Record<string, unknown>;
                          const ids = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : (cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : []);
                          if (ids.length === 0) return null;
                          return (
                            <button onClick={() => notifyAssigneesMut.mutate(t.id)} disabled={notifyAssigneesMut.isPending}
                              className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60",
                                cfg.requestSentAt ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                              <Send size={11} /> {notifyAssigneesMut.isPending ? "Sending…" : cfg.requestSentAt ? "Resend" : `Send to assignee${ids.length > 1 ? "s" : ""}`}
                            </button>
                          );
                        })()}
                        {inst.automated && sendableStep(t.stepType, t.config) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped"
                          && !(t.config?.requestSentAt) && firstPendingSendableId !== t.id && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px] font-medium self-center">Queued</span>
                        )}
                        <Tooltip content="Mark in progress"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskInProgress" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50"><Clock size={12} /></button></Tooltip>
                        <Tooltip content="Mark complete"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskCompleted" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-green-50"><CheckCircle size={12} /></button></Tooltip>
                        <Tooltip content="Skip task"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskSkipped" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50"><SkipForward size={12} /></button></Tooltip>
                        <Tooltip content="Block task"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskBlocked" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-red-50"><PauseCircle size={12} /></button></Tooltip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===================== RIGHT SUMMARY PANEL ===================== */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {/* Completion ring */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 text-center">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Completion</div>
            <div className="relative inline-grid place-items-center">
              <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
                <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle cx="48" cy="48" r={R} fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={ringOffset} className="transition-all duration-500" />
              </svg>
              <span className="absolute text-lg font-bold text-gray-900 tabular-nums">{inst.progress}%</span>
            </div>
            <div className="mt-3 space-y-2 text-left">
              {[
                { label: "Completed", value: completed, dot: "bg-green-500" },
                { label: "Pending", value: pending, dot: "bg-amber-500" },
                { label: "Overdue", value: overdue, dot: "bg-red-500" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-gray-600"><span className={clsx("h-2 w-2 rounded-full", r.dot)} />{r.label}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Generated letters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Exit Documents</div>
            <div className="space-y-1.5">
              {letters.map((l) => (
                <button key={l.key} onClick={() => window.open(withBasePath(l.url), "_blank", "noopener")}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50 transition-colors">
                  <FileText size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate">{l.label}</span>
                  <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Employee summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Employee Summary</div>
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "Name", value: fullName },
                { label: "Employee ID", value: emp?.employeeCode ?? "—" },
                { label: "Designation", value: emp?.designation?.title ?? emp?.jobTitle ?? "—" },
                { label: "Department", value: emp?.department?.name ?? "—" },
                { label: "Manager", value: managerName },
                { label: "Resignation", value: fmt(inst.resignationDate) },
                { label: "Last Working Day", value: fmt(inst.lastWorkingDate) },
                { label: "Reason", value: inst.reason },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3">
                  <dt className="text-gray-500 flex-shrink-0">{r.label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      <Modal open={showInterview} onClose={() => setShowInterview(false)} title="Exit Interview">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!interview.reasonForLeaving?.trim()) { toast.error("Please answer why the employee is leaving."); return; }
            interviewMut.mutate({ ...interview, signatureName });
          }}
          className="space-y-5 max-h-[70vh] overflow-y-auto pr-1"
        >
          {EXIT_INTERVIEW_QUESTIONS.map((q) => (
            <div key={q.key}>
              <label className="block text-xs font-medium text-gray-800 mb-1.5">{q.label}</label>
              {q.type === "yesno" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    {["Yes", "No"].map((opt) => (
                      <label key={opt} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                        <input type="radio" name={q.key} checked={interview[q.key] === opt}
                          onChange={() => setInterview((f) => ({ ...f, [q.key]: opt }))} className="accent-green-600" />
                        {opt}
                      </label>
                    ))}
                  </div>
                  {q.explainKey && (
                    <textarea rows={2} placeholder="If not, please explain…"
                      value={interview[q.explainKey] ?? ""} onChange={(e) => setInterview((f) => ({ ...f, [q.explainKey!]: e.target.value }))}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                  )}
                </div>
              ) : (
                <textarea rows={3} value={interview[q.key] ?? ""} onChange={(e) => setInterview((f) => ({ ...f, [q.key]: e.target.value }))}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
              )}
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-gray-800 mb-1.5">Signature (type full name)</label>
            <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Full name"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowInterview(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={interviewMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {interviewMut.isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
