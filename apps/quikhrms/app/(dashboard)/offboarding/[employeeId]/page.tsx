"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { ArrowLeft, CheckCircle, Clock, PauseCircle, SkipForward, MessageSquare, Send } from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";
import { EXIT_INTERVIEW_QUESTIONS } from "@/lib/data/exit-interview";

type TaskStatus = "TaskPending" | "TaskInProgress" | "TaskCompleted" | "TaskSkipped" | "TaskBlocked";

interface Task { id: string; title: string; description: string | null; department: string | null; category: string; status: TaskStatus; notes: string | null; sortOrder: number; }
interface Clearance { overallProgress: number; groups: Array<{ department: string; total: number; completed: number; pending: number; blocked: number; progress: number; clearanceGranted: boolean }>; }
interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string; reason: string;
  status: string; exitInterviewDone: boolean; exitInterviewNotes: string | null; exitInterviewAt: string | null;
  progress: number; totalTasks: number; completedTasks: number; tasks: Task[];
  employee: { id: string; firstName: string; lastName: string; displayName: string | null; employeeCode: string } | null;
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

  return (
    <div className="max-w-6xl">
      <Link href="/offboarding" className="inline-flex items-center gap-1 text-xs font-medium text-[#22c55e] hover:underline mb-4">
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Offboarding: <span className="text-lg text-gray-600">{inst.employee ? (inst.employee.displayName ?? `${inst.employee.firstName} ${inst.employee.lastName}`.trim()) : inst.employeeId}</span></h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span>Resigned: {new Date(inst.resignationDate).toLocaleDateString("en-IN")}</span>
              <span>•</span>
              <span>Last day: {new Date(inst.lastWorkingDate).toLocaleDateString("en-IN")}</span>
              <span>•</span>
              <span>{inst.reason}</span>
            </div>
          </div>
          <span className={clsx("px-3 py-1 rounded-full text-[11px] font-medium",
            inst.status === "OffboardCompleted" ? "bg-green-100 text-green-700" :
            "bg-[#dcfce7] text-[#16a34a]")}>
            {inst.status}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600">Overall Progress</span>
            <span className="font-medium text-gray-900">{inst.completedTasks}/{inst.totalTasks} ({inst.progress}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${inst.progress}%` }} />
          </div>
        </div>
      </div>

      {(() => {
        let exitResp: Record<string, unknown> | null = null;
        try { exitResp = inst.exitInterviewNotes ? JSON.parse(inst.exitInterviewNotes) as Record<string, unknown> : null; } catch { exitResp = null; }
        const s = (v: unknown) => (v == null || v === "" ? "" : String(v));
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-gray-900">Exit Interview</h2>
              {inst.exitInterviewDone ? (
                <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
                  Submitted{inst.exitInterviewAt ? ` · ${new Date(inst.exitInterviewAt).toLocaleDateString("en-IN")}` : ""}
                </span>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => sendExitMut.mutate()} disabled={sendExitMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                    <Send size={12} /> {sendExitMut.isPending ? "Sending…" : "Email to employee"}
                  </button>
                  <button onClick={() => setShowInterview(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <MessageSquare size={12} /> Fill manually
                  </button>
                </div>
              )}
            </div>
            {inst.exitInterviewDone && exitResp ? (
              <div className="space-y-3">
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
            ) : (
              <p className="text-xs text-gray-500">Not submitted yet. Email the form to the employee, or fill it on their behalf.</p>
            )}
          </div>
        );
      })()}

      {cl && cl.groups.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Department Clearance</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cl.groups.map((g) => (
              <div key={g.department} className={clsx("border rounded-lg p-3", g.clearanceGranted ? "border-green-300 bg-green-50/30" : "border-gray-200")}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold">{g.department}</span>
                  {g.clearanceGranted && <CheckCircle size={14} className="text-green-600" />}
                </div>
                <div className="text-xs text-gray-500">{g.completed}/{g.total} tasks</div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                  <div className={clsx("h-full", g.clearanceGranted ? "bg-green-500" : "bg-[#dcfce7]0")} style={{ width: `${g.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {inst.tasks.map((t, i) => (
          <div key={t.id} className={clsx("row-stagger bg-white rounded-lg shadow-sm border p-4",
            t.status === "TaskCompleted" ? "border-green-200 bg-green-50/30" :
            t.status === "TaskBlocked" ? "border-red-200" : "border-gray-200")} style={{ ["--i" as never]: Math.min(i, 10) }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={clsx("text-[13px] font-semibold", t.status === "TaskCompleted" ? "line-through text-gray-400" : "text-gray-900")}>{t.title}</h3>
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{t.category}</span>
                  {t.department && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[11px] font-medium">{t.department}</span>}
                </div>
                {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content="Mark in progress"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskInProgress" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50"><Clock size={12} /></button></Tooltip>
                <Tooltip content="Mark complete"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskCompleted" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-green-50"><CheckCircle size={12} /></button></Tooltip>
                <Tooltip content="Skip task"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskSkipped" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50"><SkipForward size={12} /></button></Tooltip>
                <Tooltip content="Block task"><button onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskBlocked" })} className="p-2 rounded-lg border border-[var(--border)] hover:bg-red-50"><PauseCircle size={12} /></button></Tooltip>
              </div>
            </div>
          </div>
        ))}
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
