"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Bug,
  Check,
  CheckSquare,
  ChevronDown,
  Edit3,
  ListTree,
  Zap,
} from "lucide-react";
import type { MentionItem } from "@/components/editor/mention";
import { SubtaskGrid } from "./subtask-grid";
import { AddEpicButton } from "./add-epic-button";
import { ChildWorkItems } from "./child-work-items";
import { IssueDescriptionSection } from "./issue-description-section";
import { WatchButton } from "./watch-button";
import type { IssuePageData, IssueType } from "./types";

// Matches the edit modal's TYPE_META icons so the breadcrumb + change-type menu
// show distinct, consistent glyphs (checkbox / book / bug) — not one generic icon.
const TYPE_ICON_FOR_HEADER: Record<IssueType, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500" },
};

// The flat work types the breadcrumb switcher offers — mirrors the edit modal.
// EPIC and SUBTASK are excluded: converting to/from them from a quick menu would
// orphan children or break the parent/child tree.
const WORK_TYPE_OPTIONS: IssueType[] = ["TASK", "STORY", "BUG"];
const WORK_TYPE_LABEL: Record<IssueType, string> = {
  TASK: "Task",
  STORY: "Story",
  BUG: "Bug",
  EPIC: "Epic",
  SUBTASK: "Subtask",
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
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  // Close the work-type menu on outside click.
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [typeMenuOpen]);
  const canSwitchType = WORK_TYPE_OPTIONS.includes(issue.type);

  return (
    <>
      {/* Breadcrumb — sticky at the top of the scrolling viewport, scoped
          to the left column so it doesn't bleed under the right rail's
          status pill. */}
      <div className="sticky top-0 z-10 py-3 bg-white border-b border-gray-100 flex items-center justify-between gap-1.5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5 min-w-0">
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
          {canSwitchType ? (
            <div className="relative inline-flex items-center gap-1" ref={typeMenuRef}>
              <button
                type="button"
                onClick={() => setTypeMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 h-6 px-1 -mx-0.5 rounded hover:bg-gray-100"
                title="Change work type"
                aria-label="Change work type"
              >
                <T.Icon className={`h-3.5 w-3.5 ${T.color}`} />
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
              <Link
                href={`/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-gray-800 hover:underline"
                title="Open in new tab"
              >
                {issue.key}
              </Link>
              {typeMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500">
                    Change work type
                  </div>
                  {WORK_TYPE_OPTIONS.map((t) => {
                    const meta = TYPE_ICON_FOR_HEADER[t];
                    const active = t === issue.type;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTypeMenuOpen(false);
                          if (t !== issue.type) void onPatch({ type: t });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                          active ? "text-blue-700 font-medium" : "text-gray-700"
                        }`}
                      >
                        <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                        {WORK_TYPE_LABEL[t]}
                        {active && <Check className="h-3.5 w-3.5 ml-auto text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <Link
              href={`/browse/${issue.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-800 hover:underline inline-flex items-center gap-1 text-gray-700"
              title="Open in new tab"
            >
              <T.Icon className={`h-3.5 w-3.5 ${T.color}`} />
              {issue.key}
            </Link>
          )}
        </div>
        <WatchButton issueId={issue.id} />
      </div>

      {/* Title */}
      <div className="mt-5 mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{issue.title}</h1>
      </div>

      {/* Description (collapsible) */}
      <IssueDescriptionSection
        issue={issue}
        projectId={projectId}
        onPatch={onPatch}
        mentions={mentions}
      />

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
