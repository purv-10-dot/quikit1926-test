"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Clock, Plus, Trash2, History, X, ChevronDown, Search, Filter } from "lucide-react";
import { useUsers } from "@/lib/hooks/useUsers";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface DailyHuddle {
  id: string;
  meetingDate: string;
  callStatus: string;
  clientName: string | null;
  absentMembers: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  yesterdaysAchievements: boolean;
  stuckIssues: boolean;
  todaysPriority: boolean;
  notesKPDashboard: string | null;
  otherNotes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

type FormState = {
  meetingDate: string;
  callStatus: string;
  clientName: string;
  absentMembers: string;
  actualStartTime: string;
  actualEndTime: string;
  yesterdaysAchievements: boolean | null;
  stuckIssues: boolean | null;
  todaysPriority: boolean | null;
  notesKPDashboard: string;
  otherNotes: string;
};

/* ─── Constants ───────────────────────────────────────────────────────────── */
const CALL_STATUS_OPTIONS = ["Scheduled", "Held", "Cancelled", "Rescheduled"];

const EMPTY_FORM: FormState = {
  meetingDate: "",
  callStatus: "",
  clientName: "",
  absentMembers: "",
  actualStartTime: "",
  actualEndTime: "",
  yesterdaysAchievements: null,
  stuckIssues: null,
  todaysPriority: null,
  notesKPDashboard: "",
  otherNotes: "",
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return "—"; }
}

function toDateInput(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${m} ${ampm}`;
  } catch { return t; }
}

/* ─── YesBadge ───────────────────────────────────────────────────────────── */
function YesBadge({ value }: { value: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
      value ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"
    }`}>
      {value ? "YES" : "NO"}
    </span>
  );
}

/* ─── TimeBadge ──────────────────────────────────────────────────────────── */
function TimeBadge({ time }: { time: string | null }) {
  if (!time) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
      <Clock className="h-3 w-3" />
      {formatTime(time)}
    </span>
  );
}

