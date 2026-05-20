"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@quikit/ui";
import { ENTITY_TO_NAV, NAV_ITEMS, PERMISSION_TREE } from "@/lib/api/permissionsRegistry";

interface Payload {
  roleId: string;
  navKeys: string[];
}

export function NavigationPanel({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quiktrack", "org-role-nav", roleId],
    queryFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/navigation`);
      const j = await r.json();
      return j.data as Payload;
    },
  });

  useEffect(() => {
    if (q.data) setEnabled(new Set(q.data.navKeys));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/navigation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navKeys: Array.from(enabled) }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-role-nav", roleId] }),
  });

  function toggle(key: string) {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabled(next);
  }

  const grouped = useMemo(() => {
    const out: { groupKey: string; groupLabel: string; items: (typeof NAV_ITEMS)[number][] }[] = [];
    const seen = new Map<string, number>();
    for (const item of NAV_ITEMS) {
      const groupKey = item.key.includes(".") ? item.key.split(".")[0] : item.key;
      const label = upperLabel(groupKey);
      if (!seen.has(groupKey)) {
        seen.set(groupKey, out.length);
        out.push({ groupKey, groupLabel: label, items: [] });
      }
      out[seen.get(groupKey)!].items.push(item);
    }
    return out;
  }, []);

  if (q.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  const derivedRows = Object.entries(ENTITY_TO_NAV);

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      <section className="px-6 py-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
          Auto-derived from Entities
        </h4>
        <p className="text-[12px] text-gray-500 mb-3">
          These sidebar items appear whenever the role has{" "}
          <span className="font-medium text-gray-700">view</span> on the
          matching entity. Manage them on the <span className="font-medium">Entities</span> tab.
        </p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-8">
          {derivedRows.map(([entity, navKey]) => (
            <div
              key={navKey}
              className="flex items-center justify-between gap-2 text-sm text-gray-500"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                {labelForNav(navKey)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                ← {entity}:view
              </span>
            </div>
          ))}
        </div>
      </section>

      {grouped.map((g) => (
        <section key={g.groupKey} className="px-6 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            {g.groupLabel}
          </h4>
          <div className="grid grid-cols-2 gap-y-2 gap-x-8">
            {g.items.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={enabled.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>
      ))}
      <div className="px-4 py-3 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-blue-600 hover:bg-blue-700">
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function upperLabel(groupKey: string): string {
  const match = PERMISSION_TREE.find((m) => m.key.toLowerCase() === groupKey.toLowerCase());
  if (match) return match.label.toUpperCase();
  return groupKey.toUpperCase();
}

function labelForNav(navKey: string): string {
  // Reverse-lookup a friendly label using the PERMISSION_TREE entity labels.
  const map: Record<string, string> = {
    spaces: "Spaces",
    timesheet: "Timesheet",
    reports: "Reports",
  };
  return map[navKey] ?? navKey;
}
