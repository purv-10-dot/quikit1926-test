"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { Plus, Shield, ShieldCheck, Trash2, Pencil, Search, X, CheckSquare, Square } from "lucide-react";
import {
  PERMISSION_TREE,
  NAV_TREE,
  ACTIONS,
  type Action,
} from "@/lib/rbac/permissions-tree";

/**
 * Roles & Permissions page — quikscale v2 layout.
 *
 *   Roles (left panel)        Permissions — {roleName}     (right panel)
 *   ─────────────────         ───────────────────────────────
 *   admin           DEFAULT   [Entities] [Navigation]
 *   hr_admin
 *   …                          Module       VIEW CREATE UPDATE DELETE
 *                              Dashboard    [ ]  —      —      —
 *                              KPI          [✓]  [✓]    [✓]    [✓]   …
 *
 * Save commits Entities + Navigation in one click.
 */

interface RoleItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: { code: string }[]; // server returns PermissionDef[] (back-compat)
  employeeCount: number;
}

export default function RolesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [tab, setTab] = useState<"entities" | "navigation">("entities");
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [draftNav, setDraftNav] = useState<Set<string>>(new Set());

  const { data: rolesResp } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<RoleItem[]>("/api/v1/hrms/settings/roles"),
  });
  const roles = rolesResp?.data ?? [];

  const active = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null;
  useEffect(() => {
    if (active && !selectedRoleId) setSelectedRoleId(active.id);
  }, [active, selectedRoleId]);

  const { data: navResp } = useQuery({
    queryKey: ["role-nav", active?.id],
    queryFn: () => api.get<{ navKeys: string[] }>(`/api/v1/hrms/settings/roles/${active!.id}/navigation`),
    enabled: !!active,
  });

  // Sync draft state when active role changes.
  useEffect(() => {
    if (!active) {
      setDraftPerms(new Set());
      return;
    }
    setDraftPerms(new Set(active.permissions.map((p) => p.code)));
  }, [active?.id, active?.permissions]);

  useEffect(() => {
    setDraftNav(new Set(navResp?.data?.navKeys ?? []));
  }, [navResp?.data?.navKeys, active?.id]);

  // ── Mutations ────────────────────────────────────────────
  const savePermsMut = useMutation({
    mutationFn: (codes: string[]) =>
      api.put(`/api/v1/hrms/settings/roles/${active!.id}/permissions`, { permissions: codes }),
  });
  const saveNavMut = useMutation({
    mutationFn: (navKeys: string[]) =>
      api.put(`/api/v1/hrms/settings/roles/${active!.id}/navigation`, { navKeys }),
  });
  const createRoleMut = useMutation({
    mutationFn: (body: { name: string; description: string; isDefault: boolean }) =>
      api.post<RoleItem>("/api/v1/hrms/settings/roles", body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["roles"] }); qc.invalidateQueries({ queryKey: ["settings", "roles"] }); qc.invalidateQueries({ queryKey: ["users-permissions"] });
      setSelectedRoleId(r.data.id);
      setShowCreate(false);
    },
  });
  const updateRoleMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; description: string; isDefault: boolean } }) =>
      api.patch(`/api/v1/hrms/settings/roles/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] }); qc.invalidateQueries({ queryKey: ["settings", "roles"] }); qc.invalidateQueries({ queryKey: ["users-permissions"] });
      setEditingRole(null);
    },
  });
  const deleteRoleMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["settings", "roles"] });
      qc.invalidateQueries({ queryKey: ["users-permissions"] });
    },
  });

  const savedPerms = useMemo(
    () => new Set(active?.permissions.map((p) => p.code) ?? []),
    [active?.permissions],
  );
  const savedNav = useMemo(() => new Set(navResp?.data?.navKeys ?? []), [navResp?.data?.navKeys]);

  const isDirty = useMemo(() => {
    if (!active) return false;
    if (savedPerms.size !== draftPerms.size) return true;
    for (const c of savedPerms) if (!draftPerms.has(c)) return true;
    if (savedNav.size !== draftNav.size) return true;
    for (const n of savedNav) if (!draftNav.has(n)) return true;
    return false;
  }, [savedPerms, draftPerms, savedNav, draftNav, active]);

  async function saveAll() {
    if (!active) return;
    try {
      await Promise.all([
        savePermsMut.mutateAsync(Array.from(draftPerms)),
        saveNavMut.mutateAsync(Array.from(draftNav)),
      ]);
      await qc.invalidateQueries({ queryKey: ["roles"] }); qc.invalidateQueries({ queryKey: ["settings", "roles"] }); qc.invalidateQueries({ queryKey: ["users-permissions"] });
      await qc.invalidateQueries({ queryKey: ["role-nav", active.id] });
      toast.success("Role saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  const togglePerm = (code: string) => {
    const next = new Set(draftPerms);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setDraftPerms(next);
  };

  const toggleNav = (key: string) => {
    const next = new Set(draftNav);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraftNav(next);
  };

  const setNavMany = (keys: string[], on: boolean) => {
    const next = new Set(draftNav);
    if (on) for (const k of keys) next.add(k);
    else for (const k of keys) next.delete(k);
    setDraftNav(next);
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* ── Left: Roles list ────────────────────────────── */}
      <aside className="w-[260px] border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-[13px] font-semibold text-gray-900">Roles</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="w-7 h-7 rounded-full bg-[#22c55e] text-white flex items-center justify-center hover:bg-green-700"
            title="New role"
          >
            <Plus size={12} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 text-[13px] font-semibold hover:bg-gray-50 ${
                  r.id === active?.id ? "bg-[#fff8e1] border-l-2 border-amber-500" : ""
                }`}
              >
                {r.isSystem ? (
                  <ShieldCheck size={14} className="text-amber-500" />
                ) : (
                  <Shield size={14} className="text-gray-400" />
                )}
                <span className="flex-1 truncate">{r.name}</span>
                {r.isDefault && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-green-50 text-green-600 rounded uppercase">Default</span>
                )}
              </button>
            </li>
          ))}
          {roles.length === 0 && (
            <li className="px-4 py-8 text-xs text-gray-400 text-center">No roles yet</li>
          )}
        </ul>
      </aside>

      {/* ── Right: Permissions matrix ──────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {!active ? (
          <div className="p-12 text-center text-gray-500">Select a role to manage permissions</div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-3">
              <h1 className="text-base font-semibold text-gray-900">
                Permissions — {active.name}
              </h1>
              {active.isSystem ? (
                <ShieldCheck size={16} className="text-amber-500" />
              ) : (
                <Shield size={16} className="text-gray-400" />
              )}
              <div className="ml-auto flex items-center gap-2">
                {!active.isSystem && (
                  <>
                    <button
                      onClick={() => setEditingRole(active)}
                      className="group relative px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg shadow-sm hover:bg-amber-100 hover:border-amber-300 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                    >
                      <Pencil size={13} className="group-hover:rotate-12 transition-transform duration-200" />
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await dialog.confirm({
                          title: "Delete role?",
                          description: `Delete "${active.name}"? Employees on this role lose access.`,
                          confirmLabel: "Delete",
                          variant: "danger",
                        });
                        if (!ok) return;
                        try {
                          await deleteRoleMut.mutateAsync(active.id);
                          setSelectedRoleId(null);
                          toast.success("Role deleted");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Delete failed");
                        }
                      }}
                      className="group relative px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-b from-red-500 to-red-600 border border-red-600 rounded-lg shadow-sm hover:from-red-600 hover:to-red-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                    >
                      <Trash2 size={13} className="group-hover:scale-110 transition-transform duration-200" />
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={saveAll}
                  disabled={!isDirty || savePermsMut.isPending || saveNavMut.isPending}
                  className="group relative px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-b from-[#22c55e] to-[#15803d] border border-green-700 rounded-lg shadow-md hover:from-[#16a34a] hover:to-[#166534] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 disabled:bg-gradient-to-b disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 disabled:border-gray-300 disabled:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 flex items-center gap-2 min-w-[90px] justify-center"
                >
                  {savePermsMut.isPending || saveNavMut.isPending ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform duration-200">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="px-5 pt-4">
              <TabSwitcher
                value={tab}
                onChange={(v) => setTab(v as "entities" | "navigation")}
                tabs={[
                  { value: "entities", label: "Entities" },
                  { value: "navigation", label: "Navigation" },
                ]}
              />
            </div>

            {/* Info banner */}
            <div className="mx-6 mt-4 px-4 py-2 bg-green-600 text-white text-xs rounded-md flex items-start gap-2">
              <span className="text-amber-300">ℹ</span>
              <span>
                Tick an action to grant it. <b>Module-level</b> ticks select all leaves under that module.
                Clicking the entity name toggles the whole row. Save commits both <b>Entities</b> and <b>Navigation</b> in one go.
              </span>
            </div>

            {/* Tab body */}
            <div className="p-4">
              {tab === "entities" ? (
                <EntityMatrix
                  draft={draftPerms}
                  saved={savedPerms}
                  onToggle={togglePerm}
                  onModuleToggle={(codes, allOn) => {
                    const next = new Set(draftPerms);
                    if (allOn) for (const c of codes) next.delete(c);
                    else for (const c of codes) next.add(c);
                    setDraftPerms(next);
                  }}
                  onRowToggle={(codes, allOn) => {
                    const next = new Set(draftPerms);
                    if (allOn) for (const c of codes) next.delete(c);
                    else for (const c of codes) next.add(c);
                    setDraftPerms(next);
                  }}
                />
              ) : (
                <NavMatrix draft={draftNav} onToggle={toggleNav} onSetMany={setNavMany} />
              )}
            </div>
          </>
        )}
      </main>

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onSubmit={(body) => createRoleMut.mutate(body)}
          pending={createRoleMut.isPending}
        />
      )}
      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSubmit={(body) => updateRoleMut.mutate({ id: editingRole.id, body })}
          pending={updateRoleMut.isPending}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

