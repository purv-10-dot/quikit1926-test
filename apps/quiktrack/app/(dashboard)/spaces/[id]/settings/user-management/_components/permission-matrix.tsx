"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@quikit/ui";
import {
  PERMISSION_TREE,
  isValidPermissionPair,
  walkLeaves,
  type Action,
  type PermissionLeaf,
  type PermissionModule,
} from "@/lib/api/permissionsRegistry";
import { PermissionCell, type CellState } from "./permission-cell";

interface Payload {
  roleId: string;
  permissions: { resource: string; action: string }[];
}

const ACTIONS = ["view", "create", "update", "delete"] as const;

export function ProjectPermissionMatrix({
  projectId,
  roleId,
}: {
  projectId: string;
  roleId: string;
}) {
  const qc = useQueryClient();
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [openMods, setOpenMods] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quiktrack", "project-role-perms", projectId, roleId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles/${roleId}/permissions`);
      const j = await r.json();
      return j.data as Payload;
    },
  });

  useEffect(() => {
    if (q.data) {
      // Drop stale (resource, action) pairs that no longer exist in the
      // registry (e.g. grants seeded before a leaf's actions were trimmed).
      // Otherwise they'd ride along in the PUT and trip the server's
      // "(resource, action) pair is not valid for this leaf" validator.
      setGranted(
        new Set(
          q.data.permissions
            .filter((p) => isValidPermissionPair(p.resource, p.action))
            .map((p) => `${p.resource}:${p.action}`),
        ),
      );
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: Array.from(granted).map((k) => {
            const [resource, action] = k.split(":");
            return { resource, action };
          }),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-role-perms", projectId, roleId] }),
  });

  function toggleCell(resource: string, action: string) {
    const key = `${resource}:${action}`;
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setGranted(next);
  }
  function toggleLeafRow(leaf: PermissionLeaf) {
    const next = new Set(granted);
    const allOn = leaf.actions.every((a) => next.has(`${leaf.resource}:${a}`));
    for (const a of leaf.actions) {
      const key = `${leaf.resource}:${a}`;
      if (allOn) next.delete(key);
      else next.add(key);
    }
    setGranted(next);
  }
  function toggleMod(modKey: string) {
    const next = new Set(openMods);
    if (next.has(modKey)) next.delete(modKey);
    else next.add(modKey);
    setOpenMods(next);
  }
  // Toggle every leaf in a module that supports `action`. If they're all on,
  // turn them all off; otherwise turn them all on (matches leaf-row behavior).
  function toggleModAction(leaves: PermissionLeaf[], action: Action) {
    const supporting = leaves.filter((l) => l.actions.includes(action));
    if (supporting.length === 0) return;
    const next = new Set(granted);
    const allOn = supporting.every((l) => next.has(`${l.resource}:${action}`));
    for (const l of supporting) {
      const key = `${l.resource}:${action}`;
      if (allOn) next.delete(key);
      else next.add(key);
    }
    setGranted(next);
  }

  if (q.isLoading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left dark:bg-gray-800/60">
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
            <th className="px-4 py-3">Entity</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-4 py-3 text-center w-24">{a}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_TREE.map((mod) => (
            <ModuleRow
              key={mod.key}
              mod={mod}
              granted={granted}
              openMods={openMods}
              onToggleCell={toggleCell}
              onToggleLeaf={toggleLeafRow}
              onToggleMod={toggleMod}
              onToggleModAction={toggleModAction}
            />
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-gray-100 flex justify-end dark:border-gray-700">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-blue-600 hover:bg-blue-700">
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function ModuleRow({
  mod,
  granted,
  openMods,
  onToggleCell,
  onToggleLeaf,
  onToggleMod,
  onToggleModAction,
}: {
  mod: PermissionModule;
  granted: Set<string>;
  openMods: Set<string>;
  onToggleCell: (resource: string, action: string) => void;
  onToggleLeaf: (leaf: PermissionLeaf) => void;
  onToggleMod: (key: string) => void;
  onToggleModAction: (leaves: PermissionLeaf[], action: Action) => void;
}) {
  const leaves = leavesFor(mod);
  const totalActions = leaves.reduce((n, l) => n + l.actions.length, 0);
  const grantedCount = leaves.reduce(
    (n, l) => n + l.actions.filter((a) => granted.has(`${l.resource}:${a}`)).length,
    0,
  );
  const isOpen = openMods.has(mod.key);
  const onlyLeaf = leaves.length === 1 ? leaves[0] : null;

  if (onlyLeaf) {
    return (
      <tr className="border-t border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">
          <button type="button" onClick={() => onToggleLeaf(onlyLeaf)} className="inline-flex items-center gap-2">
            {mod.label}
            <span className="text-[10px] font-normal bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded dark:bg-blue-500/15 dark:text-blue-300">
              {grantedCount}/{totalActions}
            </span>
          </button>
        </td>
        {ACTIONS.map((a) => {
          const valid = onlyLeaf.actions.includes(a);
          const key = `${onlyLeaf.resource}:${a}`;
          return (
            <td key={a} className="px-4 py-2.5 text-center">
              <PermissionCell
                state={valid ? (granted.has(key) ? "on" : "off") : "na"}
                onClick={valid ? () => onToggleCell(onlyLeaf.resource, a) : undefined}
                title={valid ? `${onlyLeaf.label}: ${a}` : undefined}
              />
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">
          <button type="button" onClick={() => onToggleMod(mod.key)} className="inline-flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {mod.label}
            <span className="text-[10px] font-normal bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded dark:bg-blue-500/15 dark:text-blue-300">
              {grantedCount}/{totalActions}
            </span>
          </button>
        </td>
        {ACTIONS.map((a) => {
          const supporting = leaves.filter((l) => l.actions.includes(a));
          const grantedN = supporting.filter((l) => granted.has(`${l.resource}:${a}`)).length;
          const state: CellState =
            supporting.length === 0
              ? "na"
              : grantedN === 0
                ? "off"
                : grantedN === supporting.length
                  ? "on"
                  : "partial";
          return (
            <td key={a} className="px-4 py-2.5 text-center">
              <PermissionCell
                state={state}
                onClick={supporting.length ? () => onToggleModAction(leaves, a) : undefined}
                title={supporting.length ? `${mod.label}: ${a} (${grantedN}/${supporting.length})` : undefined}
              />
            </td>
          );
        })}
      </tr>
      {isOpen && leaves.map((leaf) => (
        <tr key={leaf.resource} className="bg-white border-t border-gray-50 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-gray-800/40">
          <td className="px-4 py-1.5 pl-10 text-gray-700 dark:text-gray-200">
            <button type="button" onClick={() => onToggleLeaf(leaf)} className="inline-flex items-center gap-1">
              <span className="text-gray-400 dark:text-gray-600">↳</span>{leaf.label}
            </button>
          </td>
          {ACTIONS.map((a) => {
            const valid = leaf.actions.includes(a);
            const key = `${leaf.resource}:${a}`;
            return (
              <td key={a} className="px-4 py-1.5 text-center">
                <PermissionCell
                  state={valid ? (granted.has(key) ? "on" : "off") : "na"}
                  onClick={valid ? () => onToggleCell(leaf.resource, a) : undefined}
                  title={valid ? `${leaf.label}: ${a}` : undefined}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function leavesFor(mod: PermissionModule): PermissionLeaf[] {
  const out: PermissionLeaf[] = [];
  for (const l of walkLeaves()) {
    if (mod.leaves?.some((x) => x.resource === l.resource)) out.push(l);
    else if (l.resource.startsWith(`${mod.key}.`)) out.push(l);
  }
  return out;
}
