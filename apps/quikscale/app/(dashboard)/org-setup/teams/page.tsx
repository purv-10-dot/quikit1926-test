"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, X, Search, Pencil, Trash2,
  ChevronDown, Users, UsersRound, UserPlus, Check,
} from "lucide-react";
import { AddButton } from "@quikit/ui";
import { useTableCRUD } from "@/lib/hooks/useTableCRUD";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface TeamMember {
  userId:    string;
  firstName: string;
  lastName:  string;
  email:     string;
}

interface OrgTeam {
  id:          string;
  name:        string;
  description: string | null;
  color:       string | null;
  headId:      string | null;
  headName:    string | null;
  memberCount: number;
  members:     TeamMember[];
  createdAt:   string;
}

interface OrgUser {
  userId:    string;
  firstName: string;
  lastName:  string;
  email:     string;
}

type FormState = {
  name:        string;
  description: string;
  color:       string;
  headId:      string;
};

const EMPTY_FORM: FormState = {
  name:        "",
  description: "",
  color:       "#0066cc",
  headId:      "",
};

const PRESET_COLORS = [
  { value: "#0066cc", label: "Blue"   },
  { value: "#7c3aed", label: "Purple" },
  { value: "#059669", label: "Green"  },
  { value: "#dc2626", label: "Red"    },
  { value: "#d97706", label: "Amber"  },
  { value: "#0891b2", label: "Cyan"   },
  { value: "#db2777", label: "Pink"   },
  { value: "#374151", label: "Gray"   },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function avatarBg(name: string) {
  const colors = ["bg-blue-500","bg-purple-500","bg-green-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-red-500","bg-indigo-500"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ─── Member Pill ────────────────────────────────────────────────────────────── */
function MemberPills({ members, max = 5 }: { members: TeamMember[]; max?: number }) {
  if (members.length === 0) return <span className="text-xs text-gray-300">No members yet</span>;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(m => {
        const full = `${m.firstName} ${m.lastName}`;
        return (
          <div
            key={m.userId}
            title={`${full} · ${m.email}`}
            className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(full)}`}
          >
            {initials(m.firstName, m.lastName)}
          </div>
        );
      })}
      {extra > 0 && (
        <span className="h-6 px-1.5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-semibold flex items-center">+{extra}</span>
      )}
    </div>
  );
}

/* ─── Team Panel (Add / Edit) ───────────────────────────────────────────────── */
function TeamPanel({
  open, onClose, onSaved, editTeam, users,
}: {
  open:     boolean;
  onClose:  () => void;
  onSaved:  (t: OrgTeam) => void;
  editTeam: OrgTeam | null;
  users:    OrgUser[];
}) {
  const [form, setForm]         = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [headOpen, setHeadOpen] = useState(false);
  const [headSearch, setHeadSearch] = useState("");
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(editTeam ? {
        name:        editTeam.name,
        description: editTeam.description ?? "",
        color:       editTeam.color ?? "#0066cc",
        headId:      editTeam.headId ?? "",
      } : EMPTY_FORM);
      setError("");
    }
  }, [open, editTeam]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (headRef.current && !headRef.current.contains(e.target as Node)) setHeadOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  const filteredUsers = useMemo(() => {
    const q = headSearch.toLowerCase();
    return users.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [users, headSearch]);

  const selectedHead = users.find(u => u.userId === form.headId);

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Team name is required."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        name:        form.name.trim(),
        description: form.description.trim() || null,
        color:       form.color,
        headId:      form.headId || null,
      };

      const url    = editTeam ? `/api/org/teams/${editTeam.id}` : "/api/org/teams";
      const method = editTeam ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json   = await res.json();
      if (!json.success) { setError(json.error || "Failed to save"); return; }

      onSaved(json.data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[460px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">{editTeam ? "Edit Team" : "Create New Team"}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {editTeam ? "Update team details" : "Set up a new team for your organisation"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Team Name */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Team Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="e.g. Engineering, Sales, Marketing"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Brief description of this team's purpose"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Team Colour</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => set("color", c.value)}
                  className={`h-8 w-8 rounded-full transition-all flex items-center justify-center ${
                    form.color === c.value ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                >
                  {form.color === c.value && (
                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
              {/* Custom colour input */}
              <label title="Custom colour" className="h-8 w-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 overflow-hidden relative">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => set("color", e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <span className="text-gray-400 text-xs pointer-events-none">+</span>
              </label>
            </div>
          </div>

          {/* Team Head */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Team Head <span className="text-gray-400 font-normal">(optional)</span></label>
            <div ref={headRef} className="relative">
              <button
                type="button"
                onClick={() => { setHeadOpen(o => !o); setHeadSearch(""); }}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 text-sm"
              >
                {selectedHead ? (
                  <div className="flex items-center gap-2">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${avatarBg(`${selectedHead.firstName} ${selectedHead.lastName}`)}`}>
                      {initials(selectedHead.firstName, selectedHead.lastName)}
                    </div>
                    <span className="text-gray-700 text-sm">{selectedHead.firstName} {selectedHead.lastName}</span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">Select team head</span>
                )}
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </button>
              {headOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full">
                  <div className="p-2">
                    <input
                      autoFocus
                      value={headSearch}
                      onChange={e => setHeadSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto pb-1">
                    {form.headId && (
                      <button
                        type="button"
                        onClick={() => { set("headId", ""); setHeadOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 italic"
                      >
                        — Clear selection
                      </button>
                    )}
                    {filteredUsers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No users found.</p>
                    ) : filteredUsers.map(u => {
                      const full = `${u.firstName} ${u.lastName}`;
                      return (
                        <button
                          key={u.userId}
                          type="button"
                          onClick={() => { set("headId", u.userId); setHeadOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 ${form.headId === u.userId ? "bg-accent-50" : ""}`}
                        >
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                            {initials(u.firstName, u.lastName)}
                          </div>
                          <div>
                            <span className={`block text-sm ${form.headId === u.userId ? "text-accent-600 font-medium" : "text-gray-700"}`}>{full}</span>
                            <span className="block text-[10px] text-gray-400">{u.email}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Preview</p>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: form.color }}>
                {(form.name[0] ?? "T").toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{form.name || "Team Name"}</p>
                {form.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{form.description}</p>}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : editTeam ? "Update Team" : "Create Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Dialog ─────────────────────────────────────────────────────────── */
function ConfirmDialog({
  open, teamName, onConfirm, onCancel,
}: {
  open:      boolean;
  teamName:  string;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-full">
        <h3 className="text-sm font-bold text-gray-900 mb-2">Delete Team?</h3>
        <p className="text-xs text-gray-500 mb-5">
          <span className="font-semibold text-gray-700">{teamName}</span> will be permanently deleted.
          Members assigned to this team will be unassigned but not removed from the organisation.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Member Picker Panel ───────────────────────────────────────────────────── */
function MemberPickerPanel({
  open, onClose, team, allUsers, onSaved,
}: {
  open:     boolean;
  onClose:  () => void;
  team:     OrgTeam | null;
  allUsers: OrgUser[];
  onSaved:  (updatedTeam: OrgTeam) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch("");
      setError("");
    }
  }, [open]);

  // Users not already on this team
  const existingUserIds = useMemo(
    () => new Set((team?.members ?? []).map(m => m.userId)),
    [team]
  );
  const available = useMemo(() => {
    const q = search.toLowerCase();
    return allUsers
      .filter(u => !existingUserIds.has(u.userId))
      .filter(u =>
        !q ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
  }, [allUsers, existingUserIds, search]);

  function toggle(userId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    if (!team || selected.size === 0) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/org/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to add members"); return; }
      if (json.data?.team) onSaved(json.data.team);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open || !team) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[460px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">Add members to {team.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Select one or more users to add to this team
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
          {selected.size > 0 && (
            <p className="text-[11px] text-gray-500 mt-2">
              {selected.size} user{selected.size !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-gray-300" />
              </div>
              <p className="text-xs text-gray-400">
                {search ? "No matching users" : "All users are already on this team"}
              </p>
            </div>
          ) : (
            available.map(u => {
              const full = `${u.firstName} ${u.lastName}`;
              const isSelected = selected.has(u.userId);
              return (
                <button
                  key={u.userId}
                  onClick={() => toggle(u.userId)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isSelected ? "bg-accent-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium text-gray-800 truncate">{full}</p>
                    <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-accent-600 border-accent-600" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Adding…" : `Add ${selected.size || ""} member${selected.size !== 1 ? "s" : ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function OrgTeamsPage() {
  const crud = useTableCRUD<OrgTeam>({
    apiEndpoint: "/api/org/teams",
    searchFields: ["name"],
  });

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickerTeam, setPickerTeam] = useState<OrgTeam | null>(null);

  // Fetch users alongside teams
  useEffect(() => {
    fetch("/api/org/users").then(r => r.json()).then(json => {
      if (json.success) setUsers(json.data.map((u: OrgUser) => ({
        userId: u.userId, firstName: u.firstName, lastName: u.lastName, email: u.email,
      })));
    });
  }, []);

  // Also match description in search
  const filtered = useMemo(() => {
    if (!crud.search.trim()) return crud.items;
    const q = crud.search.toLowerCase();
    return crud.items.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  }, [crud.items, crud.search]);

  function handleSaved(team: OrgTeam) {
    crud.setItems(prev => {
      const idx = prev.findIndex(t => t.id === team.id);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], ...team }; return next;
      }
      return [...prev, team];
    });
  }

  async function handleRemoveMember(team: OrgTeam, userId: string) {
    const res  = await fetch(`/api/org/teams/${team.id}/members/${userId}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) return;
    crud.setItems(prev => prev.map(t =>
      t.id === team.id
        ? { ...t, members: t.members.filter(m => m.userId !== userId), memberCount: Math.max(0, t.memberCount - 1) }
        : t
    ));
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent-100 flex items-center justify-center">
            <UsersRound className="h-4 w-4 text-accent-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Teams</h1>
            <p className="text-xs text-gray-400">{crud.items.length} team{crud.items.length !== 1 ? "s" : ""} in this organisation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={crud.search}
              onChange={e => crud.setSearch(e.target.value)}
              placeholder="Search teams…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>
          <AddButton onClick={() => crud.openCreate()}>
            New Team
          </AddButton>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {crud.loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">No teams yet</p>
            <p className="text-xs text-gray-400">Click <span className="font-semibold">New Team</span> to create your first team.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(team => {
              const isExpanded = expanded.has(team.id);
              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  {/* Team row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Color + icon */}
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                      style={{ backgroundColor: team.color ?? "#0066cc" }}
                    >
                      {team.name[0].toUpperCase()}
                    </div>

                    {/* Name + desc */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{team.description}</p>
                      )}
                    </div>

                    {/* Head */}
                    <div className="hidden md:flex flex-col items-end min-w-[120px]">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Head</span>
                      <span className="text-xs text-gray-700 mt-0.5 font-medium">
                        {team.headName ?? <span className="text-gray-300">—</span>}
                      </span>
                    </div>

                    {/* Members count + avatars */}
                    <div className="hidden lg:flex flex-col items-end min-w-[160px]">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Members</span>
                      {team.memberCount === 0 ? (
                        <span className="text-xs text-gray-300">No members</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <MemberPills members={team.members} />
                          <span className="text-[10px] text-gray-400 ml-1">{team.memberCount}</span>
                        </div>
                      )}
                    </div>

                    {/* Created */}
                    <div className="hidden xl:flex flex-col items-end min-w-[100px]">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Created</span>
                      <span className="text-xs text-gray-500 mt-0.5">{formatDate(team.createdAt)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {team.memberCount > 0 && (
                        <button
                          onClick={() => toggleExpand(team.id)}
                          title={isExpanded ? "Hide members" : "Show members"}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                      <button
                        onClick={() => setPickerTeam(team)}
                        title="Add member"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => crud.openEdit(team)}
                        title="Edit"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => crud.setDeleteTarget(team)}
                        title="Delete"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded members list */}
                  {isExpanded && team.members.length > 0 && (
                    <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Team Members</p>
                        <button
                          onClick={() => setPickerTeam(team)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-md transition-colors"
                        >
                          <UserPlus className="h-3 w-3" /> Add member
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                        {team.members.map(m => {
                          const full = `${m.firstName} ${m.lastName}`;
                          return (
                            <div key={m.userId} className="group flex items-center gap-2 py-1 pr-1 rounded hover:bg-white transition-colors">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                                {initials(m.firstName, m.lastName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-700 truncate">{full}</p>
                                <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                              </div>
                              <button
                                onClick={() => handleRemoveMember(team, m.userId)}
                                title={`Remove ${full} from team`}
                                className="h-5 w-5 flex items-center justify-center rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Panel ── */}
      <TeamPanel
        open={crud.panelOpen}
        onClose={crud.closePanel}
        onSaved={handleSaved}
        editTeam={crud.editItem}
        users={users}
      />

      {/* ── Member Picker ── */}
      <MemberPickerPanel
        open={!!pickerTeam}
        onClose={() => setPickerTeam(null)}
        team={pickerTeam}
        allUsers={users}
        onSaved={(updated) => {
          handleSaved(updated);
          // Keep the row expanded so the user sees the newly added members
          setExpanded(prev => new Set(prev).add(updated.id));
        }}
      />

      {/* ── Confirm Delete ── */}
      <ConfirmDialog
        open={!!crud.deleteTarget}
        teamName={crud.deleteTarget?.name ?? ""}
        onConfirm={() => crud.confirmDelete()}
        onCancel={() => crud.setDeleteTarget(null)}
      />
    </div>
  );
}
