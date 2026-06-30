"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns, Download, Pencil, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxCell } from "@/components/shared/Selection";
import { SearchBar } from "@/components/shared/SearchBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import type { DataColumn, TableRow, TableValue } from "@/lib/modules";
import { cn } from "@/lib/utils/cn";

function renderValue(value: TableValue, column: DataColumn, currency: string) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (column.kind === "money") {
    // API payloads serialize numeric/decimal columns as strings — coerce so
    // money columns format consistently whether fed by the API or demo rows.
    const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : null;
    if (amount !== null) {
      return formatMoney(amount, currency);
    }
  }
  if (column.kind === "date" && (typeof value === "string" || typeof value === "number") && String(value).trim() !== "") {
    // API payloads serialize date/timestamp columns as ISO strings — render the
    // calendar date (YYYY-MM-DD) rather than the raw timestamp.
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? String(value) : dt.toISOString().slice(0, 10);
  }
  if (column.kind === "status" && typeof value === "string") {
    return <StatusBadge status={value} />;
  }
  if (column.kind === "boolean" && typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function compareValues(a: TableValue, b: TableValue) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function csvEscape(value: TableValue) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export type DataTableProps = {
  columns: DataColumn[];
  rows: TableRow[];
  title: string;
  /** When provided, renders an Edit action per row. */
  onEdit?: (row: TableRow) => void;
  /** When provided, renders a Delete action per row. */
  onDelete?: (row: TableRow) => void;
  /** When provided, renders an Import button that hands back the chosen file's text. */
  onImport?: (csvText: string, fileName: string) => void;
  /** When provided, renders a "Delete selected" action in the selection bar. */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /** When provided, clicking anywhere on a row (except controls) navigates via this handler. */
  onRowClick?: (row: TableRow) => void;
  /** When provided, the first column renders as a hyperlink to this destination, signalling the row is clickable. */
  rowHref?: (row: TableRow) => string | null;
  busyRowId?: string | null;
};

export function DataTable({ columns, rows, title, onEdit, onDelete, onImport, onBulkDelete, onRowClick, rowHref, busyRowId }: DataTableProps) {
  const { t } = useI18n();
  const { currency } = useCurrency();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "id");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const runBulkDelete = async () => {
    if (!onBulkDelete || selected.length === 0) {
      return;
    }
    if (!window.confirm(t("common.confirmBulkDelete", "Delete {count} selected records? This cannot be undone.", { count: selected.length }))) {
      return;
    }
    setBulkBusy(true);
    try {
      await onBulkDelete(selected);
      setSelected([]);
    } finally {
      setBulkBusy(false);
    }
  };

  const hasRowActions = Boolean(onEdit || onDelete);
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(column.key));

  const filteredRows = useMemo(() => {
    const lowered = search.toLowerCase();
    return rows
      .filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(lowered)))
      .sort((a, b) => {
        const result = compareValues(a[sortKey], b[sortKey]);
        return direction === "asc" ? result : -result;
      });
  }, [rows, search, sortKey, direction]);

  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const header = visibleColumns.map((column) => csvEscape(column.label)).join(",");
    const body = filteredRows.map((row) => visibleColumns.map((column) => csvEscape(row[column.key])).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImport) {
      const text = await file.text();
      onImport(text, file.name);
    }
    event.target.value = "";
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setDirection(direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setDirection("asc");
  };

  const toggleColumn = (key: string) => {
    setHiddenColumns((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.includes(row.id));

  return (
    <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card">
      <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`} />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Rows per page"
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {t("common.rows", "{count} rows", { count: size })}
              </option>
            ))}
          </select>

          {onImport ? (
            <>
              <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
              <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {t("common.import", "Import")}
              </Button>
            </>
          ) : null}

          <Button variant="secondary" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t("common.export", "Export")}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost">
                <Columns className="mr-2 h-4 w-4" />
                {t("common.columns", "Columns")}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 max-h-80 overflow-y-auto rounded-lg border bg-card p-1 shadow-soft"
              >
                <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  {t("common.toggleColumns", "Toggle columns")}
                </DropdownMenu.Label>
                {columns.map((column) => (
                  <DropdownMenu.CheckboxItem
                    key={column.key}
                    checked={!hiddenColumns.includes(column.key)}
                    onCheckedChange={() => toggleColumn(column.key)}
                    onSelect={(event) => event.preventDefault()}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={!hiddenColumns.includes(column.key)}
                      className="h-4 w-4 rounded border-input accent-sky-600"
                    />
                    {column.label}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      {selected.length > 0 ? (
        <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2 text-sm font-medium">
          <span>{t("common.selectedBulk", "{count} selected for bulk actions", { count: selected.length })}</span>
          {onBulkDelete ? (
            <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={runBulkDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("common.deleteSelected", "Delete selected")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card/95 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-12 px-4 py-2.5 text-left">
                <CheckboxCell
                  checked={allPageSelected}
                  onChange={(checked) => {
                    const ids = pageRows.map((row) => row.id);
                    setSelected((current) => (checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id))));
                  }}
                />
              </th>
              {visibleColumns.map((column) => (
                <th key={column.key} className={cn("px-4 py-2.5", column.align === "right" ? "text-right" : "text-left")}>
                  <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 font-semibold">
                    {column.label}
                    {sortKey === column.key ? (
                      direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
              {hasRowActions ? <th className="px-4 py-2.5 text-right">{t("common.actions", "Actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                className={cn("border-t border-border/40 transition-colors hover:bg-indigo-50/40", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
                  <CheckboxCell
                    checked={selected.includes(row.id)}
                    onChange={(checked) =>
                      setSelected((current) => (checked ? [...current, row.id] : current.filter((id) => id !== row.id)))
                    }
                  />
                </td>
                {visibleColumns.map((column, colIndex) => {
                  const content = renderValue(row[column.key], column, currency);
                  const href = colIndex === 0 ? rowHref?.(row) ?? null : null;
                  return (
                    <td key={column.key} className={cn("max-w-[280px] truncate px-4 py-3.5", column.align === "right" ? "text-right tabular-nums" : "text-left")}>
                      {href ? (
                        <Link href={href} onClick={(event) => event.stopPropagation()} className="font-medium text-primary hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
                {hasRowActions ? (
                  <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {onEdit ? (
                        <Button variant="ghost" size="sm" aria-label={t("common.edit", "Edit")} onClick={() => onEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t("common.delete", "Delete")}
                          disabled={busyRowId === row.id}
                          onClick={() => onDelete(row)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t p-4 text-sm text-muted-foreground">
        <span>
          {t("common.pageOf", "Page {page} of {total}", { page, total: totalPages })}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
            {t("common.previous", "Previous")}
          </Button>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
            {t("common.next", "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
