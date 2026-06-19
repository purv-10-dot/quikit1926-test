"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { Check, X, User } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  duration: string;
  reason: string;
  status: string;
  appliedOn: string;
  employee: {
    id: string; firstName: string; lastName: string; employeeCode: string;
    profilePhoto: string | null;
    department: { id: string; name: string } | null;
  };
  leaveType: { id: string; name: string; code: string; color: string | null };
  approvals: Array<{
    id: string; status: string; comment: string | null;
    approver: { id: string; firstName: string; lastName: string };
  }>;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusColors: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

export default function TeamLeavesPage() {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["team-leave-requests"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests?managerId=user_dev_001&limit=50"),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      api.post(`/api/v1/hrms/leaves/requests/${id}/approve`, { status, comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-leave-requests"] }),
  });

  const requests = data?.data ?? [];
  const pending = requests.filter((r) => r.status === "Pending");
  const processed = requests.filter((r) => r.status !== "Pending");

  return (
    <div className="w-full px-6 py-6">
      <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 mb-6">Team leaves</h1>

      {/* Pending Approvals */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            Pending Approvals ({pending.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : pending.length === 0 ? (
          <div className="p-4"><EmptyState variant="inbox" title="No pending approvals" description="All caught up! New leave requests will appear here." className="border-0 shadow-none" /></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pending.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center mt-0.5">
                    <User size={14} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {r.employee.firstName} {r.employee.lastName}
                      <span className="text-gray-400 font-normal ml-1">({r.employee.employeeCode})</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {r.leaveType.color && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.leaveType.color }} />
                      )}
                      <span className="text-sm text-gray-600">{r.leaveType.name}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-sm text-gray-600">
                        {formatDate(r.startDate)} — {formatDate(r.endDate)} ({Number(r.duration)}d)
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{r.reason}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => approveMut.mutate({ id: r.id, status: "Approved" })}
                    disabled={approveMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    onClick={() => approveMut.mutate({ id: r.id, status: "Rejected" })}
                    disabled={approveMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700"
                  >
                    <X size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">History</h2>
        </div>
        {processed.length === 0 ? (
          <div className="p-4"><EmptyState variant="folder" title="No history" description="Approved + rejected team leaves show up here." className="border-0 shadow-none" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Days</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-100" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.employee.firstName} {r.employee.lastName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.leaveType.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatDate(r.startDate)} — {formatDate(r.endDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{Number(r.duration)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[r.status])}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
