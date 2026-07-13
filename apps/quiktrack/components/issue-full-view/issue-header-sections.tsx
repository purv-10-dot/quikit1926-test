"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  ListTree,
  Zap,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import { uploadProjectImage } from "@/lib/upload-image";
import type { MentionItem } from "@/components/editor/mention";
import { SubtaskGrid } from "./subtask-grid";
import { AddEpicButton } from "./add-epic-button";
import { ChildWorkItems } from "./child-work-items";
import type { IssuePageData, IssueType } from "./types";

const TYPE_ICON_FOR_HEADER: Record<IssueType, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: ListTree, color: "text-blue-500" },
  BUG: { Icon: ListTree, color: "text-red-500" },
  STORY: { Icon: ListTree, color: "text-green-600" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500" },
};

interface Props {
  issue: IssuePageData;
  projectId: string;
  projectName: string;
  typeIcon: { Icon: React.ElementType; color: string };
  onPatch: (data: Record<string, unknown>) => Promise<void>;
  /** People list for `@`-mentions in the description editor. */
  mentions?: MentionItem[];
}

/**
 * Top-of-page chrome for the full issue view: breadcrumb, title row, quick
 * actions, Description (collapsible), and Subtasks (collapsible).
 *
 * Lives in its own file so the orchestrator stays under the 300-LOC ceiling.
 */
export function IssueHeaderSections({
  issue,
  projectId,
  projectName,
  typeIcon: T,
  onPatch,
  mentions,
}: Props) {
  const [descOpen, setDescOpen] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  // Auto-open Description when there's content.
  useEffect(() => {
    if (issue.description) setDescOpen(true);
  }, [issue.description]);

  return (
    <>
      {/* Breadcrumb — sticky at the top of the scrolling viewport, scoped
          to the left column so it doesn't bleed under the right rail's
          status pill. */}
      <div className="sticky top-0 z-10 py-3 bg-white border-b border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/spaces" className="hover:text-gray-800">
          Spaces
        </Link>
        <span className="text-gray-300">/</span>
        <Link
          href={`/spaces/${projectId}/board`}
          className="hover:text-gray-800 inline-flex items-center gap-1.5 text-gray-700"
        >
          <span className="h-4 w-4 rounded bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
            {projectName.charAt(0).toUpperCase()}
          </span>
          {projectName}
        </Link>
        {/* Breadcrumb middle segment varies by type:
              - SUBTASK  → parent task chip
              - EPIC     → no extra segment (epics sit directly under project)
              - others   → epic chip (or "Add epic" picker) */}
        {issue.type === "SUBTASK" && issue.parent ? (
          <>
            <span className="text-gray-300">/</span>
            <Link
              href={`/spaces/${projectId}/work/${issue.parent.id}`}
              className="hover:text-gray-800 inline-flex items-center gap-1 text-gray-700"
            >
              <Zap className="h-3 w-3 text-blue-500" />
              {issue.parent.key}
            </Link>
          </>
        ) : issue.type !== "EPIC" && issue.type !== "SUBTASK" ? (
          <>
            <span className="text-gray-300">/</span>
            {issue.epic ? (
              <Link
                href={`/spaces/${projectId}/work/${issue.epic.id}`}
                className="hover:text-gray-800 inline-flex items-center gap-1 text-gray-700"
              >
                <Zap className="h-3 w-3 text-purple-500" />
                {issue.epic.key}
              </Link>
            ) : (
              <AddEpicButton
                projectId={projectId}
                currentEpicId={issue.epicId}
                onPick={(epicId) => onPatch({ epicId })}
              />
            )}
          </>
        ) : null}
        <span className="text-gray-300">/</span>
        <span className="inline-flex items-center gap-1 text-gray-700">
          <T.Icon className={`h-3.5 w-3.5 ${T.color}`} />
          {issue.key}
        </span>
      </div>

      {/* Title */}
      <div className="mt-5 mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{issue.title}</h1>
      </div>

      {/* Description (collapsible) */}
      <section className="mb-5">
        <button
          type="button"
          onClick={() => setDescOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {descOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Description
        </button>
        {descOpen && (
          <div className="mt-2">
            {descEditing ? (
              <div>
                <RichTextEditor
                  value={descDraft}
                  onChange={setDescDraft}
                  placeholder="Add a description..."
                  mentions={mentions ?? []}
                  uploadImage={(file) => uploadProjectImage(projectId, file)}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDescEditing(false);
                      setDescDraft("");
                    }}
                    className="h-7 px-3 text-xs text-gray-700 rounded hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onPatch({ description: descDraft });
                      setDescEditing(false);
                    }}
                    className="h-7 px-3 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : issue.description ? (
              <div
                onClick={() => {
                  setDescDraft(issue.description ?? "");
                  setDescEditing(true);
                }}
                className="qt-rich-content text-sm text-gray-800 rounded p-2 -mx-2 cursor-text hover:bg-gray-50"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(issue.description) }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDescDraft("");
                  setDescEditing(true);
                }}
                className="text-sm text-gray-400 hover:text-gray-600 px-2 -mx-2 py-2 block w-full text-left rounded hover:bg-gray-50"
              >
                Add a description...
              </button>
            )}
          </div>
        )}
      </section>

      {/* Children section — Epics list "Child work items" (anything with
          this issue's id as their epicId); regular Tasks/Stories/Bugs list
          their Subtasks; Subtasks themselves render nothing here. */}
      {issue.type === "EPIC" ? (
        <ChildWorkItems epicId={issue.id} projectId={projectId} />
      ) : issue.type !== "SUBTASK" ? (
        <SubtaskGrid
          parentIssueId={issue.id}
          projectId={projectId}
          subtasks={issue.subtasks ?? []}
        />
      ) : null}
    </>
  );
}

export { TYPE_ICON_FOR_HEADER };