/* ─── CallStatusBadge ────────────────────────────────────────────────────── */
function CallStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Held:        "bg-green-100 text-green-700",
    Scheduled:   "bg-accent-100 text-accent-700",
    Cancelled:   "bg-red-100 text-red-600",
    Rescheduled: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${colors[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

/* ─── YesNoRadio ─────────────────────────────────────────────────────────── */
function YesNoRadio({
  label, value, onChange,
}: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1.5">{label}</p>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
        {[true, false].map(opt => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              value === opt
                ? opt ? "bg-green-500 text-white" : "bg-red-400 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {opt ? "YES" : "NO"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── LogTooltip ─────────────────────────────────────────────────────────── */
function LogTooltip({ item }: { item: DailyHuddle }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    setShow(true);
  }

  return (
    <>
      <button
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
        className="text-gray-400 hover:text-accent-500 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
      </button>
      {show && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none w-56"
        >
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="text-gray-300 mb-1">Created: <span className="text-white">{new Date(item.createdAt).toLocaleString()}</span></p>
          <p className="text-gray-300">Updated: <span className="text-white">{new Date(item.updatedAt).toLocaleString()}</span></p>
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── Mini Rich Editor ────────────────────────────────────────────────────── */
function MiniRichEditor({
  value, onChange, placeholder = "Enter your content here...",
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Sync HTML on mount only (value is controlled by parent)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
      setIsEmpty(!value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val ?? undefined);
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html);
    setIsEmpty(!html || html === "<br>");
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50 overflow-x-auto scrollbar-none flex-nowrap">
        <button type="button" title="Bold" onMouseDown={e => { e.preventDefault(); exec("bold"); }}
          className="h-6 w-6 flex items-center justify-center text-xs font-bold text-gray-600 hover:bg-gray-200 rounded">B</button>
        <button type="button" title="Italic" onMouseDown={e => { e.preventDefault(); exec("italic"); }}
          className="h-6 w-6 flex items-center justify-center text-xs italic text-gray-600 hover:bg-gray-200 rounded">I</button>
        <button type="button" title="Underline" onMouseDown={e => { e.preventDefault(); exec("underline"); }}
          className="h-6 w-6 flex items-center justify-center text-xs underline text-gray-600 hover:bg-gray-200 rounded">U</button>
        <button type="button" title="Strikethrough" onMouseDown={e => { e.preventDefault(); exec("strikeThrough"); }}
          className="h-6 w-6 flex items-center justify-center text-xs line-through text-gray-600 hover:bg-gray-200 rounded">S</button>
        <span className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
        <button type="button" title="Bullet list" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }}
          className="h-6 w-6 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded text-sm">≡</button>
        <button type="button" title="Numbered list" onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }}
          className="h-6 w-6 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded text-sm">1.</button>
        <span className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
        <button type="button" title="Block quote" onMouseDown={e => {
          e.preventDefault();
          const cur = document.queryCommandValue("formatBlock").toLowerCase();
          exec("formatBlock", cur === "blockquote" ? "p" : "blockquote");
        }} className="h-6 w-6 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded text-sm">&ldquo;</button>
        <span className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
        <button type="button" title="Undo" onMouseDown={e => { e.preventDefault(); exec("undo"); }}
          className="h-6 px-1.5 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-200 rounded">↺</button>
        <button type="button" title="Redo" onMouseDown={e => { e.preventDefault(); exec("redo"); }}
          className="h-6 px-1.5 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-200 rounded">↻</button>
      </div>
      {/* Content area */}
      <div className="relative min-h-[120px]">
        {isEmpty && (
          <span className="absolute inset-0 px-3 py-2.5 text-sm text-gray-400 pointer-events-none select-none italic">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          className="rich-editor min-h-[120px] px-3 py-2.5 text-sm text-gray-700 focus:outline-none"
        />
      </div>
    </div>
  );
}

/* ─── UserSelect dropdown ─────────────────────────────────────────────────── */
function UserSelect({ value, onChange, placeholder = "Select member" }: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const { data: users = [] } = useUsers();
  const ref                 = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400"
      >
        <span className={value ? "text-gray-700 truncate" : "text-gray-400"}>{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[220px]">
          <div className="p-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto pb-1">
            {/* Clear option */}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 italic"
              >
                — Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No users found.</p>
            ) : filtered.map(u => {
              const fullName = `${u.firstName} ${u.lastName}`;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(fullName); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${value === fullName ? "bg-accent-50" : ""}`}
                >
                  <span className={`block text-sm ${value === fullName ? "text-accent-600 font-medium" : "text-gray-700"}`}>{fullName}</span>
                  <span className="block text-[10px] text-gray-400">{u.email}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Panel (Add / Edit form) ────────────────────────────────────────────── */
function HuddlePanel({
  open, onClose, onSaved, editItem,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem: DailyHuddle | null;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          meetingDate:            toDateInput(editItem.meetingDate),
          callStatus:             editItem.callStatus,
          clientName:             editItem.clientName ?? "",
          absentMembers:          editItem.absentMembers ?? "",
          actualStartTime:        editItem.actualStartTime ?? "",
          actualEndTime:          editItem.actualEndTime ?? "",
          yesterdaysAchievements: editItem.yesterdaysAchievements,
          stuckIssues:            editItem.stuckIssues,
          todaysPriority:         editItem.todaysPriority,
          notesKPDashboard:       editItem.notesKPDashboard ?? "",
          otherNotes:             editItem.otherNotes ?? "",
        });
      } else {
        setForm({ ...EMPTY_FORM, meetingDate: new Date().toISOString().split("T")[0] });
      }
      setError("");
    }
  }, [open, editItem]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.meetingDate) { setError("Meeting date is required."); return; }
    if (!form.callStatus)  { setError("Call status is required."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        meetingDate:            form.meetingDate,
        callStatus:             form.callStatus,
        clientName:             form.clientName || null,
        absentMembers:          form.absentMembers || null,
        actualStartTime:        form.actualStartTime || null,
        actualEndTime:          form.actualEndTime || null,
        yesterdaysAchievements: form.yesterdaysAchievements ?? false,
        stuckIssues:            form.stuckIssues ?? false,
        todaysPriority:         form.todaysPriority ?? false,
        notesKPDashboard:       form.notesKPDashboard || null,
        otherNotes:             form.otherNotes || null,
      };

      const url    = editItem ? `/api/daily-huddle/${editItem.id}` : "/api/daily-huddle";
      const method = editItem ? "PUT" : "POST";

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to save"); return; }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="w-[520px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">Meeting Details</p>
            <p className="text-xs text-gray-500">{editItem ? "Edit record" : "Create new record"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Row 1: Meeting Date + Call Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Meeting Date</label>
              <input
                type="date"
                value={form.meetingDate}
                onChange={e => set("meetingDate", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Call Status</label>
              <div className="relative">
                <select
                  value={form.callStatus}
                  onChange={e => set("callStatus", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white appearance-none pr-8"
                >
                  <option value="">Select status</option>
                  {CALL_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 2: Client Name + Absent Members */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Client Name</label>
              <input
                type="text"
                value={form.clientName}
                onChange={e => set("clientName", e.target.value)}
                placeholder="Enter client name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Absent Members</label>
              <UserSelect
                value={form.absentMembers}
                onChange={v => set("absentMembers", v)}
                placeholder="Select member"
              />
            </div>
          </div>

          {/* Row 3: Actual Start Time + Actual End Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Actual Start Time</label>
              <input
                type="time"
                value={form.actualStartTime}
                onChange={e => set("actualStartTime", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Actual End Time</label>
              <input
                type="time"
                value={form.actualEndTime}
                onChange={e => set("actualEndTime", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
          </div>

          {/* Row 4: Yesterday's Achievements + Stuck Issues */}
          <div className="grid grid-cols-2 gap-4">
            <YesNoRadio
              label="Yesterday's Achievements"
              value={form.yesterdaysAchievements}
              onChange={v => set("yesterdaysAchievements", v)}
            />
            <YesNoRadio
              label="Stuck Issues"
              value={form.stuckIssues}
              onChange={v => set("stuckIssues", v)}
            />
          </div>

          {/* Row 5: Today's Priority */}
          <div className="grid grid-cols-2 gap-4">
            <YesNoRadio
              label="Today's Priority"
              value={form.todaysPriority}
              onChange={v => set("todaysPriority", v)}
            />
          </div>

          {/* Notes K&P Dashboard */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Notes K&amp;P dashboard</label>
            <MiniRichEditor
              value={form.notesKPDashboard}
              onChange={v => set("notesKPDashboard", v)}
              placeholder="Enter K&P dashboard notes..."
            />
          </div>

          {/* Other Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Other Notes</label>
            <MiniRichEditor
              value={form.otherNotes}
              onChange={v => set("otherNotes", v)}
              placeholder="Enter your content here..."
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : editItem ? "Update" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function DailyHuddlePage() {
  const [items, setItems]             = useState<DailyHuddle[]>([]);
  const [loading, setLoading]         = useState(true);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [editItem, setEditItem]       = useState<DailyHuddle | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilter, setShowFilter]   = useState(false);
  const filterRef                     = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/daily-huddle");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Close filter dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter(item => {
    if (filterStatus && item.callStatus !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (item.clientName ?? "").toLowerCase().includes(q) ||
        (item.absentMembers ?? "").toLowerCase().includes(q) ||
        item.callStatus.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  }

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    await Promise.all([...selectedIds].map(id => fetch(`/api/daily-huddle/${id}`, { method: "DELETE" })));
    setSelectedIds(new Set());
    fetchItems();
  }

  function openAdd() { setEditItem(null); setPanelOpen(true); }
  function openEdit(item: DailyHuddle) { setEditItem(item); setPanelOpen(true); }

  const activeFilterCount = filterStatus ? 1 : 0;

  /* ── Column widths ── */
  const COL = {
    check:    40,  log:     44,  id:      52,
    date:    130,  status:  110, client:  130,
    absent:  130,  start:   120, end:     120,
    yest:    160,  stuck:   110, priority:130,
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Daily Huddle</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {filtered.length} {filtered.length === 1 ? "record" : "records"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedIds.size})
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>

          {/* Filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg ${
                activeFilterCount > 0
                  ? "border-accent-300 bg-accent-50 text-accent-600"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-accent-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {showFilter && (
              <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-56">
                <p className="text-xs font-semibold text-gray-700 mb-2">Call Status</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setFilterStatus(""); setShowFilter(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${!filterStatus ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    All
                  </button>
                  {CALL_STATUS_OPTIONS.map(s => (
                    <button key={s} onClick={() => { setFilterStatus(s); setShowFilter(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${filterStatus === s ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add New */}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> Add New
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 1280 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* Checkbox */}
              <th style={{ width: COL.check }} className="px-3 py-2.5 text-left">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-accent-600 cursor-pointer"
                />
              </th>
              {/* Log */}
              <th style={{ width: COL.log }} className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Log
              </th>
              {/* ID */}
              <th style={{ width: COL.id }} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100">
                ID
              </th>
              {[
                ["Meeting Date",           COL.date],
                ["Call Status",            COL.status],
                ["Client Name",            COL.client],
                ["Absent Members",         COL.absent],
                ["Actual Start Time",      COL.start],
                ["Actual End Time",        COL.end],
                ["Yesterday's Achievements", COL.yest],
                ["Stuck Issues",           COL.stuck],
                ["Today's Priority",       COL.priority],
              ].map(([label, w]) => (
                <th
                  key={label as string}
                  style={{ width: w as number }}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100 whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 px-4">
                    <Clock className="h-10 w-10 text-gray-300" />
                    <h3 className="text-sm font-semibold text-gray-800">Log your first daily huddle</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                      A 5-15 minute daily stand-up keeps your team in sync. Track achievements,
                      stuck issues, and the day&apos;s priorities — one record per meeting.
                    </p>
                    <button
                      type="button"
                      onClick={openAdd}
                      className="mt-1 px-4 py-2 text-xs font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors"
                    >
                      Add your first huddle
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => (
                <tr
                  key={item.id}
                  onClick={() => openEdit(item)}
                  className={`cursor-pointer transition-colors hover:bg-accent-50/40 ${selectedIds.has(item.id) ? "bg-accent-50" : ""}`}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-gray-300 text-accent-600 cursor-pointer"
                    />
                  </td>
                  {/* Log */}
                  <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                    <LogTooltip item={item} />
                  </td>
                  {/* ID */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <span className="text-xs font-semibold text-accent-600">#{idx + 1}</span>
                  </td>
                  {/* Meeting Date */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <span className="text-xs text-gray-700">{formatDate(item.meetingDate)}</span>
                  </td>
                  {/* Call Status */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <CallStatusBadge status={item.callStatus} />
                  </td>
                  {/* Client Name */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <span className="text-xs text-gray-700 truncate block max-w-[120px]">{item.clientName || "—"}</span>
                  </td>
                  {/* Absent Members */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <span className="text-xs text-gray-700 truncate block max-w-[120px]">{item.absentMembers || "—"}</span>
                  </td>
                  {/* Actual Start Time */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <TimeBadge time={item.actualStartTime} />
                  </td>
                  {/* Actual End Time */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <TimeBadge time={item.actualEndTime} />
                  </td>
                  {/* Yesterday's Achievements */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <YesBadge value={item.yesterdaysAchievements} />
                  </td>
                  {/* Stuck Issues */}
                  <td className="px-3 py-2.5 border-r border-gray-100">
                    <YesBadge value={item.stuckIssues} />
                  </td>
                  {/* Today's Priority */}
                  <td className="px-3 py-2.5">
                    <YesBadge value={item.todaysPriority} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Panel ── */}
      <HuddlePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSaved={fetchItems}
        editItem={editItem}
      />
    </div>
  );
}
