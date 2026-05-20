"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox } from "@quikit/ui";
import { NAV_ITEMS } from "@/lib/api/permissionsRegistry";

interface Payload {
  roleId: string;
  isSystem: boolean;
  navKeys: string[];
}

export function RoleNavigationPanel({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quiktrack", "role-nav", roleId],
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
      qc.invalidateQueries({ queryKey: ["quiktrack", "role-nav", roleId] }),
  });

  function toggle(key: string) {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabled(next);
  }

  if (q.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {NAV_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled.has(item.key)} onChange={() => toggle(item.key)} />
            <span>{item.label}</span>
            <span className="text-xs text-gray-400">({item.key})</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save Navigation"}
        </Button>
      </div>
    </div>
  );
}
