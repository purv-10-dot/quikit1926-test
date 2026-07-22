"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ArrowLeft, CheckCircle, XCircle, Clock, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";

interface Clearance {
  offboardingId: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; displayName: string | null; employeeCode: string } | null;
  status: string;
  lastWorkingDate: string;
  overallProgress: number;
  groups: Array<{
    department: string;
    total: number;
    completed: number;
    pending: number;
    blocked: number;
    progress: number;
    clearanceGranted: boolean;
    tasks: Array<{ id: string; title: string; status: string; category: string; completedAt: string | null; notes: string | null }>;
  }>;
}

export default function ClearancePage({ params }: { params: { employeeId: string } }) {
  const { employeeId } = params;
  const api = useApiClient();

  const { data, isLoading } = useQuery({
    queryKey: ["clearance", employeeId],
    queryFn: () => api.get<Clearance>(`/api/v1/hrms/offboarding/clearance/${employeeId}`),
  });

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );
  const c = data?.data;
  if (!c) return <div className="p-8 text-center text-gray-500">No clearance data</div>;

  const allGranted = c.groups.every((g) => g.clearanceGranted);

  return (
    <div className="max-w-5xl">
      <Link href={`/offboarding/${employeeId}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#22c55e] hover:underline mb-4">
        <ArrowLeft size={14} /> Back to offboarding
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheck className={allGranted ? "text-green-600" : "text-[#22c55e]"} /> Clearance Status
            </h1>
            <div className="text-sm text-gray-500 mt-1">{c.employee ? (c.employee.displayName ?? `${c.employee.firstName} ${c.employee.lastName}`.trim()) : c.employeeId}</div>
            <div className="text-xs text-gray-500">Last working day: {new Date(c.lastWorkingDate).toLocaleDateString("en-IN")}</div>
          </div>
          {allGranted ? (
            <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-medium text-[11px] flex items-center gap-1">
              <CheckCircle size={14} /> Fully Cleared
            </span>
          ) : (
            <span className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg font-medium text-[11px]">
              {c.overallProgress}% Complete
            </span>
          )}
        </div>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={clsx("h-full transition-all", allGranted ? "bg-green-500" : "bg-[#dcfce7]0")} style={{ width: `${c.overallProgress}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {c.groups.map((g) => (
          <div key={g.department} className={clsx("bg-white rounded-lg shadow-sm border", g.clearanceGranted ? "border-green-300" : "border-gray-200")}>
            <div className={clsx("px-4 py-3 flex items-center justify-between border-b", g.clearanceGranted ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200")}>
              <div className="flex items-center gap-3">
                {g.clearanceGranted ? <CheckCircle size={18} className="text-green-600" /> :
                 g.blocked > 0 ? <XCircle size={18} className="text-red-500" /> :
                 <Clock size={18} className="text-yellow-500" />}
                <h3 className="text-[13px] font-semibold text-gray-900">{g.department}</h3>
                <span className="text-xs text-gray-500">{g.completed}/{g.total} tasks • {g.progress}%</span>
              </div>
              {g.clearanceGranted ? (
                <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-[11px] font-medium">CLEARED</span>
              ) : (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[11px] font-medium">PENDING</span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {g.tasks.map((t) => (
                <div key={t.id} className="px-4 py-2 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {t.status === "TaskCompleted" ? <CheckCircle size={14} className="text-green-500" /> :
                     t.status === "TaskBlocked" ? <XCircle size={14} className="text-red-500" /> :
                     <Clock size={14} className="text-gray-400" />}
                    <span className={clsx("text-[13px] font-semibold", t.status === "TaskCompleted" ? "line-through text-gray-400" : "text-gray-800")}>{t.title}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[11px] font-medium text-gray-500">{t.category}</span>
                  </div>
                  {t.completedAt && <span className="text-xs text-gray-400">{new Date(t.completedAt).toLocaleDateString("en-IN")}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
