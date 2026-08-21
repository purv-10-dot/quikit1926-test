"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, MoreHorizontal, Plus } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { showToast } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import { CreateReleaseModal } from "./create-release-modal";
import {
  RELEASE_STATUS_META,
  fmtReleaseDate,
  memberLabel,
  type ReleaseListItem,
  type ReleaseMember,
} from "./releases-meta";

const COLS = "grid grid-cols-[minmax(0,1.6fr)_120px_minmax(160px,1fr)_110px_110px_minmax(140px,1fr)_40px] gap-4 px-4";

export function ReleasesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const perms = useMyProjectPermissions(projectId);
  const canCreate = perms.loading || perms.has("Release", "create");
  const canUpdate = perms.loading || perms.has("Release", "update");
  const canDelete = perms.loading || perms.has("Release", "delete");

  const [releases, setReleases] = useState<ReleaseListItem[]>([]);
  const [members, setMembers] = useState<ReleaseMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseListItem | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadReleases = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/releases?projectId=${projectId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success) setReleases((res.data ?? []) as ReleaseListItem[]);
    setLoading(false);
  }, [projectId]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success) {
      const data = res.data?.members ?? res.data;
      setMembers(Array.isArray(data) ? data : []);
    }
  }, [projectId]);

  useEffect(() => {
    void loadReleases();
    void loadMembers();
  }, [loadReleases, loadMembers]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuOpenId && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpenId]);

  async function archiveRelease(r: ReleaseListItem) {
    setMenuOpenId(null);
    const res = await fetch(`/api/releases/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: r.status === "ARCHIVED" ? "UNRELEASED" : "ARCHIVED" }),
    }).then((res2) => res2.json());
    if (res?.success) void loadReleases();
    else showToast(res?.error || "Couldn't update the release.", "error");
  }

  async function deleteRelease(r: ReleaseListItem) {
    setMenuOpenId(null);
    const ok = await confirmDialog({
      title: "Delete release",
      message: `Delete "${r.name}"? This can't be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/releases/${r.id}`, { method: "DELETE" }).then((r2) => r2.json());
    if (res?.success) void loadReleases();
    else showToast(res?.error || "Couldn't delete the release.", "error");
  }

  const driverLabel = (driverId: string | null) => {
    if (!driverId) return "—";
    const m = members.find((x) => x.userId === driverId);
    return m ? memberLabel(m) : "—";
  };

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Releases</h1>
          <p className="text-sm text-gray-500">
            Plan and track versions of this project as they move to release.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Plus className="h-4 w-4" />
            Create release
          </button>
        )}
      </header>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <div className={`${COLS} py-3 bg-gray-50 dark:bg-gray-900 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 font-semibold`}>
          <div>Release</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Start date</div>
          <div>Release date</div>
          <div>Driver</div>
          <div />
        </div>

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-t border-gray-100 first:border-t-0">
              <span className="qt-shimmer block h-6 rounded" />
            </div>
          ))
        ) : releases.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Rocket className="mx-auto h-6 w-6 text-gray-300" />
            <div className="mt-2 text-sm font-medium text-gray-700">No releases yet</div>
            <div className="text-xs text-gray-400">
              Create a release to start tracking work toward a version.
            </div>
          </div>
        ) : (
          releases.map((r) => {
            const total = r.linkedWorkItemCount || 1;
            const donePct = (r.counts.done / total) * 100;
            const inProgPct = (r.counts.inProgress / total) * 100;
            const meta = RELEASE_STATUS_META[r.status];
            return (
              <div
                key={r.id}
                className={`${COLS} py-3 border-t border-gray-100 items-center hover:bg-blue-50/30 transition-colors`}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/spaces/${projectId}/releases/${r.id}`)}
                  className="flex items-center gap-2.5 text-left min-w-0 group"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-100">
                    <Rocket className="h-3.5 w-3.5 text-blue-600" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-900 group-hover:text-blue-700 group-hover:underline">
                      {r.name}
                    </span>
                    {r.description && (
                      <span className="block truncate text-xs text-gray-500">{r.description}</span>
                    )}
                  </span>
                </button>

                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>

                <div>
                  {r.linkedWorkItemCount > 0 ? (
                    <>
                      <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full bg-green-500" style={{ width: `${donePct}%` }} />
                        <div className="h-full bg-blue-500" style={{ width: `${inProgPct}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                        {r.counts.done} done · {r.counts.inProgress} in progress · {r.counts.todo} to do
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">No work items</span>
                  )}
                </div>

                <div className="text-xs text-gray-600">{fmtReleaseDate(r.startDate)}</div>
                <div className="text-xs text-gray-600">{fmtReleaseDate(r.releaseDate)}</div>
                <div className="text-xs text-gray-600 truncate">{driverLabel(r.driverId)}</div>

                <div className="relative flex justify-end">
                  {(canUpdate || canDelete) && (
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === r.id ? null : r.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                  {menuOpenId === r.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1"
                    >
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setEditing(r);
                            setModalOpen(true);
                          }}
                          className="block w-full px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Edit
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => void archiveRelease(r)}
                          className="block w-full px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {r.status === "ARCHIVED" ? "Unarchive" : "Archive"}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteRelease(r)}
                          className="block w-full px-3 py-1.5 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <CreateReleaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        projectId={projectId}
        members={members}
        initialRelease={editing}
        onSaved={loadReleases}
      />
    </div>
  );
}
