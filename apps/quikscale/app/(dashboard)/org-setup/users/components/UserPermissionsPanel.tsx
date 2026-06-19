"use client";

/**
 * Per-user permission panel rendered inline below a user row in the Users
 * tab. Same column-aligned table layout as the role permission matrix.
 *
 * Cell states (per resource × action):
 *   • Role-granted (locked)  → checked + gray + 🔒 icon + disabled. Change
 *                              on the role itself.
 *   • Extra (editable)        → checked + amber accent + amber dot.
 *   • Empty                   → unchecked. Click to grant as an extra.
 *   • Unsupported             → "—" placeholder.
 *
 * Module-level tristate checkboxes toggle the action across every NON-role
 * leaf in the subtree. Cells already granted by the role are not affected —
 * they stay checked and locked.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Save, Undo2, X, Lock, Info } from "lucide-react";
import {
  PERMISSION_TREE,
  ACTIONS,
  filterTreeByEnabledModules,
  type Action,
  type PermissionLeaf,
  type PermissionModule,
  type PermissionSubModule,
} from "@/lib/api/permissionsRegistry";
import { useDisabledModules } from "@/lib/hooks/useFeatureFlagsForApp";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";

interface Pair {
  resource: string;
  action: string;
}

interface UserPermissionsResponse {
  success: boolean;
  data: {
    userId: string;
    roles: Array<{ id: string; name: string }>;
    roleGrants: Pair[];
    extras: Pair[];
  };
}

/* ─────────────────────── helpers ─────────────────────── */

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

/**
 * For module-level tristate: counts effective grants (role OR extra) across
 * the subtree, AND counts how many cells are NOT role-locked (i.e. editable
 * as extras here).
 */
function actionStats(
  node: NodeWithChildren,
  action: Action,
  roleGrants: Set<string>,
  extras: Set<string>,
): { on: number; total: number; editable: number; editableOn: number } {
  let on = 0;
  let total = 0;
  let editable = 0;
  let editableOn = 0;
  for (const leaf of walkAllLeaves(node)) {
    if (!(leaf.actions as readonly Action[]).includes(action)) continue;
    total++;
    const key = `${leaf.resource}:${action}`;
    const fromRole = roleGrants.has(key);
    const isExtra = extras.has(key);
    if (fromRole || isExtra) on++;
    if (!fromRole) {
      editable++;
      if (isExtra) editableOn++;
    }
  }
  return { on, total, editable, editableOn };
}

function aggregateCounts(
  node: NodeWithChildren,
  roleGrants: Set<string>,
  extras: Set<string>,
) {
  let role = 0;
  let extra = 0;
  let all = 0;
  for (const leaf of walkAllLeaves(node)) {
    for (const action of leaf.actions) {
      all++;
      const key = `${leaf.resource}:${action}`;
      if (roleGrants.has(key)) role++;
      else if (extras.has(key)) extra++;
    }
  }
  return { role, extra, all };
}

/* ─────────────────────── tristate checkbox ─────────────────────── */

function TristateCheckbox({
  on,
  total,
  disabled,
  onChange,
  title,
}: {
  on: number;
  total: number;
  disabled?: boolean;
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
      disabled={disabled}
      onChange={() => onChange(!allOn)}
      title={title}
      className={`h-4 w-4 rounded border-gray-300 ${
        disabled ? "accent-gray-400 cursor-not-allowed" : "accent-amber-500 cursor-pointer"
      }`}
    />
  );
}

/* ─────────────────────── main component ─────────────────────── */

