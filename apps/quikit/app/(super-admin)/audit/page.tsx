"use client";

/**
 * Super Admin: Audit Log — /audit
 *
 * Filterable, paginated audit log viewer for platform-wide actions.
 * Tracks all create/update/suspend/disable/membership/OAuth operations.
 */

import { useState, useEffect, useCallback } from "react";
import { FileText, Filter } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  tenantId: string | null;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "suspend", label: "Suspend" },
  { value: "disable", label: "Disable" },
  { value: "add_member", label: "Add Member" },
  { value: "toggle_super_admin", label: "Toggle Super Admin" },
  { value: "rotate_secret", label: "Rotate Secret" },
];

const ENTITY_OPTIONS = [
  { value: "", label: "All Entities" },
  { value: "tenant", label: "Tenant" },
  { value: "app", label: "App" },
  { value: "user", label: "User" },
  { value: "membership", label: "Membership" },
  { value: "oauth_client", label: "OAuth Client" },
];

const actionBadgeStyles: Record<string, string> = {
  create: "bg-green-50 text-green-700",
  update: "bg-blue-50 text-blue-700",
  suspend: "bg-red-50 text-red-700",
  disable: "bg-gray-100 text-gray-600",
  add_member: "bg-purple-50 text-purple-700",
  toggle_super_admin: "bg-amber-50 text-amber-700",
  rotate_secret: "bg-indigo-50 text-indigo-700",
};

function ActionBadge({ action }: { action: string }) {
  const style = actionBadgeStyles[action] || "bg-gray-100 text-gray-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function truncateId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);
    if (dateFrom) params.set("startDate", dateFrom);
    if (dateTo) params.set("endDate", dateTo);

    fetch(`/api/super/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setLogs(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionFilter, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  const selectCls =
    "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
  const dateCls =
    "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40";

  return (
    <div>
      {/* Page header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500">
          Track all platform-wide administrative actions
        </p>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className={selectCls}
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className={selectCls}
        >
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={dateCls}
          />
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={dateCls}
          />
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No audit entries found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Date/Time
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Action
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Entity Type
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Entity ID
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Actor ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50/60 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">
                      {entry.entityType.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500" title={entry.entityId}>
                        {truncateId(entry.entityId)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500" title={entry.actorId}>
                        {truncateId(entry.actorId)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">
                  Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-xs text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