interface EntityMatrixProps {
  draft: Set<string>;
  saved: Set<string>;
  onToggle: (code: string) => void;
  onModuleToggle: (codes: string[], allOn: boolean) => void;
  onRowToggle: (codes: string[], allOn: boolean) => void;
}

function EntityMatrix({ draft, onToggle, onModuleToggle, onRowToggle }: EntityMatrixProps) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2.5 font-semibold text-gray-700 w-1/2 text-[11px] uppercase tracking-[0.04em]">ENTITY</th>
            {ACTIONS.map((a) => (
              <th key={a} className="text-center px-4 py-2.5 font-semibold text-gray-700 uppercase text-[11px] tracking-[0.04em]">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_TREE.map((mod) => {
            const allCodes = mod.leaves.flatMap((leaf) =>
              ACTIONS.map((a) => leaf.actions[a].code).filter((c): c is string => Boolean(c)),
            );
            const grantedCount = allCodes.filter((c) => draft.has(c)).length;
            const modAllOn = grantedCount === allCodes.length && allCodes.length > 0;

            return (
              <Fragment key={mod.key}>
                {/* Module header */}
                <tr className="bg-gray-50/50 border-t border-gray-200">
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onModuleToggle(allCodes, modAllOn)}
                      className="font-semibold text-gray-800 hover:underline flex items-center gap-2"
                    >
                      {mod.label}
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                        {grantedCount}/{allCodes.length}
                      </span>
                    </button>
                  </td>
                  {ACTIONS.map((a) => {
                    const codes = mod.leaves
                      .map((leaf) => leaf.actions[a].code)
                      .filter((c): c is string => Boolean(c));
                    const granted = codes.filter((c) => draft.has(c)).length;
                    const allOn = granted === codes.length && codes.length > 0;
                    return (
                      <td key={a} className="text-center px-4 py-2.5">
                        {codes.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={allOn}
                            onChange={() => onRowToggle(codes, allOn)}
                            className="w-4 h-4 accent-[#22c55e] cursor-pointer"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
                {/* Leaves */}
                {mod.leaves.map((leaf) => {
                  const rowCodes = ACTIONS.map((a) => leaf.actions[a].code).filter((c): c is string => Boolean(c));
                  const rowGranted = rowCodes.filter((c) => draft.has(c)).length;
                  const rowAllOn = rowGranted === rowCodes.length && rowCodes.length > 0;
                  return (
                    <tr key={leaf.resource} className="border-t border-gray-100 hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 pl-10 text-gray-600">
                        <button
                          onClick={() => onRowToggle(rowCodes, rowAllOn)}
                          className="text-left hover:underline"
                        >
                          └ {leaf.label}
                        </button>
                      </td>
                      {ACTIONS.map((a) => {
                        const code = leaf.actions[a].code;
                        if (!code) {
                          return (
                            <td key={a} className="text-center px-4 py-2.5 text-gray-300">
                              —
                            </td>
                          );
                        }
                        const on = draft.has(code);
                        return (
                          <td key={a} className="text-center px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => onToggle(code)}
                              className="w-4 h-4 accent-[#22c55e] cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NavMatrix({
  draft,
  onToggle,
  onSetMany,
}: {
  draft: Set<string>;
  onToggle: (k: string) => void;
  onSetMany: (keys: string[], on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const allKeys = useMemo(() => NAV_TREE.flatMap((g) => g.items.map((i) => i.key)), []);
  const selectedTotal = allKeys.filter((k) => draft.has(k)).length;

  // Filter groups/items by search.
  const groups = useMemo(
    () =>
      NAV_TREE.map((g) => ({
        ...g,
        items: q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items,
      })).filter((g) => g.items.length > 0),
    [q],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search navigation tabs…"
            className="w-full pl-8 pr-8 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#22c55e] focus:border-[#22c55e]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-[11px] font-medium text-gray-500">
          {selectedTotal}/{allKeys.length} tabs enabled
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSetMany(allKeys, true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition"
          >
            <CheckSquare size={12} /> Select all
          </button>
          <button
            type="button"
            onClick={() => onSetMany(allKeys, false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
          >
            <Square size={12} /> Clear all
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-400">No navigation tabs match “{query.trim()}”.</div>
      ) : (
        groups.map((group) => {
          const groupKeys = group.items.map((i) => i.key);
          const selected = groupKeys.filter((k) => draft.has(k)).length;
          const allOn = selected === groupKeys.length && groupKeys.length > 0;
          return (
            <div key={group.key} className="border border-gray-200 rounded-md">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = selected > 0 && !allOn; }}
                  onChange={() => onSetMany(groupKeys, !allOn)}
                  className="w-4 h-4 accent-[#22c55e] cursor-pointer"
                  aria-label={`Toggle all ${group.label}`}
                />
                <span className="text-xs font-semibold text-gray-700 uppercase">{group.label}</span>
                <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                  {selected}/{groupKeys.length}
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {group.items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={draft.has(item.key)}
                      onChange={() => onToggle(item.key)}
                      className="w-4 h-4 accent-[#22c55e]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────

function CreateRoleModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (body: { name: string; description: string; isDefault: boolean }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ name: "", description: "", isDefault: false });
  return (
    <Modal open onClose={onClose} title="New role" size="md">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            required
            placeholder="custom_role"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#22c55e]"
          />
          <p className="text-xs text-gray-400 mt-1">Lowercase, alphanumeric + underscore. Used as identity (can't change later).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#22c55e]"
          />
        </div>
        <label className="flex items-start gap-2 cursor-pointer p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-amber-500"
          />
          <div>
            <div className="text-xs font-medium text-gray-800">Set as default role for new employees</div>
            <div className="text-xs text-gray-600 mt-0.5">Auto-assigned when admin creates an employee without picking a role. Replaces current default.</div>
          </div>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium">Cancel</button>
          <button type="submit" disabled={pending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {pending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditRoleModal({
  role,
  onClose,
  onSubmit,
  pending,
}: {
  role: RoleItem;
  onClose: () => void;
  onSubmit: (body: { name: string; description: string; isDefault: boolean }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: role.name,
    description: role.description ?? "",
    isDefault: role.isDefault,
  });
  return (
    <Modal open onClose={onClose} title={`Edit ${role.name}`} size="md">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            className="w-4 h-4 accent-[#22c55e]"
          />
          <span>Default role for new employees</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium">Cancel</button>
          <button type="submit" disabled={pending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
