"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Search, Pencil, UserMinus, UserCheck,
  ChevronDown, Users, User as UserIcon, Check,
} from "lucide-react";
import { useTableCRUD } from "@/lib/hooks/useTableCRUD";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface OrgUser {
  membershipId: string;
  userId:       string;
  firstName:    string;
  lastName:     string;
  email:        string;
  avatar:       string | null;
  role:         string;
  teamId:       string | null;
  teamIds:      string[];
  teamNames:    string[];
  status:       string;
  lastSignInAt: string | null;
  joinedAt:     string;
}

interface OrgTeam { id: string; name: string; }

type FormState = {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  role:      string;
  teamIds:   string[];
  status:    string;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName:  "",
  email:     "",
  password:  "",
  role:      "member",
  teamIds:   [],
  status:    "active",
};

const ROLES = [
  { value: "admin",   label: "Admin",   color: "bg-purple-100 text-purple-700" },
  { value: "manager", label: "Manager", color: "bg-accent-100 text-accent-700"     },
  { value: "member",  label: "Member",  color: "bg-gray-100 text-gray-600"     },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function avatarColor(name: string) {
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
    "bg-pink-500",  "bg-teal-500",  "bg-red-500",   "bg-indigo-500",
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find(x => x.value === role) ?? ROLES[2];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${r.color}`}>
      {r.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600"><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />Active</span>;
  if (status === "inactive")
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-gray-300 inline-block" />Inactive</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />Pending</span>;
}

function formatSignIn(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ─── Multi-Team Picker ──────────────────────────────────────────────────────── */
function TeamPicker({ selectedIds, teams, onChange }: {
  selectedIds: string[];
  teams: OrgTeam[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function toggle(id: string) {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    );
  }

  const label = selectedIds.length === 0
    ? "No teams"
    : selectedIds.length === 1
      ? teams.find(t => t.id === selectedIds[0])?.name ?? "1 team"
      : `${selectedIds.length} teams`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 text-sm"
      >
        <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
          {selectedIds.length === 0 ? (
            <span className="text-gray-400">No teams</span>
          ) : (
            selectedIds.map(id => {
              const t = teams.find(x => x.id === id);
              return t ? (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-100 text-accent-700 text-[11px] font-semibold rounded-full">
                  {t.name}
                  <span
                    role="button"
                    onMouseDown={e => { e.stopPropagation(); toggle(id); }}
                    className="cursor-pointer text-accent-400 hover:text-accent-700 leading-none"
                  >×</span>
                </span>
              ) : null;
            })
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full max-h-52 overflow-y-auto">
          {teams.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">No teams available</p>
          ) : teams.map(t => {
            const checked = selectedIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${checked ? "bg-accent-50" : ""}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  checked ? "bg-accent-600 border-accent-600" : "border-gray-300"
                }`}>
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                <span className={`text-sm ${checked ? "text-accent-700 font-medium" : "text-gray-700"}`}>{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── User Panel (Add / Edit) ───────────────────────────────────────────────── */
function UserPanel({
  open, onClose, onSaved, editUser, teams,
}: {
  open:     boolean;
  onClose:  () => void;
  onSaved:  (u: OrgUser) => void;
  editUser: OrgUser | null;
  teams:    OrgTeam[];
}) {
  const [form, setForm]     = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(editUser ? {
        firstName: editUser.firstName,
        lastName:  editUser.lastName,
        email:     editUser.email,
        password:  "",
        role:      editUser.role,
        teamIds:   editUser.teamIds ?? (editUser.teamId ? [editUser.teamId] : []),
        status:    editUser.status,
      } : EMPTY_FORM);
      setError("");
    }
  }, [open, editUser]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.firstName.trim()) { setError("First name is required.");  return; }
    if (!form.lastName.trim())  { setError("Last name is required.");   return; }
    if (!form.email.trim())     { setError("Email is required.");       return; }
    if (!editUser && !form.password.trim()) { setError("Password is required for new users."); return; }

    setSaving(true); setError("");
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        role:      form.role,
        teamIds:   form.teamIds,
      };
      if (!editUser) payload.password = form.password;
      if (editUser && form.password.trim()) payload.password = form.password;
      if (editUser) payload.status = form.status;

      const url    = editUser ? `/api/org/users/${editUser.userId}` : "/api/org/users";
      const method = editUser ? "PUT" : "POST";
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

  const selectedRole = ROLES.find(r => r.value === form.role) ?? ROLES[2];

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">{editUser ? "Edit User" : "Add New User"}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {editUser ? "Update user details and team memberships" : "Create a user account and assign to teams"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">First Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.firstName} onChange={e => set("firstName", e.target.value)}
                placeholder="Jane"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Last Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.lastName} onChange={e => set("lastName", e.target.value)}
                placeholder="Smith"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Email Address <span className="text-red-400">*</span></label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
              placeholder="jane@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400" />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Password {editUser ? <span className="text-gray-400 font-normal">(leave blank to keep unchanged)</span> : <span className="text-red-400">*</span>}
            </label>
            <input type="password" value={form.password} onChange={e => set("password", e.target.value)}
              placeholder={editUser ? "Enter new password to change" : "Set a password"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400" />
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Role <span className="text-red-400">*</span></label>
            <div ref={roleRef} className="relative">
              <button type="button" onClick={() => setRoleOpen(o => !o)}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${selectedRole.color}`}>
                  {selectedRole.label}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              {roleOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full">
                  {ROLES.map(r => (
                    <button key={r.value} type="button"
                      onClick={() => { set("role", r.value); setRoleOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${form.role === r.value ? "bg-accent-50" : ""}`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${r.color}`}>{r.label}</span>
                      {r.value === "admin"   && <span className="text-xs text-gray-400">Full access</span>}
                      {r.value === "manager" && <span className="text-xs text-gray-400">Manage team data</span>}
                      {r.value === "member"  && <span className="text-xs text-gray-400">View &amp; edit own data</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Teams (multi-select) */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Teams <span className="text-gray-400 font-normal">(select one or more)</span>
            </label>
            <TeamPicker
              selectedIds={form.teamIds}
              teams={teams}
              onChange={ids => set("teamIds", ids)}
            />
          </div>

          {/* Status (edit only) */}
          {editUser && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Status</label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                {["active", "inactive"].map(s => (
                  <button key={s} type="button" onClick={() => set("status", s)}
                    className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${
                      form.status === s
                        ? s === "active" ? "bg-green-500 text-white" : "bg-gray-400 text-white"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 px-4 py-2 rounded-lg disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : editUser ? "Update User" : "Add User"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Dialog ─────────────────────────────────────────────────────────── */
function ConfirmDialog({
  open, title, message, onConfirm, onCancel, dangerous = true,
}: {
  open:      boolean;
  title:     string;
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  dangerous?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-full">
        <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-xs text-gray-500 mb-5">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg ${dangerous ? "bg-red-500 hover:bg-red-600" : "bg-accent-600 hover:bg-accent-700"}`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function OrgUsersPage() {
  const crud = useTableCRUD<OrgUser>({
    apiEndpoint: "/api/org/users",
    idKey: "userId",
    searchFields: ["firstName", "lastName", "email"],
  });

  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [roleFilter, setRoleFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [filterOpen, setFilterOpen]     = useState(false);
  const [confirmUser, setConfirmUser]   = useState<OrgUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<"remove" | "reactivate">("remove");
  const filterRef = useRef<HTMLDivElement>(null);

  // Fetch teams alongside users
  useEffect(() => {
    fetch("/api/org/teams").then(r => r.json()).then(json => {
      if (json.success) setTeams(json.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    });
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Apply role/status filters on top of hook's search-filtered results
  const filtered = useMemo(() => {
    let list = crud.search.trim()
      ? crud.items.filter(u => {
          const q = crud.search.toLowerCase();
          return `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        })
      : crud.items;
    if (statusFilter) list = list.filter(u => u.status === statusFilter);
    if (roleFilter) list = list.filter(u => u.role === roleFilter);
    return list;
  }, [crud.items, crud.search, roleFilter, statusFilter]);

  function handleSaved(user: OrgUser) {
    crud.setItems(prev => {
      const idx = prev.findIndex(u => u.userId === user.userId);
      if (idx >= 0) { const next = [...prev]; next[idx] = user; return next; }
      return [...prev, user];
    });
  }

  async function handleStatusChange(user: OrgUser, newStatus: "inactive" | "active") {
    const res  = await fetch(`/api/org/users/${user.userId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (json.success) handleSaved(json.data);
    setConfirmUser(null);
  }

  const activeCount = crud.items.filter(u => u.status === "active").length;
  const filterCount = (roleFilter ? 1 : 0) + (statusFilter !== "active" ? 1 : 0);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent-100 flex items-center justify-center">
            <Users className="h-4 w-4 text-accent-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Users</h1>
            <p className="text-xs text-gray-400">{activeCount} active member{activeCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={crud.search} onChange={e => crud.setSearch(e.target.value)} placeholder="Search users…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-48" />
          </div>

          {/* Filter */}
          <div ref={filterRef} className="relative">
            <button onClick={() => setFilterOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg ${
                filterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}>
              Filter
              {filterCount > 0 && (
                <span className="ml-0.5 bg-accent-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{filterCount}</span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Status</p>
                  <div className="space-y-1">
                    {[{ v: "", l: "All" }, { v: "active", l: "Active" }, { v: "inactive", l: "Inactive" }].map(({ v, l }) => (
                      <button key={v} onClick={() => setStatusFilter(v)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${statusFilter === v ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Role</p>
                  <div className="space-y-1">
                    <button onClick={() => setRoleFilter("")}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${!roleFilter ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                      All roles
                    </button>
                    {ROLES.map(r => (
                      <button key={r.value} onClick={() => setRoleFilter(r.value)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${roleFilter === r.value ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Add User */}
          <button onClick={() => crud.openCreate()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> Add User
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 860 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["User", "Email", "Role", "Teams", "Status", "Last Sign In", "Actions"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {crud.loading ? (
              <tr><td colSpan={7} className="text-center py-16 text-sm text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <UserIcon className="h-8 w-8 text-gray-200" />
                    <p className="text-sm text-gray-400 font-medium">No users found</p>
                    {!crud.search && <p className="text-xs text-gray-400">Click <span className="font-semibold">Add User</span> to invite someone.</p>}
                  </div>
                </td>
              </tr>
            ) : filtered.map(u => {
              const full  = `${u.firstName} ${u.lastName}`;
              const color = avatarColor(full);
              const teamNames = u.teamNames?.length ? u.teamNames : (u.teamId ? ["—"] : []);
              return (
                <tr key={u.userId} className="hover:bg-gray-50/60 transition-colors group">
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${color}`}>
                        {initials(u.firstName, u.lastName)}
                      </div>
                      <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{full}</span>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                  {/* Role */}
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  {/* Teams — chips */}
                  <td className="px-4 py-3">
                    {teamNames.length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {teamNames.map((name, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  {/* Last Sign In */}
                  <td className="px-4 py-3 text-xs text-gray-400">{formatSignIn(u.lastSignInAt)}</td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => crud.openEdit(u)} title="Edit"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {u.status === "active" ? (
                        <button onClick={() => { setConfirmUser(u); setConfirmAction("remove"); }} title="Deactivate"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => { setConfirmUser(u); setConfirmAction("reactivate"); }} title="Reactivate"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Panel ── */}
      <UserPanel open={crud.panelOpen} onClose={crud.closePanel} onSaved={handleSaved} editUser={crud.editItem} teams={teams} />

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        open={!!confirmUser}
        title={confirmAction === "remove" ? "Deactivate User?" : "Reactivate User?"}
        message={
          confirmAction === "remove"
            ? `${confirmUser?.firstName} ${confirmUser?.lastName} will no longer have access. You can reactivate them at any time.`
            : `${confirmUser?.firstName} ${confirmUser?.lastName} will regain full access to the organisation.`
        }
        dangerous={confirmAction === "remove"}
        onCancel={() => setConfirmUser(null)}
        onConfirm={() => confirmUser && handleStatusChange(confirmUser, confirmAction === "remove" ? "inactive" : "active")}
      />
    </div>
  );
}
