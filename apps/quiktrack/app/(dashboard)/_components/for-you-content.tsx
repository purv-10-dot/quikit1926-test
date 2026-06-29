"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Columns, Bookmark, Zap, CheckSquare, LayoutDashboard } from "lucide-react";
import { TruckIllustration } from "@/components/illustrations/truck";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { SpaceIcon } from "@/components/space-icon";
import {
  type HistoryEntry,
  fetchActivity,
  groupHistoryByDay,
  relativeTime,
} from "@/lib/utils/history";

type Tab = "recommended" | "assigned" | "starred" | "worked" | "viewed";

interface SpaceCard {
  id: string;
  name: string;
  projectType?: string;
  icon?: string | null;
  color?: string | null;
  leadUserId?: string | null;
  updatedAt?: string;
}

const TOP_N = 5;
console.log("TOP_N", TOP_N);
const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "assigned", label: "Assigned to me", count: 0 },
  // { key: "starred", label: "Starred" },
  // { key: "worked", label: "Worked on" },
  { key: "viewed", label: "Viewed" },
];

function spaceTypeLabel(t?: string) {
  if (t === "software") return "Software project";
  if (t === "discovery") return "Product Discovery";
  if (t === "service") return "Service space";
  return "Software project";
}

function KindIcon({ kind }: { kind: HistoryEntry["kind"] }) {
  const cls = "h-4 w-4";
  if (kind === "task") return <CheckSquare className={`${cls} text-blue-500`} />;
  if (kind === "epic") return <Zap className={`${cls} text-purple-500`} />;
  if (kind === "dashboard") return <LayoutDashboard className={`${cls} text-gray-500`} />;
  if (kind === "board") return <Columns className={`${cls} text-gray-500`} />;
  return <Bookmark className={`${cls} text-orange-500`} />;
}

