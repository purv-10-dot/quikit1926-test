"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { Pagination } from "@/components/reports/pagination";
import { ReportsEmptyState } from "@/components/reports/empty-state";
import { SkeletonList } from "@/components/skeleton";
import { AuditLogToolbar } from "./audit-log-toolbar";

interface Actor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar?: string | null;
}

interface AuditLogEntry {
  id: string;
  createdAt: string;
  actor: Actor | null;
  actorType: string;
  projectId: string | null;
  tool: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityKey: string | null;
  payload: unknown;
  before: unknown;
  after: unknown;
  result: "success" | "error";
  errorMessage: string | null;
}

function actorName(a: Actor | null): string {
  if (!a) return "Unknown";
  const fn = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return fn || a.email;
}

function actorInitials(a: Actor | null): string {
  if (!a) return "?";
  const f = (a.firstName ?? "").trim();
  const l = (a.lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  return (a.email?.charAt(0) ?? "?").toUpperCase();
}

function actorColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

/** Diffs two field-snapshot objects, returning only the keys that changed. */
function diffFields(
  before: unknown,
  after: unknown,
): { field: string; oldValue: string; newValue: string }[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || typeof a !== "object") return [];
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({
      field: k,
      oldValue: b[k] === undefined || b[k] === null ? "None" : String(b[k]),
      newValue: a[k] === undefined || a[k] === null ? "None" : String(a[k]),
    }));
}

export function AuditLogView() {
  const [tool, setTool] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["mcp-audit-log", { tool, entityType, action, from, to, page, pageSize }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (tool) params.set("tool", tool);
      if (entityType) params.set("entityType", entityType);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/mcp-audit-log?${params.toString()}`, { signal });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed");
      return j.data as {
        entries: AuditLogEntry[];
        facets: { tools: string[]; entityTypes: string[]; actions: string[] };
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const entries = query.data?.entries ?? [];
  const totalRows = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;
  const isInitialLoading = query.isLoading && !query.data;
  const isRefetching = query.isFetching && !!query.data;
  const facets = query.data?.facets ?? { tools: [], entityTypes: [], actions: [] };

  const toolOptions = useMemo(
    () => facets.tools.map((t) => ({ value: t, label: t })),
    [facets.tools],
  );
  const entityTypeOptions = useMemo(
    () => facets.entityTypes.map((t) => ({ value: t, label: t })),
    [facets.entityTypes],
  );
  const actionOptions = useMemo(
    () => facets.actions.map((t) => ({ value: t, label: t })),
    [facets.actions],
  );

  useEffect(() => {
    setPage(1);
  }, [tool, entityType, action, from, to, pageSize]);

  function clearFilters() {
    setTool("");
    setEntityType("");
    setAction("");
    setFrom("");
    setTo("");
  }

  const filtersActive = !!(tool || entityType || action || from || to);

  return (
    <div className="p-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500">
          Every action the QuikTrack MCP server has taken — who, what, and whether it succeeded.
        </p>
      </header>

      <AuditLogToolbar
        tool={tool}
        onToolChange={setTool}
        toolOptions={toolOptions}
        entityType={entityType}
        onEntityTypeChange={setEntityType}
        entityTypeOptions={entityTypeOptions}
        action={action}
        onActionChange={setAction}
        actionOptions={actionOptions}
        from={from}
        onFromChange={setFrom}
        to={to}
        onToChange={setTo}
        onClear={clearFilters}
        filtersActive={filtersActive}
      />

      <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {isRefetching && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-100 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-blue-500 qt-progress-slide" />
          </div>
        )}
        {isInitialLoading ? (
          <div className="p-4">
            <SkeletonList rows={6} withAvatar />
          </div>
        ) : entries.length === 0 ? (
          <ReportsEmptyState
            title="No MCP activity yet."
            hint="Actions taken by the MCP server will show up here."
          />
        ) : (
          <div className={isRefetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {entries.map((e) => (
              <AuditLogRow
                key={e.id}
                entry={e}
                expanded={expandedId === e.id}
                onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
              />
            ))}
          </div>
        )}
        {entries.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalRows}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
}

function AuditLogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const diff = diffFields(entry.before, entry.after);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        <span
          className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
          style={{ background: actorColor(entry.actor?.id ?? entry.id) }}
        >
          {actorInitials(entry.actor)}
        </span>
        <span className="text-xs font-medium text-gray-900 truncate min-w-[120px]">
          {actorName(entry.actor)}
        </span>
        <span className="text-xs text-gray-500 font-mono">{entry.tool}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
          {entry.action}
        </span>
        <span className="text-xs text-gray-700 truncate">
          {entry.entityKey ?? entry.entityType}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] shrink-0">
          {entry.result === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className="text-gray-400">
            {new Date(entry.createdAt).toLocaleString()}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="px-11 pb-3 space-y-2">
          {entry.result === "error" && entry.errorMessage && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
              {entry.errorMessage}
            </div>
          )}
          {diff.length > 0 && (
            <div className="space-y-1.5">
              {diff.map((d) => (
                <div key={d.field} className="text-xs text-gray-700 inline-flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-500">{d.field}</span>
                  <span className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px]">{d.oldValue}</span>
                  <span className="text-gray-400">→</span>
                  <span className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px]">{d.newValue}</span>
                </div>
              ))}
            </div>
          )}
          {entry.payload != null && (
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer select-none">Request payload</summary>
              <pre className="mt-1 bg-gray-50 rounded p-2 overflow-x-auto">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
