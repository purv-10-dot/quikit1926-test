"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@quikit/ui";
import { FileClock } from "lucide-react";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { Pager } from "@/components/Pager";

interface Log { id: string; timestamp: string; userId: string; action: string; entityType: string; entityId: string; changes: Record<string, unknown> | null; }

const ACTION_COLOR: Record<string, string> = {
  create: "bg-blue-100 text-blue-700", update: "bg-amber-100 text-amber-700",
  delete: "bg-red-100 text-red-700", approve: "bg-green-100 text-green-700",
  reject: "bg-red-100 text-red-700", post: "bg-blue-100 text-blue-700",
  finalize: "bg-green-100 text-green-700", status_change: "bg-gray-100 text-gray-700",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit?page=${page}&pageSize=${pageSize}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setLogs(j.data);
          setTotal(j.total ?? j.data.length);
        }
        setLoading(false);
      });
  }, [page, pageSize]);

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Audit Log</h1>
      <p className="text-sm text-gray-500 mb-4">Recent state-changing actions. Currently wired on: RAB approve, Bill approve, Payroll finalize, Credit/Debit note create &amp; delete. Other write endpoints can opt-in via <code className="bg-gray-100 px-1 rounded text-xs">logAudit()</code>.</p>
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : logs.length === 0 ? (
        <EmptyState icon={FileClock} title="No audit events" message="Perform an approve/finalize action elsewhere to populate this log." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">When</th><th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Action</th><th className="text-left px-3 py-2">Entity</th>
              <th className="text-left px-3 py-2">Ref / Id</th><th className="text-left px-3 py-2">Diff</th>
            </tr></thead>
            <tbody>{logs.map(l => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDateTimeIST(l.timestamp)}</td>
                <td className="px-3 py-2 text-xs">{l.userId}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${ACTION_COLOR[l.action] ?? "bg-gray-100 text-gray-700"}`}>{l.action}</span></td>
                <td className="px-3 py-2 text-xs">{l.entityType}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{l.entityId.slice(0, 12)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {l.changes ? (
                    <span>{JSON.stringify(l.changes)}</span>
                  ) : "—"}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {total > 0 && (
            <Pager
              variant="footer"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
