"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Check, X, Clock, FileText, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface RegRecord {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  regularizationStatus: "None" | "Pending" | "Approved" | "Rejected" | "Cancelled";
  regularizationReason: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    profilePhoto: string | null;
    jobTitle: string | null;
  };
}

type Tab = "Pending" | "Approved" | "Rejected" | "Cancelled";

export default function RegularizationApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Pending");

  const { data, isLoading } = useQuery({
    queryKey: ["regularizations", tab],
    queryFn: () => api.get<RegRecord[]>(`/api/v1/hrms/attendance/regularizations?status=${tab}&limit=100`),
  });

  const records = data?.data ?? [];

  const actionMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "Approved" | "Rejected" }) =>
      api.patch(`/api/v1/hrms/attendance/records/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      qc.invalidateQueries({ queryKey: ["attendance-week"] });
    },
    onError: (e: Error) => toast.error("Action failed", e.message),
  });

  return (
    <div>
      <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 mb-1">Regularization Approvals</h1>
      <p className="text-sm text-gray-500 mb-5">Review attendance regularization requests from your team.</p>

      <div className="border-b border-[var(--border)] mb-4">
        <div className="flex items-center gap-6">
          {(["Pending", "Approved", "Rejected", "Cancelled"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "text-sm py-3 border-b-2 -mb-px transition-colors",
                tab === t ? "border-[#16243A] text-[#16243A] font-semibold" : "border-transparent text-gray-600 hover:text-gray-900",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
            <Clock size={28} className="text-gray-300" /> No {tab.toLowerCase()} regularizations
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Clock-In</th>
                <th className="px-4 py-3">Clock-Out</th>
                <th className="px-4 py-3">Reason</th>
                {tab === "Pending" && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const initials = `${r.employee.firstName[0] ?? ""}${r.employee.lastName[0] ?? ""}`.toUpperCase();
                return (
                  <tr key={r.id} className="row-stagger border-b border-gray-100 last:border-0 hover:bg-slate-50/60 transition-colors" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.employee.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.employee.profilePhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white flex items-center justify-center text-xs font-bold">
                            {initials}
                          </div>
                        )}
                        <div className="leading-tight">
                          <div className="text-sm font-semibold text-gray-900">{r.employee.firstName} {r.employee.lastName}</div>
                          <div className="text-[11px] text-gray-500">{r.employee.employeeCode}{r.employee.jobTitle ? ` · ${r.employee.jobTitle}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-800">
                      {r.checkIn ? new Date(r.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-800">
                      {r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <div className="flex items-start gap-2 text-gray-700 text-xs">
                        <FileText size={13} className="text-gray-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{r.regularizationReason ?? "—"}</span>
                      </div>
                    </td>
                    {tab === "Pending" && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => actionMut.mutate({ id: r.id, status: "Approved" })}
                            disabled={actionMut.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-60"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => actionMut.mutate({ id: r.id, status: "Rejected" })}
                            disabled={actionMut.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-60"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
