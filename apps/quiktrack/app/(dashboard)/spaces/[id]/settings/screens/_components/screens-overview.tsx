"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, MoreHorizontal } from "lucide-react";
import { ScreenNameDialog } from "./screen-name-dialog";
import { useClickOutside } from "./use-click-outside";

interface ScreenRow {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  updatedAt: string;
}

const QKEY = (projectId: string) => ["quiktrack", "screens", projectId];

async function fetchScreens(): Promise<ScreenRow[]> {
  const r = await fetch("/api/screens");
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as ScreenRow[];
}

/** Space settings → Screens. The Jira "Screens" list: Add screen, filter, table. */
export function ScreensOverview({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<ScreenRow | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useClickOutside<HTMLDivElement>(menuFor != null, () => setMenuFor(null));

  const { data, isLoading, error } = useQuery({
    queryKey: QKEY(projectId),
    queryFn: fetchScreens,
    refetchOnMount: "always",
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: QKEY(projectId) });

  const create = useMutation({
    mutationFn: async (v: { name: string; description?: string }) => {
      const r = await fetch("/api/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to create");
      return j.data as { id: string };
    },
    onSuccess: () => { invalidate(); setCreateOpen(false); },
  });

  const rename = useMutation({
    mutationFn: async (v: { id: string; name: string; description?: string }) => {
      const r = await fetch(`/api/screens/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v.name, description: v.description ?? null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to save");
    },
    onSuccess: () => { invalidate(); setRenaming(null); },
  });

  const copy = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/screens/${id}/copy`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to copy");
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/screens/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to delete");
    },
    onSuccess: invalidate,
  });

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Screens</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            A screen is an arrangement of fields that are displayed when the work item is created,
            edited or transitioned through workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
        >
          Add screen
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded border border-gray-300 px-2.5 py-2 focus-within:border-accent-500 max-w-sm">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name"
          className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-10 text-sm text-red-600">{(error as Error).message}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="bg-accent-50 px-4 py-2.5">Name</th>
                <th className="w-16 bg-accent-50 px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/spaces/${projectId}/settings/screens/${s.id}`}
                      className="font-medium text-accent-700 hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.description && <div className="text-xs text-gray-500">{s.description}</div>}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuFor === s.id && (
                      <div ref={menuRef} className="absolute right-4 top-10 z-10 w-36 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg">
                        <Link
                          href={`/spaces/${projectId}/settings/screens/${s.id}`}
                          className="block px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Configure
                        </Link>
                        <button
                          type="button"
                          onClick={() => { setMenuFor(null); setRenaming(s); }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMenuFor(null); copy.mutate(s.id); }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Copy
                        </button>
                        {!s.isDefault && (
                          <button
                            type="button"
                            onClick={() => { setMenuFor(null); if (confirm(`Delete "${s.name}"?`)) remove.mutate(s.id); }}
                            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-400">No screens.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <ScreenNameDialog
          title="Add screen"
          submitLabel="Add"
          busy={create.isPending}
          error={create.error ? (create.error as Error).message : null}
          onSubmit={(name, description) => create.mutate({ name, description })}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {renaming && (
        <ScreenNameDialog
          title="Edit screen"
          submitLabel="Save"
          initialName={renaming.name}
          initialDescription={renaming.description ?? ""}
          busy={rename.isPending}
          error={rename.error ? (rename.error as Error).message : null}
          onSubmit={(name, description) => rename.mutate({ id: renaming.id, name, description })}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
