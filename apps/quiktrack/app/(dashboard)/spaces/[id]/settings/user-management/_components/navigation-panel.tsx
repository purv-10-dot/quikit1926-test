"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@quikit/ui";
import { NAV_ITEMS, PERMISSION_TREE } from "@/lib/api/permissionsRegistry";

interface Payload {
  roleId: string;
  navKeys: string[];
}

export function ProjectNavigationPanel({
  projectId,
  roleId,
}: {
  projectId: string;
  roleId: string;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quiktrack", "project-role-nav", projectId, roleId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles/${roleId}/navigation`);
      const j = await r.json();
      return j.data as Payload;
    },
  });

  useEffect(() => {
    if (q.data) setEnabled(new Set(q.data.navKeys));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles/${roleId}/navigation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navKeys: Array.from(enabled) }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-role-nav", projectId, roleId] }),
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
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
