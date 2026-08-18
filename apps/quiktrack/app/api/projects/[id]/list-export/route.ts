import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  getActiveFieldsForProject,
  getValuesForIssues,
} from "@/lib/services/customFieldValues";
import type { FieldValue } from "@/lib/customFields/registry";
import { customFiltersToWhere, parseCustomFilters } from "@/lib/customFields/filterQuery";

/**
 * List export — streams every issue matching the List view's current filters as
 * a CSV (or Excel-flavoured CSV with a UTF-8 BOM). Deliberately unpaginated: the
 * whole filtered set is exported, not just the on-screen page. Filter handling
 * mirrors GET /api/issues so "export current list" matches what's on screen.
 *
 * `fields=all` (default) exports the core columns + Description + one column per
 * active custom field. `fields=visible` exports only the columns the client
 * says are currently visible (`columns=` comma list), falling back to a sane
 * default visible set.
 */

// ── CSV serialization (server-safe — no window/document, unlike csv-utils.ts) ──

/** RFC4180 cell escaping: wrap in quotes when the value has a quote/comma/CR/LF. */
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/**
 * Descriptions are stored as TipTap rich-text HTML. For a spreadsheet cell we
 * want readable plain text, not raw markup, so strip tags + decode the common
 * entities. Images / file-attachment anchors become a short `[image]` /
 * `[attachment]` marker instead of dumping their src/href. Block-level tags
 * become spaces so words don't run together; whitespace is collapsed.
 */
function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  // Embedded media → readable markers (before the generic tag strip).
  s = s.replace(/<img\b[^>]*>/gi, " [image] ");
  s = s.replace(/<a\b[^>]*data-file-name[^>]*>.*?<\/a>/gis, " [attachment] ");
  // Block elements → line/space break so text doesn't concatenate.
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, " ");
  // Drop all remaining tags.
  s = s.replace(/<[^>]+>/g, "");
  // Decode the handful of entities TipTap/sanitizer emit.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  // Collapse whitespace.
  return s.replace(/\s+/g, " ").trim();
}

// ── Column model ───────────────────────────────────────────────────────────

// The List view's canonical column keys (mirrors list-columns.tsx COLUMN_DEFS).
// `description` is not a List column but is exportable; custom fields append as
// `cf:<fieldId>` keys resolved at request time.
const CORE_COLUMN_LABELS: Record<string, string> = {
  key: "Key",
  title: "Work item",
  type: "Type",
  assigneeId: "Assignee",
  reporterId: "Reporter",
  priority: "Priority",
  storyPoints: "Story Points",
  eta: "ETA (h)",
  statusId: "Status",
  resolution: "Resolution",
  dueDate: "Due",
  startDate: "Start",
  createdAt: "Created",
  updatedAt: "Updated",
  description: "Description",
};

// Fallback visible set when `fields=visible` is requested without a `columns=`
// list — the List view's default-on columns.
const DEFAULT_VISIBLE_COLUMNS = [
  "key",
  "title",
  "type",
  "assigneeId",
  "priority",
  "statusId",
  "dueDate",
];

// Full ordered set for `fields=all` (custom fields + description appended after).
const ALL_CORE_COLUMNS = [
  "key",
  "title",
  "type",
  "assigneeId",
  "reporterId",
  "priority",
  "storyPoints",
  "eta",
  "statusId",
  "resolution",
  "dueDate",
  "startDate",
  "createdAt",
  "updatedAt",
  "description",
];

type ExportIssue = {
  id: string;
  key: string;
  title: string;
  type: string;
  statusId: string;
  priority: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  storyPoints: number | null;
  eta: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  description: string | null;
  status: { name: string; category: string } | null;
};