export function UserPermissionsPanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleGrants, setRoleGrants] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [savedExtras, setSavedExtras] = useState<Set<string>>(new Set());
  const [roleNames, setRoleNames] = useState<string[]>([]);
  // Hide modules the Super Admin has disabled for this tenant — same
  // filter the role-matrix uses, so the Effective Permissions view stays
  // consistent with what the user can actually exercise.
  const disabledModules = useDisabledModules();
  const visibleTree = useMemo(
    () => filterTreeByEnabledModules(PERMISSION_TREE, disabledModules, isModuleEnabled),
    [disabledModules],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(visibleTree.map((m) => m.key)),
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/org/users/${userId}/permissions`);
        const json: UserPermissionsResponse = await res.json();
        if (!mounted) return;
        if (!json.success) {
          setError("Failed to load permissions");
          return;
        }
        setRoleNames(json.data.roles.map((r) => r.name));
        setRoleGrants(new Set(json.data.roleGrants.map((p) => `${p.resource}:${p.action}`)));
        const extraSet = new Set(json.data.extras.map((p) => `${p.resource}:${p.action}`));
        setExtras(extraSet);
        setSavedExtras(new Set(extraSet));
      } catch {
        if (mounted) setError("Network error loading permissions");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const diff = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const k of extras) if (!savedExtras.has(k)) added++;
    for (const k of savedExtras) if (!extras.has(k)) removed++;
    return { added, removed, total: added + removed };
  }, [extras, savedExtras]);
  const dirty = diff.total > 0;

  function toggleExtra(resource: string, action: Action) {
    const key = `${resource}:${action}`;
    // Role-granted cells can't be toggled from this panel.
    if (roleGrants.has(key)) return;
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Module-level tristate toggle. Affects only NON-role-granted cells:
   *   - If all editable cells are already on → un-tick them all
   *   - Else → tick every editable cell
   * Role-granted cells are untouched.
   */
  function bulkSetAction(node: NodeWithChildren, action: Action, makeOn: boolean) {
    setExtras((prev) => {
      const next = new Set(prev);
      for (const leaf of walkAllLeaves(node)) {
        if (!(leaf.actions as readonly Action[]).includes(action)) continue;
        const key = `${leaf.resource}:${action}`;
        if (roleGrants.has(key)) continue; // role-locked, skip
        if (makeOn) next.add(key);
        else next.delete(key);
      }
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
    setExtras(new Set(savedExtras));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body = {
        extras: Array.from(extras).map((k) => {
          const [resource, action] = k.split(":");
          return { resource, action };
        }),
      };
      const res = await fetch(`/api/org/users/${userId}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to save");
        return;
      }
      setSavedExtras(new Set(extras));
      // The effective permission set the app gates on (`/api/me/permissions`,
      // cached 5min under this key) just changed for the edited user. Invalidate
      // so the grant takes effect immediately — e.g. an "Edit after Finalize"
      // extra unlocks the OPSP History Edit button without a hard refresh —
      // rather than after the stale window elapses. (For a *different* user the
      // refetch fires on their next mount; only their tab can't be pushed to.)
      void queryClient.invalidateQueries({ queryKey: ["me-permissions"] });
    } catch {
      setError("Network error saving permissions");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-4 flex items-center gap-2 text-sm text-gray-500 bg-gray-50">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border-y border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
          Effective permissions
          {roleNames.length > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-gray-100 text-gray-600">
              role: {roleNames.join(" · ")}
            </span>
          )}
        </p>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tip banner */}
      <div className="px-6 pt-3">
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-900 text-gray-200 text-[11px]">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Gray-checked + 🔒</strong> cells come from the role and can&apos;t be changed
            here. Tick any empty cell to add an <strong className="text-amber-300">extra</strong>
            {" "}grant for just this user.
          </span>
        </div>
      </div>

      {/* Table */}
      <div className={`px-6 py-3 ${dirty ? "pb-16" : ""}`}>
        {error && (
          <p className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "auto" }} />
              {ACTIONS.map((a) => (
                <col key={a} style={{ width: "11%" }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">
                  Entity
                </th>
                {ACTIONS.map((a) => (
                  <th
                    key={a}
                    className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5"
                  >
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTree.map((mod) => (
                <ModuleRows
                  key={mod.key}
                  mod={mod}
                  roleGrants={roleGrants}
                  extras={extras}
                  expanded={expanded}
                  onToggleExpanded={toggleExpanded}
                  onToggleExtra={toggleExtra}
                  onBulkSetAction={bulkSetAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky bottom bar */}
      {dirty && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-md px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 font-bold">
              {diff.total}
            </span>
            <span className="text-gray-700 font-medium">
              unsaved extra{diff.total === 1 ? "" : "s"}
            </span>
            <span className="text-gray-400">·</span>
            {diff.added > 0 && <span className="text-green-600 font-medium">+{diff.added}</span>}
            {diff.added > 0 && diff.removed > 0 && <span className="text-gray-300">/</span>}
            {diff.removed > 0 && <span className="text-red-600 font-medium">−{diff.removed}</span>}
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
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save extras"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── table rows ─────────────────────── */

interface RowHandlers {
  roleGrants: Set<string>;
  extras: Set<string>;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  onToggleExtra: (resource: string, action: Action) => void;
  onBulkSetAction: (node: NodeWithChildren, action: Action, makeOn: boolean) => void;
}

function ModuleRows({ mod, ...handlers }: { mod: PermissionModule } & RowHandlers) {
  const { roleGrants, extras, expanded, onToggleExpanded } = handlers;
  const isOpen = expanded.has(mod.key);
  const counts = aggregateCounts(mod, roleGrants, extras);
  const hasChildren = !!(mod.subModules?.length) || (mod.leaves?.length ?? 0) > 1;

  return (
    <>
      <tr className="border-b border-gray-100 bg-gray-50/40 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2.5">
          <button
            onClick={() => onToggleExpanded(mod.key)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-900 text-left"
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )
            ) : (
              <span className="w-4" />
            )}
            <span>{mod.label}</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold">
              <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                {counts.role} role
              </span>
              {counts.extra > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                  +{counts.extra} extra
                </span>
              )}
            </span>
          </button>
        </td>
        {ACTIONS.map((action) => (
          <ModuleActionCell key={action} node={mod} action={action} {...handlers} />
        ))}
      </tr>
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
  const { expanded, onToggleExpanded } = handlers;
  const hasChildren = !!(sub.subModules?.length) || sub.leaves.length > 1;
  const isOpen = expanded.has(sub.key);

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
          <ModuleActionCell key={action} node={sub} action={action} {...handlers} />
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
  roleGrants,
  extras,
  onToggleExtra,
}: {
  leaf: PermissionLeaf;
  depth: number;
} & RowHandlers) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors">
      <td className="px-4 py-2" style={{ paddingLeft: depth * 24 + 16 }}>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-gray-300">└</span>
          <span>{leaf.label}</span>
        </div>
      </td>
      {ACTIONS.map((a) => (
        <td key={a} className="text-center px-4 py-2">
          <PermissionCell
            resource={leaf.resource}
            action={a}
            supported={(leaf.actions as readonly Action[]).includes(a)}
            roleGrants={roleGrants}
            extras={extras}
            onToggleExtra={onToggleExtra}
          />
        </td>
      ))}
    </tr>
  );
}

/**
 * Module/submodule header cell — tristate over every NON-role-locked leaf
 * in the subtree. If all leaves are role-locked, render the cell as locked
 * (gray check + lock icon).
 */
function ModuleActionCell({
  node,
  action,
  roleGrants,
  extras,
  onBulkSetAction,
}: {
  node: NodeWithChildren;
  action: Action;
} & RowHandlers) {
  const stats = actionStats(node, action, roleGrants, extras);

  if (stats.total === 0) {
    return <td className="text-center text-gray-300 text-xs px-4 py-2.5">—</td>;
  }
  if (stats.editable === 0) {
    // Every supporting leaf is role-locked. Just show the lock state.
    return (
      <td className="text-center px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-gray-500" title="All from role — locked">
          <input
            type="checkbox"
            checked
            disabled
            className="h-4 w-4 rounded border-gray-300 accent-gray-500 cursor-not-allowed"
          />
          <Lock className="h-2.5 w-2.5 text-gray-400" />
        </span>
      </td>
    );
  }
  return (
    <td className="text-center px-4 py-2.5">
      <TristateCheckbox
        on={stats.on}
        total={stats.total}
        onChange={(makeOn) => onBulkSetAction(node, action, makeOn)}
        title={`Toggle ${action} extras across this module (role-granted cells are skipped)`}
      />
    </td>
  );
}

/**
 * Single permission cell — three visible states + unsupported.
 */
function PermissionCell({
  resource,
  action,
  supported,
  roleGrants,
  extras,
  onToggleExtra,
}: {
  resource: string;
  action: Action;
  supported: boolean;
  roleGrants: Set<string>;
  extras: Set<string>;
  onToggleExtra: (resource: string, action: Action) => void;
}) {
  if (!supported) {
    return <span className="inline-block text-gray-300 text-xs">—</span>;
  }
  const key = `${resource}:${action}`;
  const fromRole = roleGrants.has(key);
  const isExtra = extras.has(key);

  if (fromRole) {
    return (
      <span
        className="inline-flex items-center gap-1 text-gray-500"
        title="Granted by role — change on the role itself"
      >
        <input
          type="checkbox"
          checked
          disabled
          className="h-4 w-4 rounded border-gray-300 accent-gray-500 cursor-not-allowed"
        />
        <Lock className="h-2.5 w-2.5 text-gray-400" />
      </span>
    );
  }

  return (
    <span className="relative inline-flex">
      <input
        type="checkbox"
        checked={isExtra}
        onChange={() => onToggleExtra(resource, action)}
        title={isExtra ? "Extra grant — click to revoke" : "Click to grant as extra"}
        className={`h-4 w-4 rounded border-gray-300 cursor-pointer ${
          isExtra ? "accent-amber-500" : "accent-accent-600"
        }`}
      />
      {isExtra && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white"
          aria-hidden
        />
      )}
    </span>
  );
}
