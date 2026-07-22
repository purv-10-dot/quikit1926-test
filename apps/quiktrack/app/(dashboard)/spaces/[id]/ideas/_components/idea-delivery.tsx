"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ChevronDown,
  Plus,
  Link2,
  X,
  ExternalLink,
  Check,
  Columns,
  User,
  AlertTriangle,
} from "lucide-react";
import { SpaceIcon } from "@/components/space-icon";
import { TYPE_META, type IssueType } from "@/app/(dashboard)/spaces/[id]/list/_components/list-types";

/** Work-type icon for a work item; falls back to Task styling for unknown types. */
function TypeIcon({ type }: { type: string }) {
  const meta = TYPE_META[(type as IssueType)] ?? TYPE_META.TASK;
  const Icon = meta.Icon;
  return <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />;
}

/**
 * Delivery tab for the idea detail panel (JPD). Links the idea to real work
 * items (QtIssues), which may live in OTHER spaces. Flows:
 *   • Link existing work — pick a space, search a work item, Add.
 *   • Create work item — pick a space, work type + summary, Create.
 * Below: a progress bar + a table of linked items (expandable children). Talks
 * to /api/projects/[id]/ideas/[ideaId]/delivery(/spaces|/search|/create|/[linkId]).
 */

interface Space { id: string; name: string; projectKey: string; icon?: string | null; color?: string | null }
interface SearchItem { id: string; key: string; title: string; type: string; status: string | null }
/** A work-item node in the delivery tree (recursive: epic → task → subtask). */
interface Node {
  id: string; key: string; title: string; type: string;
  storyPoints: number | null; status: string | null; statusCategory: string | null;
  assigneeId: string | null; assigneeName: string | null; dueDate: string | null;
  sprint: string | null;
  children: Node[];
}

/** Columns the delivery table can show. Type/Key live in the Work item cell. */
interface ColState {
  status: boolean; points: boolean; assignee: boolean; due: boolean; sprint: boolean;
}
interface LinkedItem extends Node { linkId: string; projectName: string | null }

