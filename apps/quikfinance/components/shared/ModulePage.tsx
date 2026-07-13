"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List as ListIcon, Search, Columns, Clock } from "lucide-react";
import { BentoCard, Metric } from "@/components/design/bento";
import { RecordCard } from "@/components/design/RecordCard";
import { KanbanView, TimelineView } from "@/components/design/views";
import { DataTable } from "@/components/shared/DataTable";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RecordEditDialog } from "@/components/shared/RecordEditDialog";
import { translateModuleMeta, useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import type { ModuleConfig, TableRow, TableValue } from "@/lib/modules";
import { itemPath } from "@/lib/utils/api";

function isTableValue(value: unknown): value is TableValue {
  return ["string", "number", "boolean"].includes(typeof value) || value === null;
}

function normalizeRows(value: unknown, fallback: TableRow[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const rows = value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item, index) => {
      const row: TableRow = { id: typeof item.id === "string" ? item.id : `row-${index}` };
      Object.entries(item).forEach(([key, entry]) => {
        if (isTableValue(entry)) {
          row[key] = entry;
        }
      });
      return row;
    });
  return rows.length > 0 ? rows : fallback;
}

/** Parse a simple CSV (handles quoted fields and escaped quotes) into rows of objects keyed by header. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field); field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field); field = "";
      if (record.some((c) => c.length > 0)) rows.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) { record.push(field); if (record.some((c) => c.length > 0)) rows.push(record); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? "").trim(); });
    return obj;
  });
}

export function ModulePage({ config }: { config: ModuleConfig }) {
  const { locale, t } = useI18n();
  const { format: formatMoney } = useCurrency();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingRow, setEditingRow] = useState<TableRow | null>(null);
  const [view, setView] = useState<"card" | "table" | "kanban" | "timeline">("card");
  const [cardQuery, setCardQuery] = useState("");
  const statusCol = config.columns.find((c) => c.kind === "status");
  const dateCol = config.columns.find((c) => c.kind === "date");

  const meta = translateModuleMeta(locale, config.key, {
    title: config.title,
    description: config.description,
    entityName: config.entityName,
    primaryAction: config.primaryAction
  });

  const { data: rows = config.rows } = useQuery({
    queryKey: ["module", config.key],
    queryFn: async () => {
      const response = await fetch(config.apiPath);
      if (!response.ok) {
        return [] as TableRow[];
      }
      const payload = (await response.json()) as { data?: unknown };
      // A successful response (even an empty list) reflects real data — show it as
      // is. Falling back to the demo rows here was the bug: an empty module showed
      // a placeholder row whose fake id (e.g. "po-1") opened a detail page that
      // 500s on `'po-1'::uuid` and rendered "… not found".
      return normalizeRows(payload.data, []);
    },
    // Use placeholderData (not initialData): the demo rows are shown only while
    // the real records load. initialData is treated as fresh cached data under the
    // global 30s staleTime, which suppressed the mount refetch — so lists kept
    // showing the static demo rows (with non-UUID ids like "ven-1"), and clicking
    // one opened a detail page that 500s on `'ven-1'::uuid` and hangs on "Loading…".
    placeholderData: config.rows
  });

  // Tracked value = sum of document totals in the company's base currency. API
  // payloads serialize numeric columns as strings, so coerce; multiply by the
  // row's exchange_rate (defaults to 1) so multi-currency documents roll up in
  // base currency rather than naively adding foreign face values.
  const total = rows.reduce((sum, row) => {
    const raw = Number(row.total ?? row.amount ?? row.rate ?? row.balance ?? row.current_balance ?? row.outstanding ?? 0) || 0;
    const rate = Number(row.exchange_rate ?? 1) || 1;
    return sum + raw * rate;
  }, 0);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["module", config.key] });

  // Modules with a detail page: the whole row is clickable (no pencil icon).
  // Others fall back to the inline edit dialog via the pencil action.
  const handleRowClick = config.detailBasePath ? (row: TableRow) => router.push(`${config.detailBasePath}/${row.id}`) : undefined;
  const rowHref = config.detailBasePath ? (row: TableRow) => `${config.detailBasePath}/${row.id}` : undefined;
  const handleEdit = config.detailBasePath
    ? undefined
    : config.formFields.length > 0
      ? (row: TableRow) => setEditingRow(row)
      : undefined;

  const handleDelete = async (row: TableRow) => {
    if (!window.confirm(t("common.confirmDelete", "Delete this {entity}? This cannot be undone.", { entity: meta.entityName }))) {
      return;
    }
    setBusyRowId(row.id);
    try {
      const response = await fetch(itemPath(config.apiPath, row.id), { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Delete failed");
      }
      toast.success(t("common.deleted", "{entity} deleted.", { entity: meta.entityName }));
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyRowId(null);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      const response = await fetch(itemPath(config.apiPath, id), { method: "DELETE" });
      if (response.ok) ok += 1;
      else failed += 1;
    }
    await refetch();
    toast.success(t("common.bulkDeleted", "Deleted {ok} records ({failed} failed).", { ok, failed }));
  };

  const handleImport = async (csvText: string) => {
    const records = parseCsv(csvText);
    if (records.length === 0) {
      toast.error(t("common.importEmpty", "No rows found in the CSV file."));
      return;
    }
    // Map CSV headers (label or key) to column keys.
    const keyByHeader = new Map<string, string>();
    config.columns.forEach((column) => {
      keyByHeader.set(column.label.toLowerCase(), column.key);
      keyByHeader.set(column.key.toLowerCase(), column.key);
    });

    setImporting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const record of records) {
        const payload: Record<string, string> = {};
        Object.entries(record).forEach(([header, value]) => {
          const key = keyByHeader.get(header.toLowerCase()) ?? header;
          if (value !== "") payload[key] = value;
        });
        const response = await fetch(config.apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) ok += 1;
        else failed += 1;
      }
      await refetch();
      toast.success(t("common.importResult", "Imported {ok} rows ({failed} skipped).", { ok, failed }));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={meta.title} description={meta.description} actionLabel={meta.primaryAction} actionHref={config.newPath} secondaryActions={config.secondaryActions} />
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <BentoCard interactive={false}>
          <Metric label={t("common.records", "Records")} value={String(rows.length)} />
        </BentoCard>
        <BentoCard interactive={false}>
          <Metric label={t("common.trackedValue", "Tracked value")} value={formatMoney(total)} />
        </BentoCard>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            {view === "card" ? (
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder={`Search ${meta.title.toLowerCase()}`}
                  className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ) : <span />}
            <div className="inline-flex shrink-0 rounded-xl border bg-card p-0.5 shadow-card">
              {([
                ["card", LayoutGrid],
                ["table", ListIcon],
                ...(statusCol ? [["kanban", Columns] as const] : []),
                ...(dateCol ? [["timeline", Clock] as const] : [])
              ] as const).map(([v, Icon]) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium capitalize transition", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" />{v}
                </button>
              ))}
            </div>
          </div>
          {view === "card" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows
                .filter((r) => !cardQuery || Object.values(r).some((val) => String(val ?? "").toLowerCase().includes(cardQuery.toLowerCase())))
                .map((row) => (
                  <RecordCard key={row.id} columns={config.columns} row={row} href={rowHref ? rowHref(row) : null} onClick={handleEdit ? () => handleEdit(row) : undefined} />
                ))}
            </div>
          ) : view === "kanban" && statusCol ? (
            <KanbanView columns={config.columns} rows={rows} statusKey={statusCol.key} rowHref={rowHref} onCardClick={handleEdit} />
          ) : view === "timeline" && dateCol ? (
            <TimelineView columns={config.columns} rows={rows} dateKey={dateCol.key} rowHref={rowHref} onCardClick={handleEdit} />
          ) : (
            <DataTable
              columns={config.columns}
              rows={rows}
              title={meta.title}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}
              onRowClick={handleRowClick}
              rowHref={rowHref}
              onImport={importing ? undefined : handleImport}
              busyRowId={busyRowId}
            />
          )}
        </div>
      ) : (
        <EmptyState
          title={`No ${meta.title.toLowerCase()} yet`}
          description={`Create your first ${meta.entityName} or import existing records from CSV.`}
          actionLabel={meta.primaryAction}
          actionHref={config.newPath}
        />
      )}
      {editingRow ? (
        <RecordEditDialog
          config={config}
          row={editingRow}
          entityName={meta.entityName}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}
