"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@quikit/ui";
import { Search, Users, X } from "lucide-react";
import { SpaceDialog } from "./space-dialog";

interface TeamRow {
  teamId: string;
  name: string;
  description: string | null;
  color: string | null;
  memberCount: number;
}

interface TeamsPayload {
  linked: TeamRow[];
  available: TeamRow[];
  canManage: boolean;
}

/**
 * "Linked teams" — view, link and unlink the org teams associated with this
 * space (project header "..." menu).
 *
 * Linking is an association only: it never changes who can access the space.
 * That stays an explicit act in Add people / user management — see the note in
 * `lib/services/projectTeams.ts`.
 */
export function LinkedTeamsDialog({
  projectId,
  spaceName,
  onClose,
}: {
  projectId: string;
  spaceName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["quiktrack", "project-teams", projectId], [projectId]);

  const { data, isLoading } = useQuery<TeamsPayload>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/teams`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load teams");
      return json.data as TeamsPayload;
    },
  });

  const link = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await fetch(`/api/projects/${projectId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to link team");
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to link team"),
  });

  const unlink = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await fetch(`/api/projects/${projectId}/teams/${teamId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to unlink team");
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to unlink team"),
  });

  const canManage = data?.canManage ?? false;
  const busy = link.isPending || unlink.isPending;

  const filteredAvailable = (data?.available ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <SpaceDialog
      open
      title="Linked teams"
      description={`Teams that work on ${spaceName}. Linking a team records the association — it doesn't grant anyone access to this space.`}
      onClose={onClose}
      busy={busy}
      footer={
        <Button variant="outline" size="md" onClick={onClose} disabled={busy}>
          Done
        </Button>
      }
    >
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Linked ({data?.linked.length ?? 0})
            </h3>
            {(data?.linked.length ?? 0) === 0 ? (
              <p className="mt-2 rounded border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                No teams linked yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
                {data?.linked.map((t) => (
                  <li key={t.teamId} className="flex items-center gap-3 px-3 py-2.5">
                    <TeamAvatar name={t.name} color={t.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {t.memberCount} {t.memberCount === 1 ? "member" : "members"}
                        {t.description ? ` • ${t.description}` : ""}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => unlink.mutate(t.teamId)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Unlink
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canManage && (
            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Link a team
              </h3>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teams…"
                  className="w-full rounded border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              {filteredAvailable.length === 0 ? (
                <p className="mt-2 px-1 text-sm text-gray-500">
                  {(data?.available.length ?? 0) === 0
                    ? "Every team in your organisation is already linked."
                    : "No teams match that search."}
                </p>
              ) : (
                <ul className="mt-2 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-200">
                  {filteredAvailable.map((t) => (
                    <li key={t.teamId} className="flex items-center gap-3 px-3 py-2.5">
                      <TeamAvatar name={t.name} color={t.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-500">
                          {t.memberCount} {t.memberCount === 1 ? "member" : "members"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => link.mutate(t.teamId)}
                        disabled={busy}
                      >
                        Link
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!canManage && (
            <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
              <Users className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Only a space admin can link or unlink teams.
            </p>
          )}
        </>
      )}
    </SpaceDialog>
  );
}

function TeamAvatar({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-xs font-semibold text-white"
      style={{ backgroundColor: color ?? "#2563eb" }}
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
