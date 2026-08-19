"use client";

import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Download, FileText, Printer, ChevronDown } from "lucide-react";
import type { ListFilters, ListIssue } from "./list-types";
import { userLabel } from "./list-types";

interface Props {
  projectId: string;
  filters: ListFilters;
  /** Currently-visible column keys, in display order (from resolveColumns). */
  visibleColumnKeys: string[];
  /** The rows currently loaded on screen — used for the client-side PDF/Print. */
  rows: ListIssue[];
}

/**
 * Jira-style Export submenu for the List view. CSV/Excel items hit the server
 * endpoint so the WHOLE current filtered set is exported (not just the on-screen
 * page or the row selection). PDF/Print render the currently-loaded rows client
 * side (jspdf has no autotable here, so PDF draws a simple text list).
 *
 * All items ALWAYS export the current filtered list — row selection is ignored.
 */

/**
 * Mirror the List view's filter → query-param mapping (buildIssuesQuery in
 * list-view.tsx) so "export current list" matches exactly what's on screen.
 * The server endpoint accepts the identical params as GET /api/issues.
 */
function appendFilterParams(p: URLSearchParams, filters: ListFilters): void {
  if (filters.search) p.set("search", filters.search);
  if (filters.statusId) p.set("statusId", filters.statusId);
  if (filters.type) p.set("type", filters.type);
  if (filters.priority) p.set("priority", filters.priority);
  if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
  if (filters.customFilters.length)
    p.set("customFilters", JSON.stringify(filters.customFilters));
}

/** Columns drawn in the PDF / Print output (a readable subset of the row). */
const PRINT_COLUMNS: { key: string; label: string; get: (i: ListIssue) => string }[] = [
  { key: "key", label: "Key", get: (i) => i.key },
  { key: "title", label: "Work item", get: (i) => i.title },
  { key: "type", label: "Type", get: (i) => i.type },
  { key: "statusId", label: "Status", get: (i) => i.status?.name ?? "" },
  { key: "assigneeId", label: "Assignee", get: (i) => (i.assignee ? userLabel(i.assignee) : "") },
  { key: "priority", label: "Priority", get: (i) => i.priority ?? "" },
  { key: "dueDate", label: "Due", get: (i) => (i.dueDate ? i.dueDate.slice(0, 10) : "") },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ExportMenu({ projectId, filters, visibleColumnKeys, rows }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function downloadFromServer(fields: "visible" | "all", format: "csv" | "excel") {
    const p = new URLSearchParams();
    appendFilterParams(p, filters);
    p.set("fields", fields);
    p.set("format", format);
    if (fields === "visible") p.set("columns", visibleColumnKeys.join(","));
    const url = `/api/projects/${projectId}/list-export?${p.toString()}`;
    // Trigger the browser download via a transient anchor.
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const marginX = 40;
    let y = 48;
    doc.setFontSize(14);
    doc.text("QuikTrack — List export", marginX, y);
    doc.setFontSize(9);
    y += 16;
    doc.setTextColor(120);
    doc.text(
      `${rows.length} item${rows.length === 1 ? "" : "s"} · ${new Date().toLocaleString()}`,
      marginX,
      y,
    );
    doc.setTextColor(0);
    y += 20;

    // jspdf has no autotable in this app, so draw a compact text list: one line
    // per row (Key · Title), with the remaining fields on a lighter sub-line.
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineWidth = doc.internal.pageSize.getWidth() - marginX * 2;
    for (const issue of rows) {
      if (y > pageHeight - 48) {
        doc.addPage();
        y = 48;
      }
      doc.setFontSize(10);
      doc.setTextColor(0);
      const head = `${issue.key}  ${issue.title}`;
      for (const line of doc.splitTextToSize(head, lineWidth) as string[]) {
        doc.text(line, marginX, y);
        y += 14;
      }
      doc.setFontSize(8);
      doc.setTextColor(110);
      const meta = PRINT_COLUMNS.slice(2)
        .map((c) => `${c.label}: ${c.get(issue) || "—"}`)
        .join("   ");
      for (const line of doc.splitTextToSize(meta, lineWidth) as string[]) {
        doc.text(line, marginX, y);
        y += 11;
      }
      y += 6;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`quiktrack-export-${stamp}.pdf`);
    setOpen(false);
  }

  function printList() {
    const headCells = PRINT_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const bodyRows = rows
      .map(
        (issue) =>
          `<tr>${PRINT_COLUMNS.map((c) => `<td>${escapeHtml(c.get(issue) || "")}</td>`).join("")}</tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>QuikTrack List</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;}
        h1{font-size:16px;margin:0 0 4px;}
        .meta{color:#666;font-size:12px;margin-bottom:16px;}
        table{border-collapse:collapse;width:100%;font-size:12px;}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}
        th{background:#f3f4f6;font-weight:600;}
        tr:nth-child(even) td{background:#fafafa;}
        @media print{body{margin:0;}}
      </style></head><body>
      <h1>QuikTrack — List export</h1>
      <div class="meta">${rows.length} item${rows.length === 1 ? "" : "s"} · ${escapeHtml(
        new Date().toLocaleString(),
      )}</div>
      <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>
      </body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const idoc = iframe.contentDocument;
    if (!win || !idoc) {
      iframe.remove();
      return;
    }
    idoc.open();
    idoc.write(html);
    idoc.close();
    // Give the iframe a tick to lay out before printing, then clean up.
    const cleanup = () => setTimeout(() => iframe.remove(), 500);
    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 150);
    setOpen(false);
  }

  const itemClass =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Export"
        className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded border border-gray-200 bg-white p-1 shadow-lg">
          <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            CSV
          </div>
          <button type="button" className={itemClass} onClick={() => downloadFromServer("visible", "csv")}>
            <Download className="h-4 w-4 text-gray-400" /> CSV — visible fields
          </button>
          <button type="button" className={itemClass} onClick={() => downloadFromServer("all", "csv")}>
            <Download className="h-4 w-4 text-gray-400" /> CSV — all fields
          </button>
          <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Excel
          </div>
          <button type="button" className={itemClass} onClick={() => downloadFromServer("visible", "excel")}>
            <Download className="h-4 w-4 text-gray-400" /> Excel CSV — visible fields
          </button>
          <button type="button" className={itemClass} onClick={() => downloadFromServer("all", "excel")}>
            <Download className="h-4 w-4 text-gray-400" /> Excel CSV — all fields
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button type="button" className={itemClass} onClick={exportPdf}>
            <FileText className="h-4 w-4 text-gray-400" /> PDF
          </button>
          <button type="button" className={itemClass} onClick={printList}>
            <Printer className="h-4 w-4 text-gray-400" /> Print list
          </button>
        </div>
      )}
    </div>
  );
}