const WORK_TYPES = ["EPIC", "TASK", "STORY", "FEATURE", "REQUEST", "BUG", "TEST"] as const;
const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function statusPill(cat: string | null): string {
  if (cat === "DONE") return "bg-green-100 text-green-700";
  if (cat === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

export function IdeaDelivery({
  projectId,
  ideaId,
  ideaTitle,
  onCountChange,
}: {
  projectId: string;
  ideaId: string;
  ideaTitle: string;
  onCountChange?: (n: number) => void;
}) {
  const base = `/api/projects/${projectId}/ideas/${ideaId}/delivery`;
  const [items, setItems] = useState<LinkedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [counts, setCounts] = useState({ total: 0, todo: 0, inProgress: 0, done: 0 });
  const [progressHover, setProgressHover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Which optional columns are shown (JPD column picker). Type/Key always show
  // inside the "Work item" cell; the rest are toggleable, read-only data columns.
  const [cols, setCols] = useState<ColState>({ status: true, points: true, assignee: false, due: false, sprint: false });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(base);
      const json = (await res.json()) as { success: boolean; data?: { items: LinkedItem[]; progress: number; counts?: { total: number; todo: number; inProgress: number; done: number } } };
      if (json.success && json.data) {
        setItems(json.data.items);
        setProgress(json.data.progress);
        if (json.data.counts) setCounts(json.data.counts);
        onCountChange?.(json.data.items.length);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ideaId]);

  async function unlink(linkId: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${linkId}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Action buttons when items already exist (JPD). */}
      {hasItems && mode === "idle" && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("link")} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Link2 className="h-3.5 w-3.5" /> Link a work item
          </button>
          <button type="button" onClick={() => setMode("create")} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" /> Create work item
          </button>
        </div>
      )}

      {/* Link / Create forms. When the idea has no delivery yet, the Link form
          sits open by default (JPD) with the "Deliver the idea" illustration and
          no Cancel (there's nothing to return to). */}
      {(mode === "link" || (!loading && !hasItems && mode === "idle")) && (
        <LinkForm
          base={base}
          busy={busy} setBusy={setBusy}
          onDone={() => { setMode("idle"); void load(); }}
          onCancel={hasItems ? () => setMode("idle") : undefined}
          onSwitchToCreate={() => setMode("create")}
          showEmptyIllustration={!hasItems}
        />
      )}
      {mode === "create" && (
        <CreateForm
          base={base}
          ideaTitle={ideaTitle}
          busy={busy} setBusy={setBusy}
          onDone={() => { setMode("idle"); void load(); }}
          onCancel={() => setMode(hasItems ? "idle" : "link")}
          onSwitchToLink={() => setMode("link")}
        />
      )}

      {/* Progress + linked table */}
      {hasItems && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Delivery</span>
          </div>
          {/* Progress bar — hover shows the JPD breakdown popover. */}
          <div
            className="relative mb-3"
            onMouseEnter={() => setProgressHover(true)}
            onMouseLeave={() => setProgressHover(false)}
          >
            <div className="h-2 w-full cursor-default overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
            {progressHover && (
              <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
                <p className="text-sm font-semibold text-gray-900">Delivery</p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{counts.total}</span>
                  work items
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{progress}% Done</span>
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  {counts.todo > 0 && (
                    <p className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{counts.todo}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">TO DO</span>
                    </p>
                  )}
                  {counts.inProgress > 0 && (
                    <p className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{counts.inProgress}</span>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">IN PROGRESS</span>
                    </p>
                  )}
                  {counts.done > 0 && (
                    <p className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{counts.done}</span>
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">DONE</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* overflow-x-auto so extra columns scroll horizontally (JPD). The
              always-visible styled scrollbar signals there are more fields. */}
          <div className="qt-delivery-scroll overflow-x-auto rounded-lg border border-gray-200">
            <style>{`
              .qt-delivery-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }
              .qt-delivery-scroll::-webkit-scrollbar { height: 10px; }
              .qt-delivery-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 0 0 8px 8px; }
              .qt-delivery-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; border: 2px solid #f1f5f9; }
              .qt-delivery-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
            <table className="w-full min-w-max text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Work item</th>
                  {cols.status && <th className="px-3 py-2 font-medium">Status</th>}
                  {cols.points && <th className="px-3 py-2 font-medium">Story points</th>}
                  {cols.assignee && <th className="px-3 py-2 font-medium">Assignee</th>}
                  {cols.due && <th className="px-3 py-2 font-medium">Due date</th>}
                  {cols.sprint && <th className="px-3 py-2 font-medium">Sprint</th>}
                  <th className="w-9 px-2 py-2">
                    <ColumnPicker cols={cols} setCols={setCols} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <DeliveryRows
                    key={it.linkId}
                    node={it}
                    depth={0}
                    expanded={expanded}
                    onToggle={(id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    cols={cols}
                    onUnlink={() => void unlink(it.linkId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
    </div>
  );
}

/** Recursive delivery row: renders `node`, and (when expanded) its children —
 *  so an epic → its tasks → their subtasks all collapse/expand. `depth` indents
 *  each level; only the top level (depth 0) shows the unlink action. */
function DeliveryRows({ node, depth, expanded, onToggle, cols, onUnlink }: {
  node: Node; depth: number; expanded: Set<string>;
  onToggle: (id: string) => void; cols: ColState; onUnlink?: () => void;
}) {
  const open = expanded.has(node.id);
  const hasKids = node.children.length > 0;
  const overdue = node.dueDate ? new Date(node.dueDate) < new Date() && node.statusCategory !== "DONE" : false;
  return (
    <>
      <tr className={`border-t border-gray-100 ${depth > 0 ? "bg-gray-50/40" : ""}`}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap" style={{ paddingLeft: depth * 20 }}>
            {hasKids ? (
              <button type="button" onClick={() => onToggle(node.id)} aria-label="Toggle children" className="text-gray-400 hover:text-gray-600">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
            ) : <span className="w-3.5" />}
            <TypeIcon type={node.type} />
            <span className="font-medium text-blue-600">{node.key}</span>
            <span className="text-gray-800">{node.title}</span>
          </div>
        </td>
        {cols.status && (
          <td className="whitespace-nowrap px-3 py-2">
            {node.status && <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusPill(node.statusCategory)}`}>{node.status.toUpperCase()}</span>}
          </td>
        )}
        {cols.points && <td className="px-3 py-2 text-gray-600">{node.storyPoints ?? ""}</td>}
        {cols.assignee && (
          <td className="whitespace-nowrap px-3 py-2">
            {node.assigneeName ? (
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-600 text-[9px] font-medium text-white">
                  {node.assigneeName.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                </span>
                {node.assigneeName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-gray-400">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-gray-400"><User className="h-3 w-3" /></span>
                Unassigned
              </span>
            )}
          </td>
        )}
        {cols.due && (
          <td className="whitespace-nowrap px-3 py-2">
            {node.dueDate ? (
              <span className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-red-600" : "text-gray-600"}`}>
                {new Date(node.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
              </span>
            ) : ""}
          </td>
        )}
        {cols.sprint && (
          <td className="whitespace-nowrap px-3 py-2 text-gray-600">
            {node.sprint ?? ""}
          </td>
        )}
        <td className="px-2 py-2">
          {onUnlink && (
            <button type="button" aria-label="Unlink" onClick={onUnlink} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
      {open && hasKids && node.children.map((c) => (
        <DeliveryRows
          key={c.id}
          node={c}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          cols={cols}
        />
      ))}
    </>
  );
}

/** Column picker (▦) for the delivery table (JPD). Type/Key always show inside
 *  the Work item cell; Status/Story points/Assignee/Due date are toggleable,
 *  read-only columns. The remaining JPD columns are listed but disabled. */
function ColumnPicker({ cols, setCols }: { cols: ColState; setCols: (c: ColState) => void }) {
  const toggle = (k: keyof ColState) => setCols({ ...cols, [k]: !cols[k] });
  // Anchored with position:fixed (measured from the button) so the table's
  // overflow-hidden wrapper can't clip the popover.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const Row = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange?: () => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${disabled ? "cursor-default text-gray-400" : "text-gray-700 hover:bg-gray-50"}`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded border ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
  return (
    <>
      <button
        type="button"
        aria-label="Columns"
        onClick={(e) => {
          if (pos) { setPos(null); return; }
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: r.right, y: r.bottom + 4 });
        }}
        className={`rounded p-1 ${pos ? "text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
      >
        <Columns className="h-4 w-4" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div
            style={{ position: "fixed", left: pos.x - 192, top: pos.y }}
            className="z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
          >
            <Row label="Type" checked disabled />
            <Row label="Key" checked disabled />
            <Row label="Status" checked={cols.status} onChange={() => toggle("status")} />
            <Row label="Story points" checked={cols.points} onChange={() => toggle("points")} />
            <Row label="Assignee" checked={cols.assignee} onChange={() => toggle("assignee")} />
            <Row label="Due date" checked={cols.due} onChange={() => toggle("due")} />
            <Row label="Sprint" checked={cols.sprint} onChange={() => toggle("sprint")} />
          </div>
        </>
      )}
    </>
  );
}

/** Searchable space combobox used by both link + create forms. Queries the
 *  server (`/spaces?q=`) as you type, so it's a real typeahead — not a plain
 *  <select>. Shows the picked space's name in the field; a search box lives
 *  inside the open dropdown. */
function SpaceSelect({ base, value, onChange }: { base: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selected, setSelected] = useState<Space | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch spaces (filtered by q) whenever the dropdown is open or the query
  // changes.
  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`${base}/spaces?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { success: boolean; data?: Space[] };
      if (json.success && json.data) setSpaces(json.data);
    }, 180);
  }, [base, q, open]);

  function pick(s: Space) {
    setSelected(s);
    onChange(s.id);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-gray-600">Space</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm outline-none ${open ? "border-blue-400" : "border-gray-300"}`}
      >
        {selected && <SpaceIcon icon={selected.icon} name={selected.name} color={selected.color} size={18} radius={4} />}
        <span className={`flex-1 truncate ${value ? "text-gray-900" : "text-gray-400"}`}>
          {selected?.name ?? (value ? "Selected space" : "Search for a space")}
        </span>
        {value && (
          <button
            type="button"
            aria-label="Clear space"
            onClick={(e) => { e.stopPropagation(); setSelected(null); onChange(""); }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="relative border-b border-gray-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search for a space"
                className="w-full rounded border border-gray-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {spaces.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">No spaces found.</p>
              ) : (
                spaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${s.id === value ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
                  >
                    <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={20} radius={4} />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LinkForm({ base, busy, setBusy, onDone, onCancel, onSwitchToCreate, showEmptyIllustration }: {
  base: string; busy: boolean; setBusy: (b: boolean) => void;
  onDone: () => void; onCancel?: () => void; onSwitchToCreate: () => void; showEmptyIllustration?: boolean;
}) {
  const [spaceId, setSpaceId] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [picked, setPicked] = useState<SearchItem | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuRect, setMenuRect] = useState<{ x: number; y: number; w: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position the (fixed) results menu under the input so the panel's overflow
  // can't clip it.
  function placeMenu() {
    const el = inputRef.current;
    if (el) { const r = el.getBoundingClientRect(); setMenuRect({ x: r.left, y: r.bottom + 4, w: r.width }); }
  }

  useEffect(() => {
    if (!spaceId) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`${base}/search?spaceId=${encodeURIComponent(spaceId)}&q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { success: boolean; data?: SearchItem[] };
      if (json.success && json.data) setResults(json.data);
    }, 200);
  }, [base, spaceId, q]);

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: picked.id }),
      });
      if (res.ok) { setPicked(null); setQ(""); onDone(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Link existing work</p>
      <SpaceSelect base={base} value={spaceId} onChange={(v) => { setSpaceId(v); setPicked(null); }} />

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            value={picked ? `${picked.key} ${picked.title}` : q}
            onChange={(e) => { setPicked(null); setQ(e.target.value); placeMenu(); }}
            onFocus={() => { setSearchFocused(true); placeMenu(); }}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            disabled={!spaceId}
            placeholder="Search for a work item"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50"
          />
          {searchFocused && spaceId && !picked && results.length > 0 && menuRect && (
            <div
              style={{ position: "fixed", left: menuRect.x, top: menuRect.y, width: menuRect.w }}
              className="z-50 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
            >
              <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-gray-500">
                Search results ({results.length})
              </p>
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setPicked(r); setSearchFocused(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  <TypeIcon type={r.type} />
                  <span className="shrink-0 font-medium text-blue-600">{r.key}</span>
                  <span className="truncate text-gray-700">{r.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">You can’t search work items with the done status.</p>
      </div>

      {/* Action row (JPD): + Create work item (left) — Cancel · Add (right). */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSwitchToCreate} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <Plus className="h-3.5 w-3.5" /> Create work item
        </button>
        <div className="ml-auto flex items-center gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          )}
          <button type="button" disabled={busy || !picked} onClick={() => void add()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      {showEmptyIllustration && (
        <div className="pt-4 text-center">
          <p className="text-sm font-medium text-gray-700">Deliver the idea</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
            Create epics or link existing work. Here’s where you’ll be able to track delivery work related to this idea.
          </p>
          <a href="#" className="mt-2 inline-flex items-center gap-0.5 text-sm text-blue-600 hover:underline">
            Learn about delivery <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function CreateForm({ base, ideaTitle, busy, setBusy, onDone, onCancel, onSwitchToLink }: {
  base: string; ideaTitle: string; busy: boolean; setBusy: (b: boolean) => void;
  onDone: () => void; onCancel: () => void; onSwitchToLink: () => void;
}) {
  const [spaceId, setSpaceId] = useState("");
  const [type, setType] = useState("");
  const [summary, setSummary] = useState(ideaTitle);
  const [embedIdea, setEmbedIdea] = useState(false);

  async function create() {
    if (!spaceId || !type || !summary.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, type, summary: summary.trim(), embedIdea }),
      });
      if (res.ok) onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Create work item</p>
      <SpaceSelect base={base} value={spaceId} onChange={setSpaceId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Work type</label>
          <div className="relative">
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm outline-none focus:border-blue-400">
              <option value="">Select…</option>
              {WORK_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Summary</label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={embedIdea} onChange={(e) => setEmbedIdea(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        Embed the idea description and fields into the work item
      </label>

      {/* Action row (JPD): Link existing work (left) — Cancel · Create (right). */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSwitchToLink} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <Link2 className="h-3.5 w-3.5" /> Link existing work
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="button" disabled={busy || !spaceId || !type || !summary.trim()} onClick={() => void create()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
