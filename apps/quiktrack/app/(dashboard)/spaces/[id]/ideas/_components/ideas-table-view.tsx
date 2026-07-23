"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Filter,
  ArrowUpDown,
  SlidersHorizontal,
  Search,
  UserPlus,
  MessageSquare,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  FileDown,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { IdeasTable, type Column } from "./ideas-table";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { FieldEditorPanel } from "./field-editor-panel";
import { AddColumnMenu } from "./add-column-menu";
import { FieldsPanel, type FieldEntry } from "./fields-panel";
import { SortPanel, type SortRule } from "./sort-panel";
import { FilterPanel, type FilterRule } from "./filter-panel";
import { GroupByPanel, type GroupByConfig } from "./group-by-panel";
import { DisplayPanel, type DisplaySettings } from "./display-panel";
import { iconForColumn } from "./field-icons";
import { memberName, type MemberLite } from "./assignee-cell";
import { AddPeopleModal } from "@/components/add-people-modal";
import { ViewAboutPanel } from "./view-about-panel";
import { CreateIdeaModal } from "./create-idea-modal";
import { SPECIAL_COLUMNS, type IdeasBundle, type IdeaRow, type IdeaFieldValue } from "./ideas-types";

interface MembersResponse {
  success: boolean;
  data: { members: { userId: string; user: MemberLite | null }[] };
}

const VIEW_DESCRIPTION =
  "Centralize your ideas. You are in the “All ideas” view, which stores all ideas in this project.";

/** Built-in (non-custom-field) columns offered by the + add-column menu. Their
 *  values come from the idea row / bundle and render read-only in the grid. */
const SYSTEM_COLUMNS: Record<string, string> = {
  key: "Key",
  type: "Type",
  assignee: "Assignee",
  creator: "Creator",
  status: "Status",
  created: "Created",
  updated: "Updated",
};

/** These toggle their INLINE presence in the Summary column (key prefix /
 *  lightbulb) rather than rendering as their own column. */
const INLINE_SUMMARY_KEYS = new Set(["key", "type"]);

/** Column keys hidden from the "+ add column" menu for this discovery view
 *  (fields that don't belong in JPD's picker). Not deleted — just not offered. */
const HIDDEN_COLUMN_KEYS = new Set(["global_field", "watcher", "goals", "status"]);

