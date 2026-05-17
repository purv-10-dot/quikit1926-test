"use client";

/**
 * Permission matrix for a single AppRole.
 *
 * Layout:
 *   Entity                          │ View │ Create │ Update │ Delete
 *   ─────────────────────────────────┼──────┼────────┼────────┼───────
 *   ⌄ Dashboard       (0/1)         │  ☐   │   —    │   —    │  —     ← single-leaf, inline checkboxes
 *   ⌄ KPI             (4/8)         │  ▣   │   ▣    │   ▣    │  ▣     ← tristate module toggles
 *     └ Individual KPI               │  ☐   │   ☐    │   ☐    │  ☐     ← leaf rows under module
 *     └ Team KPI                     │  ☑   │   ☑    │   ☑    │  ☑
 *   ⌄ OPSP           (2/13)         │  ▣   │   ▣    │   ▣    │  ▣
 *       ⌄ OPSP History (1/4)        │  ☑   │   ☐    │   ▣    │  ☐
 *           └ Edit after Finalize    │  —   │   —    │   ☑    │  —     ← sub-sub, binary leaf
 *
 * Ticking a module-level checkbox toggles that action across every leaf in
 * the module's entire subtree. Tristate (indeterminate) when some leaves
 * have it and others don't.
 *
 * Sidebar visibility is derived from the `view` grants in this matrix via
 * the `NAV_RESOURCE` map in `lib/api/permissionsRegistry.ts` — there is no
 * separate navigation tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Save, Undo2, Shield, Info, Pencil, Check, X } from "lucide-react";
import {
  PERMISSION_TREE,
  ACTIONS,
  type Action,
  type PermissionLeaf,
  type PermissionModule,
  type PermissionSubModule,
} from "@/lib/api/permissionsRegistry";

interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: Array<{ resource: string; action: string }>;
}

/* ─────────────────────── helpers (subtree walking) ─────────────────────── */

interface NodeWithChildren {
  leaves?: readonly PermissionLeaf[];
  subModules?: readonly PermissionSubModule[];
}

function* walkAllLeaves(node: NodeWithChildren): Generator<PermissionLeaf> {
  if (node.leaves) for (const leaf of node.leaves) yield leaf;
  if (node.subModules) {
    for (const sub of node.subModules) yield* walkAllLeaves(sub);
  }
}

function actionStats(
  node: NodeWithChildren,
  action: Action,
  grants: Set<string>,
): { on: number; total: number } {
  let on = 0;
  let total = 0;
  for (const leaf of walkAllLeaves(node)) {
    if ((leaf.actions as readonly Action[]).includes(action)) {
      total++;
      if (grants.has(`${leaf.resource}:${action}`)) on++;
    }
  }
  return { on, total };
}

function aggregateCounts(node: NodeWithChildren, grants: Set<string>) {
  let on = 0;
  let all = 0;
  for (const leaf of walkAllLeaves(node)) {
    for (const action of leaf.actions) {
      all++;
      if (grants.has(`${leaf.resource}:${action}`)) on++;
    }
  }
  return { on, all };
}

/* ─────────────────────── tristate checkbox ─────────────────────── */

function TristateCheckbox({
  on,
  total,
  onChange,
  title,
}: {
  on: number;
  total: number;
  onChange: (makeOn: boolean) => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const allOn = total > 0 && on === total;
  const some = on > 0 && on < total;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allOn}
      onChange={() => onChange(!allOn)}
      title={title}
      className="h-4 w-4 rounded border-gray-300 accent-accent-600 cursor-pointer"
    />
  );
}

/* ─────────────────────── main component ─────────────────────── */

