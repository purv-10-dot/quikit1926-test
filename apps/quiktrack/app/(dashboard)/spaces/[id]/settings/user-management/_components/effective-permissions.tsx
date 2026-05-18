"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Lock } from "lucide-react";
import {
  PERMISSION_TREE,
  walkLeaves,
  type PermissionLeaf,
  type PermissionModule,
} from "@/lib/api/permissionsRegistry";

interface Payload {
  userId: string;
  roleId: string | null;
  roleName: string | null;
  roleGrants: { resource: string; action: string }[];
}

const ACTIONS = ["view", "create", "update", "delete"] as const;

export function EffectivePermissions({
  projectId,
  userId,
  roleName,
}: {
  projectId: string;
  userId: string;
  roleName: string | null;
}) {
  const q = useQuery({
    queryKey: ["quiktrack", "project-user-perms", projectId, userId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members/${userId}/permissions`);
      const j = await r.json();
      return (j.data as Payload) ?? { userId, roleId: null, roleName: null, roleGrants: [] };
    },
  });

  const roleSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of q.data?.roleGrants ?? []) s.add(`${g.resource}:${g.action}`);
    return s;
  }, [q.data]);

  const displayedName = q.data?.roleName ?? roleName ?? "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Effective permissions in this project</h3>
        <span className="text-[10px] uppercase tracking-wider font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          PROJECT ROLE: {displayedName.toUpperCase()}
        </span>
      </div>

      <div className="bg-gray-900 text-white rounded-md px-4 py-2.5 flex items-start gap-2 text-xs">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Gray-checked + <Lock className="inline h-3 w-3 mx-0.5" /> cells are granted by this user&apos;s
          project role and can&apos;t be changed here. App-wide grants (from their org role) also apply at
          runtime but are not shown in this panel.
        </span>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <Grid roleSet={roleSet} />
      )}
    </div>
  );
}

function Grid({ roleSet }: { roleSet: Set<string> }) {
  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-semibold uppercase tracking-wide">Entity</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-4 py-2 font-semibold uppercase tracking-wide text-center w-24">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_TREE.map((mod) => (
            <ModuleRows key={mod.key} mod={mod} roleSet={roleSet} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModuleRows({ mod, roleSet }: { mod: PermissionModule; roleSet: Set<string> }) {
  const leaves = leavesFor(mod);
  const granted = leaves.reduce(
    (n, l) => n + l.actions.filter((a) => roleSet.has(`${l.resource}:${a}`)).length,
    0,
  );

  if (leaves.length === 1) {
    const only = leaves[0];
    return (
      <tr className="border-t border-gray-100 bg-white">
        <td className="px-4 py-2 font-semibold text-gray-900">
          <span className="inline-flex items-center gap-2">
            {mod.label}
            <span className="text-[10px] font-normal bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {granted} role
            </span>
          </span>
        </td>
        {ACTIONS.map((a) => (
          <td key={a} className="px-4 py-2 text-center">
            <Cell granted={roleSet.has(`${only.resource}:${a}`)} valid={only.actions.includes(a)} />
          </td>
        ))}
      </tr>
    );
  }

  return (
    <>
      <tr className="border-t border-gray-100 bg-white">
        <td className="px-4 py-2 font-semibold text-gray-900">
          <span className="inline-flex items-center gap-2">
            {mod.label}
            <span className="text-[10px] font-normal bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {granted} role
            </span>
          </span>
        </td>
        <td colSpan={4} />
      </tr>
      {leaves.map((leaf) => (
        <tr key={leaf.resource} className="border-t border-gray-50 bg-white">
          <td className="px-4 py-1.5 pl-10 text-gray-700">
            <span className="text-gray-400 mr-1">↳</span>{leaf.label}
          </td>
          {ACTIONS.map((a) => (
            <td key={a} className="px-4 py-1.5 text-center">
              <Cell granted={roleSet.has(`${leaf.resource}:${a}`)} valid={leaf.actions.includes(a)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({ granted, valid }: { granted: boolean; valid: boolean }) {
  if (!valid) return <span className="text-gray-300">—</span>;
  if (granted) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input type="checkbox" checked readOnly className="h-3.5 w-3.5 text-gray-400" />
        <Lock className="h-2.5 w-2.5 text-gray-400" />
      </span>
    );
  }
  return <span className="text-gray-300">—</span>;
}

function leavesFor(mod: PermissionModule): PermissionLeaf[] {
  const out: PermissionLeaf[] = [];
  for (const l of walkLeaves()) {
    if (mod.leaves?.some((x) => x.resource === l.resource)) out.push(l);
    else if (l.resource.startsWith(`${mod.key}.`)) out.push(l);
  }
  return out;
}
