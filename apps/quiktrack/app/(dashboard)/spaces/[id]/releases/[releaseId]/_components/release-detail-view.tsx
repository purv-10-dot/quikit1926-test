"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronDown, ChevronRight, PanelRightClose, PanelRightOpen, Rocket, X } from "lucide-react";
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
  const [descDraft, setDescDraft] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [sectionTitleEditing, setSectionTitleEditing] = useState(false);
  const [sectionTitleDraft, setSectionTitleDraft] = useState("");

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

  async function saveName() {
    const t = nameDraft.trim();
    if (!t || !release) return;
    setNameEditing(false);
    if (t === release.name) return;
    await patch({ name: t });
  }

  async function saveSectionTitle() {
    const t = sectionTitleDraft.trim();
    setSectionTitleEditing(false);
    if (!release || t === (release.sectionTitle ?? "")) return;
    await patch({ sectionTitle: t || null });
  }

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
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-100">
            <Rocket className="h-4 w-4 text-blue-600" />
          </span>
          {nameEditing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") setNameEditing(false);
                }}
                className="flex-1 min-w-0 h-9 px-3 text-2xl font-semibold border border-blue-500 rounded focus:outline-none"
              />
              <button
                type="button"
                disabled={!nameDraft.trim()}
                onClick={() => void saveName()}
                className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50"
                aria-label="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setNameEditing(false)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => {
                if (!canUpdate) return;
                setNameDraft(release.name);
                setNameEditing(true);
              }}
              className={`text-2xl font-semibold tracking-tight text-gray-900 truncate rounded px-1 -mx-1 ${
                canUpdate ? "cursor-text hover:bg-gray-50" : ""
              }`}
            >
              {release.name}
            </h1>
          )}
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

      <div
        className={`grid gap-5 items-start ${
          sidebarOpen ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"
        }`}
      >
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-1.5 w-full px-4 py-3">
              <button
                type="button"
                onClick={() => setDescOpen((v) => !v)}
                className="p-0.5 -m-0.5 rounded hover:bg-gray-100 text-gray-500"
                aria-label={descOpen ? "Collapse section" : "Expand section"}
              >
                {descOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {sectionTitleEditing ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    autoFocus
                    value={sectionTitleDraft}
                    onChange={(e) => setSectionTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveSectionTitle();
                      if (e.key === "Escape") setSectionTitleEditing(false);
                    }}
                    placeholder="Give this section a name"
                    className="flex-1 min-w-0 h-8 px-2 text-sm border border-blue-500 rounded focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void saveSectionTitle()}
                    className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                    aria-label="Save section name"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectionTitleEditing(false)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!canUpdate) return;
                    setSectionTitleDraft(release.sectionTitle ?? "");
                    setSectionTitleEditing(true);
                  }}
                  className={`text-sm font-semibold rounded px-1 -mx-1 text-left ${
                    release.sectionTitle ? "text-gray-900" : "text-gray-400"
                  } ${canUpdate ? "hover:bg-gray-50" : ""}`}
                >
                  {release.sectionTitle || "Give this section a name"}
                </button>
              )}
            </div>
            {descOpen && (
              <div className="px-4 pb-4">
                {descEditing ? (
                  <div>
                    <RichTextEditor value={descDraft} onChange={setDescDraft} placeholder="Add your own text here! You can use rich text, hyperlinks, dates, emojis, and more." />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDescEditing(false);
                          void patch({ sectionText: descDraft || null });
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
                ) : release.sectionText ? (
                  <div
                    onClick={() => {
                      if (!canUpdate) return;
                      setDescDraft(release.sectionText ?? "");
                      setDescEditing(true);
                    }}
                    className={`rounded px-2 py-1.5 -mx-2 ${canUpdate ? "cursor-text hover:bg-gray-50" : ""}`}
                  >
                    <RichTextView html={sanitizeRichText(release.sectionText)} />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canUpdate}
                    onClick={() => {
                      setDescDraft("");
                      setDescEditing(true);
                    }}
                    className={`block w-full text-left text-sm text-gray-500 rounded px-2 py-1.5 -mx-2 ${
                      canUpdate ? "hover:bg-gray-50" : "cursor-default"
                    }`}
                  >
                    Add your own text here! You can use rich text, hyperlinks, dates, emojis, and more.
                  </button>
                )}
              </div>
            )}
          </div>

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
          <div className="min-w-0 space-y-4 pt-4 border-t border-gray-200 lg:pt-0 lg:border-t-0">
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
