"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Select, Pagination } from "@quikit/ui";
import { formatRelativeDate, formatDate } from "@/lib/utils";
import { Loader2, ShieldCheck } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: { id: string; firstName: string; lastName: string; email: string };
  actorRole: string | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  changes: string[];
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "INVITED", label: "Invited" },
  { value: "RESENT", label: "Resent" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ACCEPTED", label: "Accepted" },
];

const ENTITY_OPTIONS = [
  { value: "", label: "All entities" },
  { value: "Membership", label: "Membership" },
  { value: "Invitation", label: "Invitation" },
  { value: "User", label: "User" },
  { value: "Tenant", label: "Tenant" },
];

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
  INVITED: "bg-blue-100 text-blue-700",
  RESENT: "bg-indigo-100 text-indigo-700",
  REVOKED: "bg-red-100 text-red-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: "50",
    });
    if (action) qs.set("action", action);
    if (entityType) qs.set("entityType", entityType);
    const res = await fetch(`/api/audit?${qs.toString()}`);
    const json = await res.json();
    if (json.success) {
      setRows(json.data);
      setTotalPages(json.meta.totalPages);
      setTotal(json.meta.total);
    }
    setLoading(false);
  }, [action, entityType, page]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Audit Log
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            All sensitive actions taken in this organisation. Read-only.
          </p>
        </div>
        <span className="text-xs text-[var(--color-text-tertiary)] mt-2">
          {total.toLocaleString()} total events
        </span>
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            options={ACTION_OPTIONS}
          />
          <Select
            label="Entity"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            options={ENTITY_OPTIONS}
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] italic text-center py-12">
            No audit events match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    >
                      <td className="py-2 pr-4 text-[var(--color-text-primary)]" title={formatDate(r.createdAt)}>
                        {formatRelativeDate(r.createdAt)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGE[r.action] || "bg-gray-100 text-gray-700"}`}
                        >
                          {r.action}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-text-primary)]">
                        {r.entityType}
                        <span className="text-[var(--color-text-tertiary)]"> · {r.entityId.slice(0, 8)}</span>
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-text-primary)]">
                        {r.actor.firstName || r.actor.lastName ? (
                          `${r.actor.firstName} ${r.actor.lastName}`.trim()
                        ) : (
                          <span className="text-[var(--color-text-tertiary)]">{r.actor.email || r.actor.id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-text-tertiary)] text-xs">
                        {r.ipAddress || "—"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-text-tertiary)] text-xs">
                        {expanded === r.id ? "▾" : "▸"}
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-[var(--color-bg-secondary)]">
                        <td colSpan={6} className="py-3 px-4">
                          <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
                            <div><strong>Entity ID:</strong> <code>{r.entityId}</code></div>
                            <div><strong>Actor:</strong> {r.actor.email || r.actor.id} ({r.actorRole || "n/a"})</div>
                            {r.userAgent && <div><strong>User-Agent:</strong> <span className="break-all">{r.userAgent}</span></div>}
                            {r.changes.length > 0 && <div><strong>Changed fields:</strong> {r.changes.join(", ")}</div>}
                            {r.oldValues && (
                              <div>
                                <strong>Old:</strong>
                                <pre className="mt-1 p-2 bg-[var(--color-bg-primary)] rounded text-[11px] overflow-x-auto">{r.oldValues}</pre>
                              </div>
                            )}
                            {r.newValues && (
                              <div>
                                <strong>New:</strong>
                                <pre className="mt-1 p-2 bg-[var(--color-bg-primary)] rounded text-[11px] overflow-x-auto">{r.newValues}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination page={page} totalPages={totalPages} total={total} limit={50} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