export function IdeasTableView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const queryKey = ["quiktrack", "ideas", projectId] as const;
  const { data, isLoading } = useApiData<IdeasBundle>(
    queryKey,
    `/api/projects/${projectId}/ideas`,
    { staleTime: 30_000 },
  );

  const [rows, setRows] = useState<IdeaRow[]>([]);
  const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [groupByPanelOpen, setGroupByPanelOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByConfig | null>(null);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [display, setDisplay] = useState<DisplaySettings>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [aboutPanelOpen, setAboutPanelOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("this project");
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"Overview" | "Comments" | "Insights" | "Delivery">("Overview");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editFieldId, setEditFieldId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const openAddRef = useRef<(() => void) | null>(null);

  // Project members for the Assignee picker.
  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json() as Promise<MembersResponse>)
      .then((m) => { if (alive && m.success) setMembers(m.data.members.map((x) => x.user).filter((u): u is MemberLite => !!u)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [projectId]);

  // Project name for the Add-people modal heading — read from the page's
  // breadcrumb (rendered by the space layout) to avoid a dedicated endpoint.
  useEffect(() => {
    const el = document.querySelector("[data-project-name]");
    const name = el?.getAttribute("data-project-name")?.trim();
    if (name) setProjectName(name);
  }, []);

  // The global "+ Create" (header) makes an idea on discovery ideas views;
  // refetch when it fires so the new idea appears.
  useEffect(() => {
    function onCreated() { void qc.invalidateQueries({ queryKey }); }
    window.addEventListener("qt:idea-created", onCreated);
    return () => window.removeEventListener("qt:idea-created", onCreated);
  }, [qc, queryKey]);

  // "Edit field" (from a dropdown's footer) opens the field editor overlay.
  useEffect(() => {
    function onEditField(e: Event) {
      const id = (e as CustomEvent<{ fieldId?: string }>).detail?.fieldId;
      if (id) setEditFieldId(id);
    }
    window.addEventListener("qt:edit-field", onEditField as EventListener);
    return () => window.removeEventListener("qt:edit-field", onEditField as EventListener);
  }, []);

  useEffect(() => { if (data) setRows(data.ideas); }, [data]);
  // Default the active (green-accent) row to the first idea, like JPD.
  useEffect(() => { if (!activeId && rows.length) setActiveId(rows[0].id); }, [rows, activeId]);

  const perms = useMyProjectPermissions(projectId);
  const canSaveForEveryone = perms.loading ? false : perms.has("Project", "update");
  const view = data ? (data.views.find((v) => v.isDefault) ?? data.views[0]) : null;

  // View description (rich-text HTML) from the view config, + a plain-text
  // preview for the header line.
  const viewDescriptionHtml = view?.config?.description ?? "";
  const viewDescriptionText = viewDescriptionHtml.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  async function saveViewDescription(html: string) {
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: html }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  // The saved column set (from the view config) and the current (editable) one.
  // "summary" is always first + sticky; system columns (assignee, created, …) are
  // rendered as read-only cells alongside custom fields / specials.
  const savedKeys = useMemo(
    // key/type are on by default (they show inline in Summary, not as columns).
    () => view?.config?.columns ?? (data ? ["summary", "key", "type", ...data.fields.map((f) => f.key)] : ["summary", "key", "type"]),
    [view, data],
  );
  const [columnKeys, setColumnKeys] = useState<string[]>([]);
  useEffect(() => { setColumnKeys(savedKeys); }, [savedKeys]);
  const dirty = JSON.stringify(columnKeys) !== JSON.stringify(savedKeys);

  // Sort rules come from the saved view config; kept in local state so admins can
  // edit + persist. Non-admins still see the shared sort applied.
  const savedSort = useMemo<SortRule[]>(() => view?.config?.sort ?? [], [view]);
  useEffect(() => { setSortRules(savedSort); }, [savedSort]);

  const savedFilters = useMemo<FilterRule[]>(() => (view?.config?.filters as FilterRule[]) ?? [], [view]);
  useEffect(() => { setFilterRules(savedFilters); }, [savedFilters]);

  const savedGroupBy = useMemo<GroupByConfig | null>(() => view?.config?.groupBy ?? null, [view]);
  useEffect(() => { setGroupBy(savedGroupBy); }, [savedGroupBy]);

  const savedDisplay = useMemo<DisplaySettings>(() => view?.config?.display ?? {}, [view]);
  useEffect(() => { setDisplay(savedDisplay); }, [savedDisplay]);

  // Pinned fields for the idea drawer (from the view config).
  const [pinnedFields, setPinnedFields] = useState<string[]>([]);
  const savedPinned = useMemo<string[] | undefined>(() => view?.config?.pinnedFields, [view]);
  useEffect(() => { setPinnedFields(savedPinned ?? []); }, [savedPinned]);
  async function onTogglePin(key: string) {
    const next = pinnedFields.includes(key) ? pinnedFields.filter((k) => k !== key) : [...pinnedFields, key];
    setPinnedFields(next);
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinnedFields: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  const columns = useMemo<Column[]>(() => {
    if (!data) return [];
    const byKey = new Map(data.fields.map((f) => [f.key, f]));
    return columnKeys
      .map((key): Column | null => {
        // Key/Type never render as their own column — they toggle inline in Summary.
        if (INLINE_SUMMARY_KEYS.has(key)) return null;
        if (SPECIAL_COLUMNS[key]) return { key, label: SPECIAL_COLUMNS[key] };
        if (SYSTEM_COLUMNS[key]) return { key, label: SYSTEM_COLUMNS[key] };
        const field = byKey.get(key);
        // JPD labels the computed Score field "RICE score".
        const label = field?.key === "score" ? "RICE score" : field?.name ?? "";
        return field ? { key, label, field } : null;
      })
      .filter((c): c is Column => c !== null);
  }, [data, columnKeys]);

  // Fields/columns not currently shown — offered by the + add-column menu.
  const available = useMemo(() => {
    if (!data) return [] as { key: string; label: string }[];
    const shown = new Set(columnKeys);
    const hidden = (k: string) => shown.has(k) || HIDDEN_COLUMN_KEYS.has(k);
    const specials = Object.entries(SPECIAL_COLUMNS).filter(([k]) => !hidden(k)).map(([key, label]) => ({ key, label }));
    const system = Object.entries(SYSTEM_COLUMNS).filter(([k]) => !hidden(k)).map(([key, label]) => ({ key, label }));
    const fields = data.fields
      .filter((f) => !hidden(f.key))
      // JPD labels the computed Score field "RICE score" (also searchable as such).
      .map((f) => ({ key: f.key, label: f.key === "score" ? "RICE score" : f.name }));
    return [...specials, ...fields, ...system].sort((a, b) => a.label.localeCompare(b.label));
  }, [data, columnKeys]);

  // Entries for the Fields side panel — include the field ref so it can show the
  // right icon. `inView` mirrors the visible columns (in order); `availableEntries`
  // mirrors the + menu but carries the field object.
  const inViewEntries = useMemo<FieldEntry[]>(
    () => columnKeys
      .filter((k) => INLINE_SUMMARY_KEYS.has(k) || columns.some((c) => c.key === k))
      .map((k) => {
        const col = columns.find((c) => c.key === k);
        if (col) return { key: col.key, label: col.label, field: col.field };
        return { key: k, label: SYSTEM_COLUMNS[k] ?? k }; // inline key/type
      }),
    [columns, columnKeys],
  );
  const fieldByKey = useMemo(() => new Map((data?.fields ?? []).map((f) => [f.key, f])), [data]);
  const availableEntries = useMemo<FieldEntry[]>(
    () => available.map((a) => ({ key: a.key, label: a.label, field: fieldByKey.get(a.key) })),
    [available, fieldByKey],
  );

  function addColumn(key: string) { setColumnKeys((c) => (c.includes(key) ? c : [...c, key])); }
  function removeColumn(key: string) { setColumnKeys((c) => c.filter((k) => k !== key)); }

  /** Persist a specific column list to the shared view immediately (admins only).
   *  Used by the Fields panel toggles/reorder. Non-admins only change locally. */
  async function persistColumns(next: string[]) {
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  /** Sort panel change: update rules locally, then persist to the view (admins). */
  async function onSortChange(next: SortRule[]) {
    setSortRules(next);
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  /** Filter panel change: update rules locally, then persist to view (admins). */
  async function onFilterChange(next: FilterRule[]) {
    setFilterRules(next);
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  /** Display-settings change: update locally, then persist to view (admins). */
  async function onDisplayChange(next: DisplaySettings) {
    setDisplay(next);
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  /** Group-by change: update locally, then persist to view (admins). */
  async function onGroupByChange(next: GroupByConfig | null) {
    setGroupBy(next);
    if (!view || !canSaveForEveryone) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupBy: next }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }

  /** Fields-panel toggle: show/hide a column, then persist right away. */
  function toggleColumn(key: string, show: boolean) {
    const next = show
      ? (columnKeys.includes(key) ? columnKeys : [...columnKeys, key])
      : columnKeys.filter((k) => k !== key);
    setColumnKeys(next);
    void persistColumns(next);
  }

  /** Fields-panel drag-reorder: move fromKey before toKey, then persist. Summary
   *  stays pinned first (it's the sticky/frozen column). */
  function reorderColumn(fromKey: string, toKey: string) {
    if (fromKey === "summary" || toKey === "summary") return;
    const from = columnKeys.indexOf(fromKey);
    const to = columnKeys.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...columnKeys];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setColumnKeys(next);
    void persistColumns(next);
  }

  /** A field was just created inline — refetch the bundle so it's known, then
   *  show it as a column. */
  async function onFieldCreated(key: string) {
    await qc.refetchQueries({ queryKey });
    addColumn(key);
  }

  async function saveColumns() {
    if (!view) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: columnKeys }),
    });
    if (res.ok) await qc.invalidateQueries({ queryKey });
  }
  function resetColumns() { setColumnKeys(savedKeys); }

  async function patchIdeaRaw(ideaId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Surface failures instead of silently reverting on the next refetch, which
    // makes a value look "saved" then vanish (e.g. a rejected field write).
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error ?? `Failed to save (HTTP ${res.status})`);
    }
  }

  async function patchIdea(ideaId: string, body: Record<string, unknown>) {
    try {
      await patchIdeaRaw(ideaId, body);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("Idea save failed:", err);
      if (typeof window !== "undefined") window.alert(err instanceof Error ? err.message : "Failed to save.");
    }
    await qc.invalidateQueries({ queryKey });
  }

  function onEdit(ideaId: string, fieldId: string, value: IdeaFieldValue) {
    setRows((rs) => rs.map((r) => (r.id === ideaId ? { ...r, values: { ...r.values, [fieldId]: value } } : r)));
    void patchIdea(ideaId, { values: { [fieldId]: value } });
  }

  function onAssign(ideaId: string, userId: string | null) {
    setRows((rs) => rs.map((r) => (r.id === ideaId ? { ...r, assigneeId: userId } : r)));
    void patchIdea(ideaId, { assigneeId: userId });
  }

  function onEditTitle(ideaId: string, title: string) {
    setRows((rs) => rs.map((r) => (r.id === ideaId ? { ...r, title } : r)));
    void patchIdea(ideaId, { title });
  }

  // Drag-and-drop reorder: move `fromId` to `toId`'s slot, renumber locally, then
  // persist each affected row's new orderIndex (JPD reorders the whole list).
  function onReorder(fromId: string, toId: string) {
    const from = rows.findIndex((r) => r.id === fromId);
    const to = rows.findIndex((r) => r.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const renumbered = next.map((r, i) => ({ ...r, orderIndex: i }));
    setRows(renumbered);
    // Persist only the rows whose index actually changed (the moved span), then
    // invalidate ONCE so we don't fire a refetch per row.
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const writes: Promise<void>[] = [];
    for (let i = lo; i <= hi; i++) {
      writes.push(patchIdeaRaw(renumbered[i].id, { orderIndex: i }));
    }
    void Promise.all(writes).then(() => qc.invalidateQueries({ queryKey }));
  }

  async function createIdeaWithTitle(rawTitle: string) {
    const title = rawTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) await qc.invalidateQueries({ queryKey });
    } finally {
      setCreating(false);
    }
  }

  /** Export the current (filtered/sorted) rows + visible columns as a .csv. */
  function exportCsv() {
    setMoreOpen(false);
    if (!data) return;
    const cols = columns; // visible columns in order
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const cellText = (idea: IdeaRow, col: Column): string => {
      if (col.key === "summary") return idea.title;
      if (col.key === "key") return idea.key;
      if (col.key === "insights") return String(idea.insightCount ?? 0);
      if (col.key === "comments") return String(idea.commentCount ?? 0);
      if (col.key === "delivery") return String(idea.deliveryCount ?? 0);
      if (col.field) {
        const v = idea.values[col.field.id];
        if (v === null || v === undefined) return "";
        return Array.isArray(v) ? v.join("; ") : String(v);
      }
      return "";
    };
    const header = cols.map((c) => esc(c.label)).join(",");
    const body = visible.map((idea) => cols.map((c) => esc(cellText(idea, c))).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all-ideas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Apply the view's filter rules (client-side, AND across rules).
  const ruleFiltered = useMemo(() => {
    if (filterRules.length === 0 || !data) return rows;
    const fieldByKeyLocal = new Map(data.fields.map((f) => [f.key, f]));
    const passes = (idea: IdeaRow, rule: FilterRule): boolean => {
      // Resolve the idea's raw value for this rule's key.
      let raw: unknown;
      if (rule.key === "assignee") raw = idea.assigneeId ?? "__unassigned__";
      else if (rule.key === "creator") raw = idea.createdBy ?? idea.reporterId ?? "__unassigned__";
      else {
        const f = fieldByKeyLocal.get(rule.key);
        raw = f ? idea.values[f.id] : null;
      }
      switch (rule.op) {
        case "is_true": return raw === true;
        case "is_false": return raw !== true;
        case "eq": return Number(raw) === Number(rule.values[0]);
        case "gte": return Number(raw) >= Number(rule.values[0]);
        case "lte": return Number(raw) <= Number(rule.values[0]);
        case "contains": {
          const needle = String(rule.values[0] ?? "").toLowerCase();
          return needle === "" || String(raw ?? "").toLowerCase().includes(needle);
        }
        case "in":
        default: {
          if (rule.values.length === 0) return true; // no selection = no constraint
          if (Array.isArray(raw)) return raw.some((v) => rule.values.includes(v as string));
          return rule.values.includes(raw as string);
        }
      }
    };
    return rows.filter((idea) => filterRules.every((rule) => passes(idea, rule)));
  }, [rows, filterRules, data]);

  const filtered = search
    ? ruleFiltered.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
    : ruleFiltered;

  // Apply the multi-level sort (client-side). Each rule resolves a comparable
  // value from the idea (special keys → row props; otherwise the field value).
  const visible = useMemo(() => {
    if (sortRules.length === 0 || !data) return filtered;
    const fieldByKeyLocal = new Map(data.fields.map((f) => [f.key, f]));
    const valueFor = (idea: IdeaRow, key: string): string | number => {
      if (key === "summary") return idea.title.toLowerCase();
      if (key === "key") return idea.key;
      if (key === "created") return new Date(idea.createdAt).getTime();
      if (key === "updated") return new Date(idea.updatedAt).getTime();
      if (key === "insights") return idea.insightCount ?? 0;
      if (key === "comments") return idea.commentCount ?? 0;
      if (key === "delivery") return idea.deliveryCount ?? 0;
      const f = fieldByKeyLocal.get(key);
      const v = f ? idea.values[f.id] : null;
      if (v === null || v === undefined) return "";
      if (typeof v === "number") return v;
      if (Array.isArray(v)) return v.join(", ").toLowerCase();
      return String(v).toLowerCase();
    };
    const cmp = (a: IdeaRow, b: IdeaRow): number => {
      for (const rule of sortRules) {
        const av = valueFor(a, rule.key);
        const bv = valueFor(b, rule.key);
        let d = 0;
        if (typeof av === "number" && typeof bv === "number") d = av - bv;
        else d = String(av).localeCompare(String(bv));
        if (d !== 0) return rule.dir === "asc" ? d : -d;
      }
      return 0;
    };
    return [...filtered].sort(cmp);
  }, [filtered, sortRules, data]);

  // Group the visible rows into swimlanes by the group-by field. Multi-select
  // fields put an idea into each of its values' groups. Ungrouped ideas fall into
  // an "(empty)" group (unless "Hide empty groups" is on).
  const groups = useMemo(() => {
    if (!groupBy || !data) return undefined;
    const field = data.fields.find((f) => f.key === groupBy.key);
    const groupVals = (idea: IdeaRow): string[] => {
      let raw: unknown;
      if (groupBy.key === "assignee") raw = idea.assigneeId ?? null;
      else if (groupBy.key === "creator") raw = idea.createdBy ?? idea.reporterId ?? null;
      else if (groupBy.key === "status") raw = idea.statusId ?? null;
      else raw = field ? idea.values[field.id] : null;
      if (raw === null || raw === undefined || raw === "") return ["__empty__"];
      if (Array.isArray(raw)) return raw.length ? raw.map(String) : ["__empty__"];
      return [String(raw)];
    };
    // Build the ordered set of group keys (field options order, then any extras).
    const keyOrder: string[] = [];
    if (field?.options?.length) for (const o of field.options) keyOrder.push(o.value);
    const bucket = new Map<string, IdeaRow[]>();
    for (const idea of visible) for (const gv of groupVals(idea)) {
      if (!bucket.has(gv)) bucket.set(gv, []);
      bucket.get(gv)!.push(idea);
      if (!keyOrder.includes(gv)) keyOrder.push(gv);
    }
    // Ensure empty group is last.
    const ordered = keyOrder.filter((k) => k !== "__empty__").concat(bucket.has("__empty__") ? ["__empty__"] : []);
    const labelFor = (gk: string): React.ReactNode => {
      if (gk === "__empty__") return <span className="text-sm text-gray-400">(empty)</span>;
      if (groupBy.key === "assignee" || groupBy.key === "creator") {
        const m = members.find((x) => x.id === gk);
        return <span className="text-sm font-medium text-gray-700">{m ? memberName(m) : gk}</span>;
      }
      if (groupBy.key === "status") {
        const s = data.statuses.find((x) => x.id === gk);
        return <span className="text-sm font-medium text-gray-700">{s?.name ?? gk}</span>;
      }
      const opt = field?.options.find((o) => o.value === gk);
      return <span className="text-sm font-medium text-gray-700">{opt?.label ?? gk}</span>;
    };
    return ordered
      .map((gk) => ({ id: gk, label: labelFor(gk), ideas: bucket.get(gk) ?? [] }))
      .filter((g) => (groupBy.hideEmpty ? g.ideas.length > 0 : true));
  }, [groupBy, visible, data, members]);

  // The applied group-by field, for the toolbar chip ("Group by · <field>").
  const groupByEntry = useMemo(() => {
    if (!groupBy) return null;
    return [...inViewEntries, ...availableEntries].find((e) => e.key === groupBy.key) ?? null;
  }, [groupBy, inViewEntries, availableEntries]);

  // Row coloring, two sources (per-option highlight wins):
  //  1) "Highlight ideas with this color" — any option flagged highlight tints
  //     rows holding that value, using the OPTION'S own color (JPD).
  //  2) Display settings → row color by field — one uniform accent on rows that
  //     have a value for the chosen field.
  const rowColor = useMemo(() => {
    if (!data) return undefined;

    // Build the set of highlighted options: fieldId → value → color.
    const hl = new Map<string, Map<string, string>>();
    for (const f of data.fields) {
      for (const o of f.options ?? []) {
        if (o.highlight && o.color) {
          if (!hl.has(f.id)) hl.set(f.id, new Map());
          hl.get(f.id)!.set(o.value, o.color);
        }
      }
    }
    const highlightOf = (idea: IdeaRow): string | null => {
      for (const [fieldId, byValue] of hl) {
        const v = idea.values[fieldId];
        const vals = Array.isArray(v) ? (v as string[]) : v != null ? [String(v)] : [];
        for (const val of vals) {
          const c = byValue.get(val);
          if (c) return c;
        }
      }
      return null;
    };

    const hasHighlights = hl.size > 0;
    if (!display.rowColor && !hasHighlights) return undefined;

    const field = display.rowColor ? data.fields.find((f) => f.key === display.rowColor!.key) : undefined;
    const ACCENT = "#f43f5e"; // single soft rose accent (JPD-style)
    const of = (idea: IdeaRow): string | null => {
      const h = highlightOf(idea);
      if (h) return h; // per-option highlight takes precedence
      if (!display.rowColor) return null;
      let v: unknown;
      if (display.rowColor.key === "assignee") v = idea.assigneeId;
      else if (display.rowColor.key === "creator") v = idea.createdBy ?? idea.reporterId;
      else if (display.rowColor.key === "status") v = idea.statusId;
      else v = field ? idea.values[field.id] : null;
      const first = Array.isArray(v) ? v[0] : v;
      if (first === null || first === undefined || first === "") return null;
      return ACCENT;
    };
    return { of, style: display.rowColor?.style ?? "background" };
  }, [display.rowColor, data]);

  const panelIdea = rows.find((r) => r.id === panelId) ?? null;

  return (
    <div className={`flex min-h-0 overflow-hidden ${fullscreen ? "fixed inset-0 z-50 h-screen bg-white" : "h-full"}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 px-6 pt-4 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-2xl">👋</span>
            <h2 className="text-2xl font-semibold text-gray-900">All ideas</h2>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {rows.length} {rows.length === 1 ? "idea" : "ideas"}
            </span>
            <button
              type="button"
              onClick={() => setAboutPanelOpen(true)}
              title="View description"
              className="ml-1 hidden max-w-md truncate text-left text-xs text-gray-500 hover:text-gray-700 hover:underline md:inline"
            >
              {viewDescriptionText || VIEW_DESCRIPTION}
            </button>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 text-gray-500">
            <ChromeIcon icon={UserPlus} label="Add people" onClick={() => setAddPeopleOpen(true)} />
            <ChromeIcon icon={MessageSquare} label="Comments" onClick={() => setAboutPanelOpen(true)} />
            <ChromeIcon icon={Settings} label="Project settings" onClick={() => router.push(`/spaces/${projectId}/settings`)} />
            {/* ⋯ menu: Export / Import CSV. */}
            <div className="relative">
              <ChromeIcon icon={MoreHorizontal} label="More" active={moreOpen} onClick={() => setMoreOpen((v) => !v)} />
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                    <button type="button" onClick={exportCsv} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <FileDown className="h-4 w-4 text-gray-500" /> Export as CSV
                    </button>
                  </div>
                </>
              )}
            </div>
            <ChromeIcon icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? "Exit full screen" : "Full screen"} active={fullscreen} onClick={() => setFullscreen((v) => !v)} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-6 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-accent-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setGroupByPanelOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-sm ${
                groupByPanelOpen || groupBy ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Plus className={`h-3.5 w-3.5 ${groupByPanelOpen || groupBy ? "text-blue-600" : "text-gray-500"}`} />
              Group by
              {groupByEntry && (() => {
                const I = iconForColumn(groupByEntry.key, groupByEntry.field);
                return (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    <I className="h-3 w-3" /> {groupByEntry.label}
                  </span>
                );
              })()}
            </button>
            <ToolbarButton icon={Filter} label={filterRules.length ? `Filter (${filterRules.length})` : "Filter"} active={filterPanelOpen || filterRules.length > 0} onClick={() => setFilterPanelOpen(true)} />
            <ToolbarButton icon={ArrowUpDown} label={sortRules.length ? `Sort (${sortRules.length})` : "Sort"} active={sortPanelOpen || sortRules.length > 0} onClick={() => setSortPanelOpen(true)} />
            <ToolbarButton icon={SlidersHorizontal} label={`Fields ${columns.length}`} active={fieldsPanelOpen} onClick={() => setFieldsPanelOpen(true)} />
            <button
              type="button"
              aria-label="Display settings"
              onClick={() => setDisplayPanelOpen(true)}
              className={`rounded border p-1.5 ${
                displayPanelOpen || display.rowNumbers || display.rowColor
                  ? "border-blue-300 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            {/* Save-for-everyone / Reset — appear when the column set is dirty. */}
            {dirty && (
              <>
                {canSaveForEveryone ? (
                  <button
                    type="button"
                    onClick={() => void saveColumns()}
                    className="rounded bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800 hover:bg-amber-200"
                  >
                    Save for everyone
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">Only admins can save this view</span>
                )}
                <button type="button" onClick={resetColumns} className="text-sm text-gray-500 hover:text-gray-700">
                  Reset
                </button>
              </>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find an idea in this view"
              className="w-56 rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Table — left-inset to line up with the toolbar; right-flush to the
            edge (no right padding) so the grid runs to the edge like JPD. This
            wrapper scrolls vertically; the grid box inside scrolls horizontally. */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-4 pl-6">
          {isLoading ? (
            <div className="py-6 text-sm text-gray-500">Loading ideas…</div>
          ) : (
            <>
              <IdeasTable
                columns={columns}
                ideas={visible}
                activeId={activeId}
                onSetActive={setActiveId}
                onOpen={(i, tab) => { setActiveId(i.id); setPanelId(i.id); setPanelTab(tab ?? "Overview"); }}
                onEdit={onEdit}
                onEditTitle={onEditTitle}
                onReorder={onReorder}
                onCreate={createIdeaWithTitle}
                creating={creating}
                openAddRef={openAddRef}
                statuses={data?.statuses}
                members={members}
                onAssign={onAssign}
                onRemoveColumn={removeColumn}
                onReorderColumns={canSaveForEveryone ? reorderColumn : undefined}
                sortByKey={Object.fromEntries(sortRules.map((r) => [r.key, r.dir]))}
                showKey={columnKeys.includes("key")}
                showType={columnKeys.includes("type")}
                groups={groups}
                rowNumbers={display.rowNumbers}
                rowColor={rowColor}
                headerExtra={<AddColumnMenu projectId={projectId} options={availableEntries} onAdd={addColumn} onCreated={onFieldCreated} />}
                footer={(openAdd) => (
                  <div className="flex items-center gap-3 border-t border-gray-200 px-3 py-2 text-sm">
                    {/* Pinned to the left so "+ Create" stays visible while the
                        grid is scrolled horizontally (JPD). */}
                    <button
                      type="button"
                      onClick={openAdd}
                      className="sticky left-3 inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create
                    </button>
                  </div>
                )}
              />
            </>
          )}
        </div>
      </div>

      {panelIdea && data && (
        <IdeaDetailPanel
          key={panelId ?? undefined}
          projectId={projectId}
          idea={panelIdea}
          fields={data.fields}
          statuses={data.statuses}
          initialTab={panelTab}
          pinnedKeys={pinnedFields}
          onTogglePin={canSaveForEveryone ? onTogglePin : undefined}
          onClose={() => setPanelId(null)}
        />
      )}

      {editFieldId && (
        <FieldEditorPanel
          projectId={projectId}
          fieldId={editFieldId}
          onClose={() => setEditFieldId(null)}
          onSaved={() => void qc.refetchQueries({ queryKey })}
        />
      )}

      {fieldsPanelOpen && (
        <FieldsPanel
          inView={inViewEntries}
          available={availableEntries}
          canEdit={canSaveForEveryone}
          onToggle={toggleColumn}
          onReorder={reorderColumn}
          onClose={() => setFieldsPanelOpen(false)}
        />
      )}

      {sortPanelOpen && (
        <SortPanel
          rules={sortRules}
          fields={inViewEntries}
          canEdit={canSaveForEveryone}
          onChange={(r) => void onSortChange(r)}
          onClose={() => setSortPanelOpen(false)}
        />
      )}

      {filterPanelOpen && (
        <FilterPanel
          rules={filterRules}
          fields={[...inViewEntries, ...availableEntries]}
          members={members}
          canEdit={canSaveForEveryone}
          onChange={(r) => void onFilterChange(r)}
          onClose={() => setFilterPanelOpen(false)}
        />
      )}

      {groupByPanelOpen && (
        <GroupByPanel
          value={groupBy}
          fields={[...inViewEntries, ...availableEntries]}
          canEdit={canSaveForEveryone}
          onChange={(g) => void onGroupByChange(g)}
          onEditField={(key) => { const f = data?.fields.find((x) => x.key === key); if (f) setEditFieldId(f.id); }}
          onClose={() => setGroupByPanelOpen(false)}
        />
      )}

      {addPeopleOpen && (
        <AddPeopleModal projectId={projectId} projectName={projectName} onClose={() => setAddPeopleOpen(false)} />
      )}

      {createModalOpen && (
        <CreateIdeaModal
          projectId={projectId}
          projectName={projectName}
          onCreated={() => void qc.invalidateQueries({ queryKey })}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {aboutPanelOpen && (
        <ViewAboutPanel
          projectId={projectId}
          viewId={view?.id ?? null}
          viewTitle="All ideas"
          description={viewDescriptionHtml || `<p>${VIEW_DESCRIPTION}</p>`}
          canEdit={canSaveForEveryone}
          onSaveDescription={saveViewDescription}
          onClose={() => setAboutPanelOpen(false)}
        />
      )}

      {displayPanelOpen && (
        <DisplayPanel
          settings={display}
          fields={[...inViewEntries, ...availableEntries]}
          canEdit={canSaveForEveryone}
          onChange={(d) => void onDisplayChange(d)}
          onEditField={(key) => { const f = data?.fields.find((x) => x.key === key); if (f) setEditFieldId(f.id); }}
          onClose={() => setDisplayPanelOpen(false)}
        />
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick, active }: { icon: typeof Filter; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-sm ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-gray-200 text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? "text-blue-600" : "text-gray-500"}`} /> {label}
    </button>
  );
}

function ChromeIcon({ icon: Icon, label, onClick, active }: { icon: typeof Filter; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded p-1.5 hover:bg-gray-100 ${active ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>
      <Icon className={`h-4 w-4 ${active ? "text-blue-600" : "text-gray-500"}`} />
    </button>
  );
}
