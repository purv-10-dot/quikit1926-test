"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Rocket } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { showToast } from "@/lib/ui/toast";
import { ReleaseHeaderBar } from "./release-header-bar";
import { ProgressPanel } from "./progress-panel";
import { RelatedWorkSection } from "./related-work-section";
import { WorkItemsSection } from "./work-items-section";
import { ApproversSection } from "./approvers-section";
import type { ReleaseDetail, ReleaseMember } from "./release-detail-meta";

export function ReleaseDetailView({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const perms = useMyProjectPermissions(projectId);
  const canUpdate = perms.loading || perms.has("Release", "update");
  const canManageApprovers = perms.loading || perms.has("ReleaseApprover", "create");
  const canDeleteApprovers = perms.loading || perms.has("ReleaseApprover", "delete");

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [members, setMembers] = useState<ReleaseMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = () => setRefreshKey((k) => k + 1);

  const load = useCallback(async () => {
    const res = await fetch(`/api/releases/${releaseId}`).then((r) => r.json()).catch(() => null);
    if (res?.success) setRelease(res.data as ReleaseDetail);
    setLoading(false);
  }, [releaseId]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/members`).then((r) => r.json()).catch(() => null);
    if (res?.success) {
      const data = res.data?.members ?? res.data;
      setMembers(Array.isArray(data) ? data : []);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadMembers();
  }, [load, loadMembers]);

  async function patch(body: Record<string, unknown>) {
    if (!release) return;
    const res = await fetch(`/api/releases/${release.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (res?.success) {
      setRelease((cur) => (cur ? { ...cur, ...res.data } : cur));
    } else {
      showToast(res?.error || "That change couldn't be saved.", "error");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="qt-shimmer h-6 w-48 rounded mb-4" />
        <div className="qt-shimmer h-40 w-full rounded" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        This release could not be found.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href={`/spaces/${projectId}/releases`}
          className="inline-flex items-center gap-1 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Releases
        </Link>
      </div>

      <header className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-100">
          <Rocket className="h-4 w-4 text-blue-600" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{release.name}</h1>
      </header>

      <div className="flex items-start gap-5 flex-wrap lg:flex-nowrap">
        <div className="flex-1 min-w-0 space-y-4">
          <RelatedWorkSection
            releaseId={release.id}
            links={release.relatedLinks}
            canEdit={canUpdate}
            onChanged={() => {
              void load();
              bump();
            }}
          />

          <WorkItemsSection
            projectId={projectId}
            releaseId={release.id}
            canEdit={canUpdate}
            onChanged={bump}
          />

          <ApproversSection
            releaseId={release.id}
            approvers={release.approvers}
            members={members}
            canManage={canManageApprovers || canDeleteApprovers}
            onChanged={load}
          />
        </div>

        <div className="w-full lg:w-[320px] shrink-0 space-y-4">
          <ReleaseHeaderBar release={release} members={members} canEdit={canUpdate} onPatch={patch} />
          <ProgressPanel releaseId={release.id} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