export function ForYouContent() {
  const { data: session } = useSession();
  const perms = useMyPermissions();
  const canCreateProject = perms.loading || perms.has("Project", "create");
  const currentUserId = session?.user?.id ?? null;
  const [tab, setTab] = useState<Tab>("viewed");
  const [allSpaces, setAllSpaces] = useState<SpaceCard[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  // Pull a generous page of spaces (sorted by recently updated) and slice
  // it locally for each tab — Recommended/Assigned/Worked-on all read off
  // the same payload, so we only hit /api/projects once.
  useEffect(() => {
    let alive = true;
    fetch("/api/projects?sort=updatedAt&order=desc&pageSize=50")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setAllSpaces(j.data ?? []);
      })
      .catch(() => alive && setAllSpaces([]));
    return () => {
      alive = false;
    };
  }, []);

  const recommended = allSpaces?.slice(0, TOP_N) ?? null;
  const assignedToMe = useMemo(() => {
    if (!allSpaces || !currentUserId) return null;
    return allSpaces.filter((s) => s.leadUserId === currentUserId).slice(0, TOP_N);
  }, [allSpaces, currentUserId]);
  // "Worked on" — most recently *visited* spaces, derived from the activity
  // history. Fall back to recently-updated spaces when the history is empty
  // so the tab is never just blank illustration on a new tenant.
  const workedOn = useMemo<SpaceCard[] | null>(() => {
    if (allSpaces === null) return null;
    if (history === null) return null;
    const projectVisits = history.filter((h) => h.kind === "project");
    if (projectVisits.length === 0) return allSpaces.slice(0, TOP_N);
    const seen = new Set<string>();
    const ordered: SpaceCard[] = [];
    for (const v of projectVisits) {
      const id = v.id.replace(/^project:/, "");
      if (seen.has(id)) continue;
      const hit = allSpaces.find((s) => s.id === id);
      if (hit) {
        seen.add(id);
        ordered.push(hit);
      }
      if (ordered.length >= TOP_N) break;
    }
    return ordered;
  }, [allSpaces, history]);

  const tabCounts: Partial<Record<Tab, number>> = {
    assigned: assignedToMe?.length ?? 0,
  };

  useEffect(() => {
    let alive = true;
    fetchActivity(30).then((rows) => {
      if (alive) setHistory(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const grouped = groupHistoryByDay(history ?? []);

  return (
    <div className="px-12 py-6 max-w-[1180px] mx-auto">
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Recommended projects</h2>
          <Link href="/spaces" className="text-sm text-blue-600 hover:underline">
            View all projects
          </Link>
        </div>
        {recommended === null ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: TOP_N }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border border-gray-200 rounded-md p-3 animate-pulse"
              >
                <div className="h-9 w-9 rounded bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-2 w-16 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : recommended.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {recommended.map((s) => (
              <Link
                key={s.id}
                href={`/spaces/${s.id}/backlog`}
                className="flex items-center gap-3 border border-gray-200 rounded-md p-3 hover:bg-gray-50"
              >
                <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={36} radius={8} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {spaceTypeLabel(s.projectType)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-md p-6 text-center">
            {canCreateProject ? (
              <>
                No projects yet.{" "}
                <Link href="/spaces/templates" className="text-blue-600 hover:underline">
                  Create your first project
                </Link>
                .
              </>
            ) : (
              <>
                You&apos;re not on any project yet. Once an admin adds you to
                a project, your activity will appear here.
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">For you</h2>
          <div className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = t.key === tab;
              const count = tabCounts[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-2 py-1 text-sm rounded ${
                    active ? "text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-100"
                  } ${active ? "border-b-2 border-gray-900 rounded-b-none" : ""}`}
                >
                  {t.label}
                  {typeof count === "number" && (
                    <span className="ml-1.5 inline-block bg-blue-600 text-white text-[11px] rounded px-1.5 leading-5">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recommended / Assigned to me / Worked on — all read off the
            shared `allSpaces` payload and render a list of space cards. */}
        {tab === "recommended" && (
          <SpaceList spaces={recommended} emptyMessage="No projects yet." />
        )}
        {tab === "assigned" && (
          <SpaceList
            spaces={assignedToMe}
            emptyMessage="You don't lead any projects yet."
          />
        )}
        {tab === "worked" && (
          <SpaceList
            spaces={workedOn}
            emptyMessage="You haven't opened any projects yet."
          />
        )}

        {tab === "viewed" && history === null && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-2 animate-pulse">
                <div className="h-7 w-7 rounded bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-2 w-24 rounded bg-gray-200" />
                </div>
                <div className="h-2 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        )}

        {tab === "viewed" && history !== null && grouped.length === 0 && (
          <EmptyFeed />
        )}

        {tab === "viewed" &&
          history !== null &&
          grouped.length > 0 &&
          grouped.map(({ group, items }) => (
            <div key={group} className="mb-6">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                {group}
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((r) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-gray-50"
                  >
                    {r.icon || r.kind === "project" ? (
                      <SpaceIcon icon={r.icon} name={r.title} color={r.color} size={28} radius={6} />
                    ) : (
                      <span className="h-7 w-7 rounded bg-gray-100 flex items-center justify-center shrink-0">
                        <KindIcon kind={r.kind} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{r.title}</div>
                      {r.meta && (
                        <div className="text-xs text-gray-500 truncate">{r.meta}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 shrink-0">
                      {relativeTime(r.ts)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

        {tab === "starred" && <EmptyFeed />}
      </section>
    </div>
  );
}

function SpaceList({
  spaces,
  emptyMessage,
}: {
  spaces: SpaceCard[] | null;
  emptyMessage: string;
}) {
  if (spaces === null) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: TOP_N }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border border-gray-200 rounded-md p-3 animate-pulse"
          >
            <div className="h-9 w-9 rounded bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-2 w-16 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (spaces.length === 0) {
    return (
      <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-md p-6 text-center">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {spaces.map((s) => (
        <Link
          key={s.id}
          href={`/spaces/${s.id}/backlog`}
          className="flex items-center gap-3 border border-gray-200 rounded-md p-3 hover:bg-gray-50"
        >
          <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={36} radius={8} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
            <div className="text-xs text-gray-500 truncate">
              {spaceTypeLabel(s.projectType)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <TruckIllustration className="mb-5" />
      <h3 className="text-sm font-semibold text-gray-900">
        You haven&apos;t worked on anything yet
      </h3>
      <p className="mt-2 max-w-sm text-sm text-gray-600">
        In this page, you&apos;ll find your worked on issues. Get started by finding the
        project your team is working on.
      </p>
      <Link
        href="/spaces"
        className="mt-5 inline-flex items-center justify-center h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded"
      >
        View all projects
      </Link>
    </div>
  );
}