function userLabel(
  u: { firstName: string | null; lastName: string | null; email: string } | undefined,
): string {
  if (!u) return "";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Flatten a custom field value into a single CSV cell. */
function fmtFieldValue(v: FieldValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }, req) => {
    try {
      const url = new URL(req.url);

      // Project key for the filename.
      const project = await db.qtProject.findFirst({
        where: { id: projectId, orgId },
        select: { projectKey: true },
      });
      const projectKey = project?.projectKey ?? "export";

      // ── Filters (mirror GET /api/issues where-building) ───────────────────
      const filterType = url.searchParams.get("type");
      const filterStatusId = url.searchParams.get("statusId");
      const filterPriority = url.searchParams.get("priority");
      const filterAssigneeId = url.searchParams.get("assigneeId");
      // /api/issues reads the search term from `search`; the List view sends `q`
      // in its URL but `search` to the API. Accept both here so either matches.
      const search =
        url.searchParams.get("search")?.trim() || url.searchParams.get("q")?.trim() || "";
      const customFilters = parseCustomFilters(url.searchParams.get("customFilters"));
      const customFilterWhere = customFiltersToWhere(customFilters);

      // assigneeId supports the same four shapes as /api/issues.
      const assigneeClause: Prisma.QtIssueWhereInput | null = (() => {
        if (!filterAssigneeId) return null;
        const parts = filterAssigneeId.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) return null;
        const wantsUnassigned = parts.includes("null");
        const ids = parts.filter((p) => p !== "null");
        if (wantsUnassigned && ids.length)
          return { OR: [{ assigneeId: null }, { assigneeId: { in: ids } }] };
        if (wantsUnassigned) return { assigneeId: null };
        if (ids.length === 1) return { assigneeId: ids[0] };
        return { assigneeId: { in: ids } };
      })();

      const where: Prisma.QtIssueWhereInput = {
        orgId,
        projectId,
        isDeleted: false,
        ...(filterType ? { type: filterType } : {}),
        ...(filterStatusId ? { statusId: filterStatusId } : {}),
        ...(filterPriority ? { priority: filterPriority } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { description: { contains: search, mode: "insensitive" as const } },
                { key: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(customFilterWhere.length || assigneeClause
          ? { AND: [...customFilterWhere, ...(assigneeClause ? [assigneeClause] : [])] }
          : {}),
      };

      // ── Fetch ALL matching issues (no pagination) ─────────────────────────
      const issues = (await db.qtIssue.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          key: true,
          title: true,
          type: true,
          statusId: true,
          priority: true,
          assigneeId: true,
          reporterId: true,
          storyPoints: true,
          eta: true,
          startDate: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          description: true,
          status: { select: { name: true, category: true } },
        },
      })) as ExportIssue[];

      // ── Resolve which columns to emit ─────────────────────────────────────
      const fieldsMode = url.searchParams.get("fields") === "visible" ? "visible" : "all";
      const format = url.searchParams.get("format") === "excel" ? "excel" : "csv";

      // Active custom field defs for this project (used for 'all', and to label
      // any cf:<id> the client passes in a visible-columns list).
      const customFields =
        fieldsMode === "all"
          ? await getActiveFieldsForProject(orgId, projectId)
          : [];
      const customFieldById = new Map(customFields.map((f) => [f.id, f]));

      // Ordered list of column keys to render. Core keys stay as-is; custom
      // fields are `cf:<fieldId>`.
      let columnKeys: string[];
      if (fieldsMode === "visible") {
        const raw = url.searchParams.get("columns");
        const requested = raw
          ? raw.split(",").map((s) => s.trim()).filter(Boolean)
          : DEFAULT_VISIBLE_COLUMNS;
        // Keep only keys we can render: known core columns or cf:<id> whose
        // field is active in this project.
        columnKeys = requested.filter((k) => {
          if (k.startsWith("cf:")) return true; // resolved below via defs lookup
          return k in CORE_COLUMN_LABELS;
        });
        if (columnKeys.length === 0) columnKeys = [...DEFAULT_VISIBLE_COLUMNS];
      } else {
        columnKeys = [
          ...ALL_CORE_COLUMNS,
          ...customFields.map((f) => `cf:${f.id}`),
        ];
      }

      // For 'visible' mode, any cf:<id> columns require their defs too, so load
      // the active field set (once) if the visible column list references any.
      let visibleFieldById = customFieldById;
      if (fieldsMode === "visible" && columnKeys.some((k) => k.startsWith("cf:"))) {
        const defs = await getActiveFieldsForProject(orgId, projectId);
        visibleFieldById = new Map(defs.map((f) => [f.id, f]));
      }
      const fieldById =
        fieldsMode === "all" ? customFieldById : visibleFieldById;

      // ── Look up related labels (statuses embedded, users + custom values) ──
      const issueIds = issues.map((i) => i.id);
      const userIds = Array.from(
        new Set(
          issues
            .flatMap((i) => [i.assigneeId, i.reporterId])
            .filter((x): x is string => Boolean(x)),
        ),
      );
      const needsCustomValues = columnKeys.some((k) => k.startsWith("cf:"));

      const [users, valuesByIssue] = await Promise.all([
        userIds.length
          ? db.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, firstName: true, lastName: true, email: true },
            })
          : Promise.resolve([]),
        needsCustomValues && issueIds.length
          ? getValuesForIssues(orgId, issueIds)
          : Promise.resolve({} as Record<string, Record<string, FieldValue>>),
      ]);
      const userMap = new Map(users.map((u) => [u.id, u]));

      // ── Build rows ────────────────────────────────────────────────────────
      const header = columnKeys.map((k) => {
        if (k.startsWith("cf:")) {
          const id = k.slice(3);
          return fieldById.get(id)?.name ?? id;
        }
        return CORE_COLUMN_LABELS[k] ?? k;
      });

      const cell = (issue: ExportIssue, key: string): string => {
        if (key.startsWith("cf:")) {
          const id = key.slice(3);
          return fmtFieldValue(valuesByIssue[issue.id]?.[id]);
        }
        switch (key) {
          case "key":
            return issue.key;
          case "title":
            return issue.title;
          case "type":
            return issue.type;
          case "assigneeId":
            return issue.assigneeId ? userLabel(userMap.get(issue.assigneeId)) : "";
          case "reporterId":
            return issue.reporterId ? userLabel(userMap.get(issue.reporterId)) : "";
          case "priority":
            return issue.priority ?? "";
          case "storyPoints":
            return issue.storyPoints === null ? "" : String(issue.storyPoints);
          case "eta":
            return issue.eta === null ? "" : String(issue.eta);
          case "statusId":
            return issue.status?.name ?? "";
          case "resolution":
            return issue.status?.category === "DONE" ? "Done" : "Unresolved";
          case "dueDate":
            return fmtDate(issue.dueDate);
          case "startDate":
            return fmtDate(issue.startDate);
          case "createdAt":
            return fmtDate(issue.createdAt);
          case "updatedAt":
            return fmtDate(issue.updatedAt);
          case "description":
            return htmlToText(issue.description);
          default:
            return "";
        }
      };

      const rows: string[][] = [header];
      for (const issue of issues) {
        rows.push(columnKeys.map((k) => cell(issue, k)));
      }

      const body = toCsv(rows);
      // Excel needs a UTF-8 BOM to detect the encoding and render accented /
      // non-ASCII characters correctly. Plain 'csv' omits it.
      const BOM = String.fromCharCode(0xfeff);
      const payload = format === "excel" ? `${BOM}${body}` : body;

      const date = new Date().toISOString().slice(0, 10);
      const filename = `quiktrack-${projectKey}-export-${date}.csv`;

      // A file download, not JSON — return the raw body with download headers
      // (NextResponse extends the web Response, satisfying the wrapper's type).
      return new NextResponse(payload, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Export failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