export function RolePermissionMatrix({
  roleId,
  onRenamed,
}: {
  roleId: string;
  /** Notify parent (RolesTab) so the left rail refetches with the new name. */
  onRenamed?: () => void;
}) {
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [savedGrants, setSavedGrants] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(PERMISSION_TREE.map((m) => m.key)),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Inline rename state for non-system roles.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/org/roles/${roleId}`);
        const json = await res.json();
        if (!mounted) return;
        if (!json.success) {
          setError("Failed to load role");
          return;
        }
        const r = json.data as RoleDetail;
        setRole(r);
        const gkeys = new Set(r.permissions.map((p) => `${p.resource}:${p.action}`));
        setGrants(gkeys);
        setSavedGrants(new Set(gkeys));
      } catch {
        if (mounted) setError("Network error loading role");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roleId]);

  const grantsDiff = useMemo(() => diffSets(grants, savedGrants), [grants, savedGrants]);
  const dirty = grantsDiff.total > 0;

  /* ─── toggle helpers ─── */

  function toggleGrant(resource: string, action: Action) {
    setGrants((prev) => {
      const next = new Set(prev);
      const key = `${resource}:${action}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Tick or untick `action` across every leaf in `node`'s subtree. */
  function bulkSetAction(node: NodeWithChildren, action: Action, makeOn: boolean) {
    setGrants((prev) => {
      const next = new Set(prev);
      for (const leaf of walkAllLeaves(node)) {
        if (!(leaf.actions as readonly Action[]).includes(action)) continue;
        const key = `${leaf.resource}:${action}`;
        if (makeOn) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  /** Toggle every action on a single leaf (label click). */
  function toggleLeafRow(leaf: PermissionLeaf) {
    setGrants((prev) => {
      const next = new Set(prev);
      const keys = leaf.actions.map((a) => `${leaf.resource}:${a}`);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) for (const k of keys) next.delete(k);
      else for (const k of keys) next.add(k);
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function discard() {
    setGrants(new Set(savedGrants));
  }

  function startRename() {
    if (!role || role.isSystem) return;
    setDraftName(role.name);
    setRenameError("");
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setDraftName("");
    setRenameError("");
  }

  async function commitRename() {
    if (!role) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setRenameError("Name is required");
      return;
    }
    if (trimmed === role.name) {
      cancelRename();
      return;
    }
    setRenameSaving(true);
    setRenameError("");
    try {
      const res = await fetch(`/api/org/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setRenameError(json.error || "Failed to rename");
        return;
      }
      setRole({ ...role, name: trimmed });
      setRenaming(false);
      setDraftName("");
      onRenamed?.();
    } catch {
      setRenameError("Network error renaming");
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/org/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: Array.from(grants).map((k) => {
            const [resource, action] = k.split(":");
            return { resource, action };
          }),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to save");
        return;
      }
      setSavedGrants(new Set(grants));
    } catch {
      setError("Network error saving");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-16">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0">Permissions —</span>
            {renaming && role && !role.isSystem ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  disabled={renameSaving}
                  maxLength={64}
                  className="text-sm font-semibold border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50"
                />
                <button
                  onClick={commitRename}
                  disabled={renameSaving || !draftName.trim()}
                  className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                  title="Save name"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={cancelRename}
                  disabled={renameSaving}
                  className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
                {renameError && (
                  <span className="text-[10px] text-red-600 ml-1">{renameError}</span>
                )}
              </span>
            ) : (
              <>
                <span className="truncate">{role?.name}</span>
                {role?.isSystem && <Shield className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                {role && !role.isSystem && (
                  <button
                    onClick={startRename}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0"
                    title="Rename role"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
            {role?.isDefault && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-accent-100 text-accent-700 flex-shrink-0">
                Default
              </span>
            )}
          </h2>
        </div>
      </div>

      {/* Tip banner */}
      <div className="px-6 py-2 flex-shrink-0">
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-900 text-gray-200 text-[11px]">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Tick an action to grant it. <strong>Module-level</strong> ticks select all leaves under
            that module. Clicking the entity name toggles the whole row. Sidebar visibility follows
            the <strong>View</strong> column automatically.
          </span>
        </div>
      </div>

      {/* Body */}
      <div className={`flex-1 overflow-auto px-6 ${dirty ? "pb-20" : "pb-6"}`}>
        {error && (
          <p className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
        <EntitiesTable
          grants={grants}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          onToggleGrant={toggleGrant}
          onToggleLeafRow={toggleLeafRow}
          onBulkSetAction={bulkSetAction}
        />
      </div>

      {/* Sticky bottom bar */}
      {dirty && (
        <div className="bg-white border-t border-gray-200 shadow-md px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent-100 text-accent-700 font-bold">
              {grantsDiff.total}
            </span>
            <span className="text-gray-700 font-medium">
              unsaved change{grantsDiff.total === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={discard}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Entities table ───────────────────────── */

interface RowHandlers {
  grants: Set<string>;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  onToggleGrant: (resource: string, action: Action) => void;
  onToggleLeafRow: (leaf: PermissionLeaf) => void;
  onBulkSetAction: (node: NodeWithChildren, action: Action, makeOn: boolean) => void;
}

function EntitiesTable(props: RowHandlers) {
  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        <col style={{ width: "auto" }} />
        {ACTIONS.map((a) => (
          <col key={a} style={{ width: "11%" }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 bg-gray-50 z-10">
        <tr className="border-b border-gray-200">
          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
            Entity
          </th>
          {ACTIONS.map((a) => (
            <th
              key={a}
              className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3"
            >
              {a}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PERMISSION_TREE.map((mod) => (
          <ModuleRows key={mod.key} mod={mod} {...props} />
        ))}
      </tbody>
    </table>
  );
}

function ModuleRows({ mod, ...handlers }: { mod: PermissionModule } & RowHandlers) {
  const { grants, expanded, onToggleExpanded, onBulkSetAction } = handlers;
  const isOpen = expanded.has(mod.key);
  const totals = aggregateCounts(mod, grants);
  const hasChildren = !!(mod.subModules?.length) || (mod.leaves?.length ?? 0) > 1;

  return (
    <>
      <tr className="border-b border-gray-100 bg-gray-50/40 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2.5">
          <button
            onClick={() => onToggleExpanded(mod.key)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-900 text-left"
          >
            {hasChildren && (
              isOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )
            )}
            {!hasChildren && <span className="w-4" />}
            <span>{mod.label}</span>
            <span
              className={`inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                totals.on === 0
                  ? "bg-gray-200 text-gray-600"
                  : totals.on === totals.all
                    ? "bg-accent-100 text-accent-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {totals.on}/{totals.all}
            </span>
          </button>
        </td>
        {ACTIONS.map((action) => (
          <ModuleActionCell
            key={action}
            node={mod}
            action={action}
            grants={grants}
            onBulkSet={(makeOn) => onBulkSetAction(mod, action, makeOn)}
          />
        ))}
      </tr>

      {/* Children — leaves and submodules */}
      {isOpen && hasChildren && (
        <>
          {mod.leaves && mod.leaves.length > 1 &&
            mod.leaves.map((leaf) => (
              <LeafRow key={leaf.resource} leaf={leaf} depth={1} {...handlers} />
            ))}
          {mod.subModules?.map((sub) => (
            <SubModuleRows key={sub.key} sub={sub} depth={1} {...handlers} />
          ))}
        </>
      )}
    </>
  );
}

function SubModuleRows({
  sub,
  depth,
  ...handlers
}: { sub: PermissionSubModule; depth: number } & RowHandlers) {
  const { grants, expanded, onToggleExpanded, onBulkSetAction } = handlers;
  const hasChildren = !!(sub.subModules?.length) || sub.leaves.length > 1;
  const isOpen = expanded.has(sub.key);

  // Single-leaf submodule with NO children — flatten into its leaf row.
  if (!hasChildren && sub.leaves.length === 1) {
    return <LeafRow leaf={sub.leaves[0]} depth={depth} {...handlers} />;
  }

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2" style={{ paddingLeft: depth * 24 + 16 }}>
          <button
            onClick={() => onToggleExpanded(sub.key)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 text-left"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            )}
            <span>{sub.label}</span>
          </button>
        </td>
        {ACTIONS.map((action) => (
          <ModuleActionCell
            key={action}
            node={sub}
            action={action}
            grants={grants}
            onBulkSet={(makeOn) => onBulkSetAction(sub, action, makeOn)}
          />
        ))}
      </tr>
      {isOpen && (
        <>
          {sub.leaves.length > 1 &&
            sub.leaves.map((leaf) => (
              <LeafRow key={leaf.resource} leaf={leaf} depth={depth + 1} {...handlers} />
            ))}
          {sub.subModules?.map((deeper) => (
            <SubModuleRows key={deeper.key} sub={deeper} depth={depth + 1} {...handlers} />
          ))}
        </>
      )}
    </>
  );
}

function LeafRow({
  leaf,
  depth,
  grants,
  onToggleGrant,
  onToggleLeafRow,
}: {
  leaf: PermissionLeaf;
  depth: number;
} & RowHandlers) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors">
      <td className="px-4 py-2" style={{ paddingLeft: depth * 24 + 16 }}>
        <button
          onClick={() => onToggleLeafRow(leaf)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 text-left"
          title="Toggle all actions on this row"
        >
          <span className="text-gray-300">└</span>
          <span>{leaf.label}</span>
        </button>
      </td>
      {ACTIONS.map((a) => {
        const supported = (leaf.actions as readonly Action[]).includes(a);
        if (!supported) {
          return (
            <td key={a} className="text-center text-gray-300 text-xs px-4 py-2">
              —
            </td>
          );
        }
        const checked = grants.has(`${leaf.resource}:${a}`);
        return (
          <td key={a} className="text-center px-4 py-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleGrant(leaf.resource, a)}
              className="h-4 w-4 rounded border-gray-300 accent-accent-600 cursor-pointer"
            />
          </td>
        );
      })}
    </tr>
  );
}

/** Module/submodule header cell — tristate checkbox covering every leaf in the subtree. */
function ModuleActionCell({
  node,
  action,
  grants,
  onBulkSet,
}: {
  node: NodeWithChildren;
  action: Action;
  grants: Set<string>;
  onBulkSet: (makeOn: boolean) => void;
}) {
  const { on, total } = actionStats(node, action, grants);
  if (total === 0) {
    return (
      <td className="text-center text-gray-300 text-xs px-4 py-2.5">—</td>
    );
  }
  return (
    <td className="text-center px-4 py-2.5">
      <TristateCheckbox on={on} total={total} onChange={onBulkSet} title={`Tick all ${action} under this module`} />
    </td>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function diffSets(current: Set<string>, baseline: Set<string>) {
  let added = 0;
  let removed = 0;
  for (const k of current) if (!baseline.has(k)) added++;
  for (const k of baseline) if (!current.has(k)) removed++;
  return { added, removed, total: added + removed };
}
