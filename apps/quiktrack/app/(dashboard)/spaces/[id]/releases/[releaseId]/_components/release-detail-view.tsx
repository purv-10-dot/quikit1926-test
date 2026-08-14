"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ChevronRight, PanelRightClose, PanelRightOpen, Rocket } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { showToast } from "@/lib/ui/toast";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { RichTextView } from "@/components/rich-text-view";
import { sanitizeRichText } from "@/lib/sanitize";
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
  const [descOpen, setDescOpen] = useState(true);
  const [descText, setDescText] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

      <header className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-100">
            <Rocket className="h-4 w-4 text-blue-600" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{release.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
      </header>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setDescOpen((v) => !v)}
          className="flex items-center gap-1.5 w-full px-4 py-3 text-sm font-semibold text-gray-900"
        >
          {descOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Give this section a name
        </button>
        {descOpen && (
          <div className="px-4 pb-4">
            {descEditing ? (
              <div>
                <RichTextEditor value={descDraft} onChange={setDescDraft} placeholder="Add your own text here! You can use rich text, hyperlinks, dates, emojis, and more." />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDescText(descDraft);
                      setDescEditing(false);
                    }}
                    className="h-8 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescEditing(false)}
                    className="h-8 px-3 text-xs text-gray-700 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : descText ? (
              <div
                onClick={() => {
                  setDescDraft(descText);
                  setDescEditing(true);
                }}
                className="cursor-text rounded px-2 py-1.5 -mx-2 hover:bg-gray-50"
              >
                <RichTextView html={sanitizeRichText(descText)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDescDraft("");
                  setDescEditing(true);
                }}
                className="block w-full text-left text-sm text-gray-500 rounded px-2 py-1.5 -mx-2 hover:bg-gray-50"
              >
                Add your own text here! You can use rich text, hyperlinks, dates, emojis, and more.
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-5 flex-wrap lg:flex-nowrap">
        <div className="flex-1 min-w-0 space-y-4">
          <RelatedWorkSection
            projectId={projectId}
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
        </div>

        {sidebarOpen && (
          <div className="w-full lg:w-[320px] shrink-0 space-y-4">
            <ReleaseHeaderBar release={release} members={members} canEdit={canUpdate} onPatch={patch} />
            <ApproversSection
              releaseId={release.id}
              approvers={release.approvers}
              members={members}
              canManage={canManageApprovers || canDeleteApprovers}
              onChanged={load}
            />
            <ProgressPanel releaseId={release.id} refreshKey={refreshKey} />
          </div>
        )}
      </div>
    </div>
  );
}
