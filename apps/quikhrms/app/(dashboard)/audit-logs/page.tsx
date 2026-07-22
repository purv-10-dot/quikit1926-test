"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ScrollText, Download, Search } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Log {
  id: string; userId: string; actorName?: string; action: string; entityType: string; entityId: string | null;
  changes: Record<string, unknown> | null; metadata: Record<string, unknown> | null;
  ipAddress: string | null; createdAt: string;
}

const ACTIONS = ["Create", "Update", "Delete", "Login", "Logout", "Export", "Import", "Approve", "Reject", "StatusChange"];
const actionColors: Record<string, string> = {
  Create: "bg-green-100 text-green-700",
  Update: "bg-[#dcfce7] text-[#16a34a]",
  Delete: "bg-red-100 text-red-700",
  Approve: "bg-green-100 text-green-700",
  Reject: "bg-red-100 text-red-700",
  Export: "bg-purple-100 text-purple-700",
  Import: "bg-purple-100 text-purple-700",
  StatusChange: "bg-yellow-100 text-yellow-700",
  Login: "bg-gray-100 text-gray-700",
  Logout: "bg-gray-100 text-gray-700",
};

export default function AuditLogsPage() {
  const api = useApiClient();
  const [filters, setFilters] = useState({ entityType: "", action: "", actorId: "", from: "", to: "" });

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => api.get<Log[]>(`/api/v1/hrms/audit-logs?${qs.toString()}`),
  });

  const exportCSV = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/v1/hrms/audit-logs/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": "tenant_dev_001",
        "x-user-id": "user_dev_001",
        "x-user-roles": "hr_admin,auditor",
      },
      body: JSON.stringify({ ...filters, format: "CSV" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logs = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ScrollText className="text-[#22c55e]" />
          <h1 className="text-page-title text-gray-900">Audit Log</h1>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 border border-[var(--border)] px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4 grid grid-cols-5 gap-2">
        <input placeholder="Entity type" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
        <Select
          value={filters.action}
          onChange={(v) => setFilters({ ...filters, action: v })}
          placeholder="All actions"
          options={[{ value: "", label: "All actions" }, ...ACTIONS.map((a) => ({ value: a, label: a }))]}
        />
        <input placeholder="Actor ID" value={filters.actorId} onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={5} /> : logs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Search size={32} className="mx-auto mb-2 text-gray-300" /> No logs match filters
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-table-head uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Timestamp</th>
                <th className="text-left px-4 py-2">Actor</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-4 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l, i) => (
                <tr key={l.id} className="row-stagger hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                  <td className={clsx("px-4 py-2 text-xs", l.actorName && l.actorName !== l.userId ? "text-gray-700" : "font-mono text-gray-500")}>{l.actorName || l.userId}</td>
                  <td className="px-4 py-2">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", actionColors[l.action] ?? "bg-gray-100 text-gray-700")}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium">{l.entityType}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">{l.entityId ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
