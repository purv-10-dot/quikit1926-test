"use client";

/**
 * The permission matrix for one role. Renders PERMISSION_TREE as rows
 * (with module/submodule grouping) × ACTIONS as columns. Toggling a cell
 * marks the matrix dirty; <StickyDirtyBar /> shows save/discard.
 *
 * Driven by the registry — never hardcodes resource/action strings. Adding
 * a new resource in permissionsRegistry.ts makes it appear here on next load.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ACTIONS,
  PERMISSION_TREE,
  type Action,
  type PermissionLeaf,
  type PermissionModule,
  type PermissionSubmodule,
} from "@/lib/rbac/permissionsRegistry";

interface Props {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  /** Current saved grants — `${resource}::${action}` strings. */
  initialGrants: ReadonlySet<string>;
  /** Called when admin clicks Save. Receives the new grants. */
  onSave: (next: Array<{ resource: string; action: Action }>) => Promise<void>;
}

function key(resource: string, action: Action): string {
  return `${resource}::${action}`;
}

export function RolePermissionMatrix({ roleId, roleName, isSystem, initialGrants, onSave }: Props) {
  const [grants, setGrants] = useState<Set<string>>(new Set(initialGrants));
  const [saving, setSaving] = useState(false);

  // Reset when caller swaps role.
  useEffect(() => {
    setGrants(new Set(initialGrants));
  }, [roleId, initialGrants]);

  const dirty = useMemo(() => {
    if (grants.size !== initialGrants.size) return true;
    for (const k of grants) if (!initialGrants.has(k)) return true;
    return false;
  }, [grants, initialGrants]);

  const toggle = (resource: string, action: Action) => {
    setGrants((prev) => {
      const next = new Set(prev);
      const k = key(resource, action);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const arr: Array<{ resource: string; action: Action }> = [];
      for (const k of grants) {
        const [resource, action] = k.split("::");
        if (resource && action) arr.push({ resource, action: action as Action });
      }
      await onSave(arr);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => setGrants(new Set(initialGrants));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 text-sm font-semibold text-slate-900">
        {roleName}
        {isSystem ? (
          <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            System
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Resource</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-medium text-slate-700 capitalize">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_TREE.map((mod) => (
              <ModuleRows
                key={mod.key}
                mod={mod}
                grants={grants}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      {dirty ? (
        <div className="flex items-center justify-between border-t bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-900">
            You have unsaved changes
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModuleRows({
  mod,
  grants,
  onToggle,
}: {
  mod: PermissionModule;
  grants: Set<string>;
  onToggle: (resource: string, action: Action) => void;
}) {
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={ACTIONS.length + 1} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-600">
          {mod.label}
        </td>
      </tr>
      {mod.leaves?.map((leaf) => (
        <LeafRow key={leaf.resource} leaf={leaf} grants={grants} onToggle={onToggle} indent={1} />
      ))}
      {mod.submodules?.map((sub) => (
        <SubmoduleRows key={sub.key} sub={sub} grants={grants} onToggle={onToggle} />
      ))}
    </>
  );
}

function SubmoduleRows({
  sub,
  grants,
  onToggle,
}: {
  sub: PermissionSubmodule;
  grants: Set<string>;
  onToggle: (resource: string, action: Action) => void;
}) {
  return (
    <>
      <tr>
        <td className="px-4 py-1 pl-8 text-xs font-medium text-slate-500" colSpan={ACTIONS.length + 1}>
          {sub.label}
        </td>
      </tr>
      {sub.leaves.map((leaf) => (
        <LeafRow key={leaf.resource} leaf={leaf} grants={grants} onToggle={onToggle} indent={2} />
      ))}
    </>
  );
}

function LeafRow({
  leaf,
  grants,
  onToggle,
  indent,
}: {
  leaf: PermissionLeaf;
  grants: Set<string>;
  onToggle: (resource: string, action: Action) => void;
  indent: 1 | 2;
}) {
  const padding = indent === 2 ? "pl-12" : "pl-6";
  return (
    <tr className="border-t hover:bg-slate-50">
      <td className={`py-1.5 ${padding} text-slate-800`}>{leaf.label}</td>
      {ACTIONS.map((action) => {
        const supported = leaf.actions.includes(action);
        const checked = supported && grants.has(key(leaf.resource, action));
        return (
          <td key={action} className="px-2 py-1.5 text-center">
            {supported ? (
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(leaf.resource, action)}
                className="h-4 w-4 cursor-pointer accent-blue-600"
              />
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
