"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { ArrowLeft, CheckCircle, Clock, PauseCircle, SkipForward, MessageSquare } from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { SkeletonLine } from "@/components/hrms/skeleton";

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
  const [showInterview, setShowInterview] = useState(false);
  const [interview, setInterview] = useState<{ notes: string; rating: number | null; reasonForLeaving: string; wouldRejoin: boolean }>({ notes: "", rating: null, reasonForLeaving: "", wouldRejoin: true });

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
    mutationFn: (body: typeof interview) => api.post(`/api/v1/hrms/offboarding/${employeeId}/exit-interview`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding", employeeId] }); setShowInterview(false); },
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

        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setShowInterview(true)} className="flex items-center gap-1 border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
            <MessageSquare size={14} /> {inst.exitInterviewDone ? "Edit Exit Interview" : "Exit Interview"}
          </button>
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
        <form onSubmit={(e) => { e.preventDefault(); interviewMut.mutate(interview); }} className="space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Overall Experience (1-5)</label>
            <NumberInput allowDecimal={false} min={1} max={5} value={interview.rating} onChange={(v) => setInterview({ ...interview, rating: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Reason for Leaving</label>
            <input value={interview.reasonForLeaving} onChange={(e) => setInterview({ ...interview, reasonForLeaving: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea required value={interview.notes} onChange={(e) => setInterview({ ...interview, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" rows={4} /></div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={interview.wouldRejoin} onChange={(e) => setInterview({ ...interview, wouldRejoin: e.target.checked })} /> Would rejoin
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowInterview(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Submit</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
