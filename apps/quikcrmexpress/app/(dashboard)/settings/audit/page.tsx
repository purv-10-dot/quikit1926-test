"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface AuditEntry {
  id: string;
  userId: string | null;
  module: string;
  action: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (moduleFilter) params.set("module", moduleFilter);
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/settings/audit?${params.toString()}`, { credentials: "include" });
      const j = await res.json();
      setItems(Array.isArray(j?.items) ? j.items : []);
      setTotal(j?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, moduleFilter, actionFilter]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-crm-text">Audit Log</h1>
        <p className="text-sm text-crm-muted">{total.toLocaleString()} entries · all settings changes are recorded.</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by module (users, permission_templates, …)"
          value={moduleFilter}
          onChange={(e) => {
            setModuleFilter(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        >
          <option value="">All actions</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
          <option value="reset_password">reset_password</option>
          <option value="add_members">add_members</option>
          <option value="add_accounts">add_accounts</option>
          <option value="remove_member">remove_member</option>
          <option value="remove_account">remove_account</option>
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-crm-muted">No entries match.</p>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Module</TH>
                    <TH>Action</TH>
                    <TH>Resource</TH>
                    <TH>Actor</TH>
                    <TH className="text-right">Details</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((e) => (
                    <>
                      <TR key={e.id}>
                        <TD className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</TD>
                        <TD className="font-medium">{e.module}</TD>
                        <TD>
                          <span
                            className={
                              "rounded px-2 py-0.5 text-xs " +
                              (e.action === "delete"
                                ? "bg-red-50 text-red-700"
                                : e.action === "create"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-crm-blue-soft text-crm-blue-dark")
                            }
                          >
                            {e.action}
                          </span>
                        </TD>
                        <TD className="font-mono text-xs">{e.resourceId?.slice(0, 8) ?? "—"}…</TD>
                        <TD className="font-mono text-xs">{e.userId?.slice(0, 8) ?? "system"}…</TD>
                        <TD className="text-right">
                          <button
                            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                            className="text-xs text-crm-blue hover:underline"
                          >
                            {expanded === e.id ? "Hide" : "Show"}
                          </button>
                        </TD>
                      </TR>
                      {expanded === e.id && (
                        <TR key={`${e.id}-detail`}>
                          <TD colSpan={6} className="bg-crm-panel">
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <DetailBlock title="Before" value={e.before} />
                              <DetailBlock title="After" value={e.after} />
                              <DetailBlock title="Metadata" value={e.metadata} />
                            </div>
                          </TD>
                        </TR>
                      )}
                    </>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-crm-muted">{title}</div>
      <pre className="overflow-x-auto rounded border border-crm-border bg-white p-2 font-mono">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
