"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@quikit/ui";
import {
  DEFAULT_FIELD_LEVEL,
  FIELD_LEVELS,
  FIELD_TREE,
  findField,
  type FieldLevel,
} from "@/lib/api/fieldsRegistry";

interface SavedRow {
  entity: string;
  field: string;
  level: FieldLevel;
}

const LEVEL_META: Record<FieldLevel, { label: string; tone: string }> = {
  hidden: {
    label: "Hidden",
    tone: "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600",
  },
  readonly: {
    label: "Read-only",
    tone: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  },
  editable: {
    label: "Editable",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  },
  required: {
    label: "Required",
    tone: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
  },
};

/**
 * Field-level permission matrix. For the selected role, lets an admin pick
 * one of four levels per form-field on every form-bearing entity.
 *
 * State is held client-side as a Map<"entity:field", level>. Save sends the
 * non-default entries; defaults (Editable) are omitted to keep the row count
 * small.
 */
export function FieldPermissionMatrix({
  roleId,
  endpoint,
  queryKey,
}: {
  roleId: string;
  /**
   * Optional override — defaults to the Layer-1 (org-role) endpoint. The
   * per-project User Management page passes the project-scoped variant:
   * `/api/projects/<projectId>/roles/<roleId>/field-permissions`.
   */
  endpoint?: string;
  /** Optional override for the React Query cache key, paired with `endpoint`. */
  queryKey?: readonly unknown[];
}) {
  const qc = useQueryClient();
  const effectiveEndpoint =
    endpoint ?? `/api/org/roles/${roleId}/field-permissions`;
  const effectiveQueryKey =
    queryKey ?? ["quiktrack", "org-role-field-perms", roleId];
  const [levels, setLevels] = useState<Map<string, FieldLevel>>(new Map());
  const [openEntities, setOpenEntities] = useState<Set<string>>(
    () => new Set(FIELD_TREE.map((e) => e.key)),
  );

  // Same anti-stomp guard as PermissionMatrix — background refetches
  // shouldn't wipe in-progress edits.
  const hydratedFor = useRef<string | null>(null);
  const [forceRehydrate, setForceRehydrate] = useState(0);

  const q = useQuery({
    queryKey: effectiveQueryKey,
    queryFn: async () => {
      const r = await fetch(effectiveEndpoint);
      const j = await r.json();
      return j.data as { roleId: string; permissions: SavedRow[] };
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!q.data) return;
    if (hydratedFor.current === roleId && forceRehydrate === 0) return;
    const m = new Map<string, FieldLevel>();
    for (const row of q.data.permissions) {
      m.set(`${row.entity}:${row.field}`, row.level);
    }
    setLevels(m);
    hydratedFor.current = roleId;
  }, [q.data, roleId, forceRehydrate]);

  useEffect(() => {
    if (hydratedFor.current !== roleId) hydratedFor.current = null;
  }, [roleId]);

  const save = useMutation({
    mutationFn: async () => {
      // Only send non-default entries (DB stays compact + future-proof
      // against new fields being added to the catalog).
      const payload: SavedRow[] = [];
      for (const [k, lvl] of levels.entries()) {
        if (lvl === DEFAULT_FIELD_LEVEL) continue;
        const [entity, field] = k.split(":");
        payload.push({ entity, field, level: lvl });
      }
      const r = await fetch(effectiveEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: payload }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => {
      setForceRehydrate((n) => n + 1);
      hydratedFor.current = null;
      qc.invalidateQueries({
        queryKey: effectiveQueryKey,
      });
    },
  });

  function setLevel(entity: string, field: string, level: FieldLevel) {
    const key = `${entity}:${field}`;
    const next = new Map(levels);
    if (level === DEFAULT_FIELD_LEVEL) next.delete(key);
    else next.set(key, level);
    setLevels(next);
  }

  function levelOf(entity: string, field: string): FieldLevel {
    return levels.get(`${entity}:${field}`) ?? DEFAULT_FIELD_LEVEL;
  }

  function toggleEntity(key: string) {
    const next = new Set(openEntities);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenEntities(next);
  }

  if (q.isLoading)
    return <p className="text-sm text-gray-500 px-4 py-3 dark:text-gray-400">Loading…</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gradient-to-b from-gray-50 to-gray-50/60 text-left dark:from-gray-800 dark:to-gray-800/60">
          <tr className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-300">
            <th className="px-4 py-3 w-[40%]">Form field</th>
            {FIELD_LEVELS.map((l) => (
              <th key={l} className="px-3 py-3 text-center w-[15%]">
                {LEVEL_META[l].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELD_TREE.map((entity) => {
            const open = openEntities.has(entity.key);
            // Summary chip — count of fields not at default.
            const nonDefault = entity.fields.filter(
              (f) => levelOf(entity.key, f.key) !== DEFAULT_FIELD_LEVEL,
            ).length;
            return (
              <FieldEntityRows
                key={entity.key}
                entityKey={entity.key}
                entityLabel={entity.label}
                entityDescription={entity.description}
                open={open}
                nonDefault={nonDefault}
                onToggle={() => toggleEntity(entity.key)}
                fields={entity.fields}
                levelOf={(f) => levelOf(entity.key, f)}
                onChange={(f, lvl) => setLevel(entity.key, f, lvl)}
              />
            );
          })}
        </tbody>
      </table>

      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between dark:border-gray-700">
        <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-200">Editable</span> is the
          default — fields not explicitly set behave as editable.
        </p>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function FieldEntityRows({
  entityKey,
  entityLabel,
  entityDescription,
  open,
  nonDefault,
  onToggle,
  fields,
  levelOf,
  onChange,
}: {
  entityKey: string;
  entityLabel: string;
  entityDescription: string;
  open: boolean;
  nonDefault: number;
  onToggle: () => void;
  fields: { key: string; label: string; systemRequired?: boolean; hint?: string }[];
  levelOf: (field: string) => FieldLevel;
  onChange: (field: string, level: FieldLevel) => void;
}) {
  return (
    <>
      <tr className="border-t border-gray-100 bg-gray-50/40 dark:border-gray-700 dark:bg-gray-800/40">
        <td colSpan={5} className="px-4 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-2 text-left"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            )}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{entityLabel}</span>
            {nonDefault > 0 && (
              <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded dark:bg-blue-500/15 dark:text-blue-300">
                {nonDefault} customized
              </span>
            )}
            <span className="text-[11.5px] text-gray-500 ml-1 dark:text-gray-400">
              {entityDescription}
            </span>
          </button>
        </td>
      </tr>
      {open &&
        fields.map((f) => {
          const lvl = levelOf(f.key);
          const meta = findField(entityKey, f.key);
          const sysRequired = meta?.systemRequired ?? false;
          return (
            <tr
              key={f.key}
              className="border-t border-gray-50 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:bg-gray-800/40"
            >
              <td className="px-4 py-2 pl-10 text-gray-700 dark:text-gray-200">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-gray-300 dark:text-gray-600">↳</span>
                  <span>{f.label}</span>
                  {sysRequired && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded dark:bg-amber-500/15 dark:text-amber-300">
                      system
                    </span>
                  )}
                  {f.hint && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{f.hint}</span>
                  )}
                </span>
              </td>
              {FIELD_LEVELS.map((target) => {
                const active = lvl === target;
                // System-required fields can't be hidden or made read-only —
                // those reduce below the form's hard-coded minimum.
                const disabled =
                  sysRequired && (target === "hidden" || target === "readonly");
                return (
                  <td key={target} className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(f.key, target)}
                      className={`inline-flex items-center justify-center h-7 min-w-[72px] px-2.5 text-[11.5px] font-medium rounded-full ring-1 transition-colors ${
                        disabled
                          ? "opacity-30 cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200 dark:bg-gray-800/60 dark:text-gray-500 dark:ring-gray-700"
                          : active
                            ? LEVEL_META[target].tone
                            : "bg-white text-gray-500 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800/60 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700/60"
                      }`}
                    >
                      {LEVEL_META[target].label}
                    </button>
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}
