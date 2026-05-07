"use client";

/**
 * Roles & Permissions — Manage Permission UI.
 *
 * Layout:
 *   ┌── Roles list (left, 280px) ─┬── Permissions panel (right, flex-1) ──┐
 *   │  Roles  [+]                 │  Permissions                          │
 *   │  ✓ admin (system, locked)   │  Tabs: Entities | Navigation          │
 *   │    User                  🗑  │  Entities tab → resource × CRUD grid  │
 *   │    Manager               🗑  │  Navigation tab → navKey × view list  │
 *   └─────────────────────────────┴───────────────────────────────────────┘
 *
 * Saving uses atomic-replace on PUT — the server always receives the full
 * desired state, never an incremental delta. Keeps the UI logic dumb.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shield, Trash2, Check, X, AlertCircle, ArrowLeft, ChevronRight, Info } from "lucide-react";
import { ACTIONS, RESOURCES, NAV_ITEMS, type Resource, type Action } from "@quikit/shared";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { permissions: number; navigations: number; members: number };
}

type Tab = "entities" | "navigation";

const RESOURCE_LABELS: Record<Resource, string> = {
  WWW: "WWW",
  Team: "Teams",
  Individual: "Individual",
  TeamKPI: "Team KPI",
  Quarter: "Quarter",
  Priority: "Priority",
  User: "User",
  ClientMaster: "Client Master",
  ClientMember: "Client Members",
  DailyHuddle: "Daily Huddle",
  WeeklyMeeting: "Weekly Meeting",
  OPSP: "OPSP",
};

const ACTION_LABELS: Record<Action, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  view: "View",
};

function permKey(resource: string, action: string) {
  return `${resource}:${action}`;
}

export default function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("entities");

  // Live editable state of the selected role's grants. Loaded fresh on
  // role switch so cancellation just re-fetches.
  const [grantSet, setGrantSet] = useState<Set<string>>(new Set());
  const [navSet, setNavSet] = useState<Set<string>>(new Set());
  const [loadedRoleId, setLoadedRoleId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  // ── Load roles list on mount ─────────────────────────────────────────────
  useEffect(() => {
    void fetchRoles(/* selectFirst */ true);
  }, []);

  async function fetchRoles(selectFirst = false) {
    setLoading(true);
    try {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      if (json.success) {
        setRoles(json.data);
        if (selectFirst && json.data.length > 0 && selectedRoleId == null) {
          setSelectedRoleId(json.data[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Load permissions + navigation when role switches ─────────────────────
  useEffect(() => {
    if (!selectedRoleId) {
      setGrantSet(new Set());
      setNavSet(new Set());
      setLoadedRoleId(null);
      setDirty(false);
      return;
    }
    let alive = true;
    (async () => {
      const [pRes, nRes] = await Promise.all([
        fetch(`/api/org/roles/${selectedRoleId}/permissions`).then((r) => r.json()),
        fetch(`/api/org/roles/${selectedRoleId}/navigation`).then((r) => r.json()),
      ]);
      if (!alive) return;
      const grants: string[] = pRes.success
        ? pRes.data.permissions.map((p: { resource: string; action: string }) =>
            permKey(p.resource, p.action),
          )
        : [];
      const navs: string[] = nRes.success ? nRes.data.navKeys : [];
      setGrantSet(new Set(grants));
      setNavSet(new Set(navs));
      setLoadedRoleId(selectedRoleId);
      setDirty(false);
      setErrorMsg(null);
    })();
    return () => {
      alive = false;
    };
  }, [selectedRoleId]);

  function toggleGrant(resource: Resource, action: Action) {
    if (selectedRole?.isSystem) return;
    setGrantSet((prev) => {
      const next = new Set(prev);
      const k = permKey(resource, action);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setDirty(true);
  }

  function toggleResourceRow(resource: Resource) {
    if (selectedRole?.isSystem) return;
    // If all four actions for this resource are already on, turn the row OFF.
    // Otherwise turn the row fully ON (idempotent bulk toggle).
    setGrantSet((prev) => {
      const next = new Set(prev);
      const allOn = ACTIONS.every((a) => next.has(permKey(resource, a)));
      ACTIONS.forEach((a) => {
        const k = permKey(resource, a);
        if (allOn) next.delete(k);
        else next.add(k);
      });
      return next;
    });
    setDirty(true);
  }

  function toggleNav(navKey: string) {
    if (selectedRole?.isSystem) return;
    setNavSet((prev) => {
      const next = new Set(prev);
      if (next.has(navKey)) next.delete(navKey);
      else next.add(navKey);
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!selectedRole || selectedRole.isSystem || !dirty) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      // PUT both endpoints in parallel — independent atomic replaces.
      const permissions = Array.from(grantSet).map((k) => {
        const [resource, action] = k.split(":");
        return { resource, action };
      });
      const navKeys = Array.from(navSet);

      const [pRes, nRes] = await Promise.all([
        fetch(`/api/org/roles/${selectedRole.id}/permissions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions }),
        }).then((r) => r.json()),
        fetch(`/api/org/roles/${selectedRole.id}/navigation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ navKeys }),
        }).then((r) => r.json()),
      ]);

      if (!pRes.success || !nRes.success) {
        setErrorMsg(
          (pRes.error as string | undefined) ||
            (nRes.error as string | undefined) ||
            "Save failed",
        );
        return;
      }

      setDirty(false);
      // Refresh the role list so counts update.
      void fetchRoles();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/org/roles/${confirmDelete.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      setConfirmDelete(null);
      // Switch off the deleted role.
      if (selectedRoleId === confirmDelete.id) {
        setSelectedRoleId(roles.find((r) => r.id !== confirmDelete.id)?.id ?? null);
      }
      void fetchRoles();
    } else {
      setErrorMsg(json.error ?? "Failed to delete role");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const navByGroup = useMemo(() => {
    const groups: Record<string, typeof NAV_ITEMS[number][]> = {};
    NAV_ITEMS.forEach((n) => {
      (groups[n.group] ??= []).push(n);
    });
    return groups;
  }, []);

  return (
    // h-full + flex column → page itself fills the dashboard <main>'s visible
    // area (which is overflow-y-auto). Combined with `flex-1 min-h-0` on the
    // container below, page-level scroll is OFF and overflow is routed into
    // the matrix area inside the right pane only. Page header, role list,
    // tab bar, and the Save button all stay pinned.
    <div className="p-6 h-full flex flex-col">
      <header className="mb-4 flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => router.push("/org-setup/roles")}
          className="h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center"
          title="Back to Users"
          aria-label="Back to Users"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Manage Permission</h1>
      </header>

      {/* Two-pane container — fills remaining vertical space.
          - Aside (left) keeps its own internal scroll on the role <ul>.
          - Section (right) is a flex column that pins header/tabs/info banner
            and only scrolls the matrix area. */}
      <div className="flex gap-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex-1 min-h-0">
        {/* ── Roles list (left) ──────────────────────────────────────── */}
        <aside className="w-[280px] border-r border-gray-100 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Roles</h2>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="h-7 w-7 rounded-full bg-accent-50 hover:bg-accent-100 text-accent-700 flex items-center justify-center"
              title="Add new role"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <ul className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <li className="px-4 py-3 text-xs text-gray-400">Loading…</li>
            ) : roles.length === 0 ? (
              <li className="px-4 py-3 text-xs text-gray-400">No roles. Click + to add one.</li>
            ) : (
              roles.map((r) => {
                const active = r.id === selectedRoleId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm border-l-2 transition-colors ${
                        active
                          ? "bg-accent-50 text-accent-700 border-accent-500 font-medium"
                          : "border-transparent text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {r.isSystem ? (
                        <Shield className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <span className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate">{r.name}</span>
                      {r.isDefault && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                          DEFAULT
                        </span>
                      )}
                      {!r.isSystem && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(r);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmDelete(r);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer"
                          title="Delete role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* ── Permissions panel (right) ──────────────────────────────── */}
        <section className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Pinned strip — always visible regardless of matrix scroll. */}
          <header className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">
              {selectedRole ? `Permissions — ${selectedRole.name}` : "Permissions"}
            </h2>
            {selectedRole && !selectedRole.isSystem && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className={`text-xs px-3 py-1.5 rounded-md font-medium ${
                  dirty && !saving
                    ? "bg-accent-600 hover:bg-accent-700 text-white"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
            )}
          </header>

          {!selectedRole ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
              Select a role to manage permissions
            </div>
          ) : selectedRole.isSystem ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-8 py-16 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <Shield className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800 capitalize">
                {selectedRole.name === "admin" ? "Administrator Role" : `${selectedRole.name} Role`}
              </p>
              <p className="text-xs text-gray-500 mt-1.5 max-w-[420px] leading-relaxed">
                {selectedRole.name === "admin"
                  ? "This role has full administrative privileges and access to all permissions."
                  : `The ${selectedRole.name} role has full access to all features by default and cannot be edited or deleted. Permission checks bypass the matrix entirely for this role.`}
              </p>
            </div>
          ) : loadedRoleId !== selectedRole.id ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
          ) : (
            <>
              {/* Tabs — pinned */}
              <nav className="px-5 border-b border-gray-100 flex items-center gap-4 flex-shrink-0">
                {(["entities", "navigation"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-1 py-2.5 text-xs font-medium border-b-2 -mb-px ${
                      tab === t
                        ? "border-accent-500 text-accent-700"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t === "entities" ? "Entities" : "Navigation"}
                  </button>
                ))}
              </nav>

              {errorMsg && (
                <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 flex-shrink-0">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Info banner — pinned above the scroll. Always visible while
                  the user scrolls through the entity / nav list below. */}
              <div className="px-5 pt-3 flex-shrink-0">
                <div className="flex items-start gap-2 rounded-md bg-gray-900 text-gray-100 text-[11px] px-3 py-2">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                  <span>
                    Tick the action that this role can perform on each entity. The role can also be limited
                    to specific sidebar items via the <strong>Navigation</strong> tab.
                  </span>
                </div>
              </div>

              {/* Scroll region — ONLY the matrix scrolls. min-h-0 is required
                  for flexbox to actually clip the child instead of stretching. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-5">
                {tab === "entities" ? (
                  <EntitiesGrid grants={grantSet} onToggle={toggleGrant} onToggleRow={toggleResourceRow} />
                ) : (
                  <NavigationList
                    navByGroup={navByGroup}
                    selected={navSet}
                    onToggle={toggleNav}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Add Role modal ─────────────────────────────────────────────── */}
      {addOpen && (
        <AddRoleModal
          onClose={() => setAddOpen(false)}
          onCreated={(role) => {
            setAddOpen(false);
            setRoles((prev) => [...prev, role]);
            setSelectedRoleId(role.id);
          }}
        />
      )}

      {/* ── Confirm delete ─────────────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDeleteModal
          role={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={handleDeleteRole}
        />
      )}
    </div>
  );
}

// ── Entities grid ─────────────────────────────────────────────────────────

function EntitiesGrid({
  grants,
  onToggle,
  onToggleRow,
}: {
  grants: Set<string>;
  onToggle: (resource: Resource, action: Action) => void;
  onToggleRow: (resource: Resource) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Column header strip aligns with the cards below.
          Layout: [chevron + name + badge | flex-1] [action col × 4 (88px each)] */}
      <div className="flex items-center px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <span className="flex-1" />
        {ACTIONS.map((a) => (
          <span key={a} className="w-[88px] text-center">{ACTION_LABELS[a]}</span>
        ))}
      </div>

      {RESOURCES.map((r) => {
        const grantedActions = ACTIONS.filter((a) => grants.has(permKey(r, a)));
        const someOn = grantedActions.length > 0;
        return (
          <div
            key={r}
            className="flex items-center gap-2 border border-gray-200 rounded-lg bg-white px-4 py-2.5 hover:border-gray-300 transition-colors"
          >
            {/* Entity label — clickable bulk-toggle for the whole row */}
            <button
              type="button"
              onClick={() => onToggleRow(r)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
              title={grantedActions.length === ACTIONS.length ? "Clear row" : "Grant all in row"}
            >
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-800 truncate">
                {RESOURCE_LABELS[r]}
              </span>
              {someOn && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-semibold leading-none">
                  {grantedActions.length}
                </span>
              )}
            </button>

            {/* Action checkboxes */}
            {ACTIONS.map((a) => {
              const on = grants.has(permKey(r, a));
              return (
                <label
                  key={a}
                  className="w-[88px] flex items-center justify-center cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(r, a)}
                    className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                  />
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Navigation list ───────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  main: "Main",
  kpi: "KPI",
  org: "Org Setup",
  meeting: "Meeting Rhythm",
  performance: "Performance",
  opsp: "OPSP",
};

function NavigationList({
  navByGroup,
  selected,
  onToggle,
}: {
  navByGroup: Record<string, typeof NAV_ITEMS[number][]>;
  selected: Set<string>;
  onToggle: (navKey: string) => void;
}) {
  return (
    <div className="space-y-4">
      {Object.entries(navByGroup).map(([group, items]) => (
        <fieldset key={group} className="border border-gray-200 rounded-lg overflow-hidden">
          <legend className="px-2 ml-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {GROUP_LABELS[group] ?? group}
          </legend>
          <ul>
            {items.map((n) => {
              const on = selected.has(n.key);
              return (
                <li
                  key={n.key}
                  className="border-t border-gray-100 first:border-t-0 hover:bg-gray-50/40"
                >
                  <label className="flex items-center justify-between gap-3 px-4 py-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs text-gray-800">
                      {on ? (
                        <Check className="h-3.5 w-3.5 text-accent-600" />
                      ) : (
                        <span className="h-3.5 w-3.5" />
                      )}
                      {n.label}
                      <span className="text-[10px] text-gray-400 font-mono">{n.key}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(n.key)}
                      className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

// ── Add Role modal ────────────────────────────────────────────────────────

function AddRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (role: Role) => void;
}) {
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/org/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), isDefault }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to create role");
        return;
      }
      onCreated(json.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Add New Role</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="e.g. Manager"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-300"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
            />
            Make this the default role for newly invited users
          </label>

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-accent-600 hover:bg-accent-700 text-white font-medium disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add Role"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────

function ConfirmDeleteModal({
  role,
  onClose,
  onConfirm,
}: {
  role: Role;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const memberCount = role._count?.members ?? 0;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Delete role?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4">
          <p className="text-sm text-gray-700">
            Delete <strong>{role.name}</strong>? This cannot be undone.
          </p>
          {memberCount > 0 && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {memberCount} user{memberCount === 1 ? "" : "s"} will lose this role assignment and need to be
              reassigned.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            Delete
          </button>
        </footer>
      </div>
    </div>
  );
}

