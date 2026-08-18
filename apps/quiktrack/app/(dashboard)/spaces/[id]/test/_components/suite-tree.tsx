"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Layers,
  Plus,
} from "lucide-react";
import { groupSections } from "@/lib/test/caseSelection";
import { orphanFolderCount, suiteCaseCount } from "@/lib/test/suiteTree";
import type { SectionNode } from "./case-meta";

/**
 * Left pane: ONE tree of suites, each containing its folders.
 *
 * Previously this rendered two stacked lists — suites in one box, the selected
 * suite's folders in another, plus a separate "All cases in suite" row. Nothing
 * said which was which, and "All cases in suite" sat next to a folder literally
 * named "All test cases", so two rows that mean different things looked like
 * siblings. One indented tree removes the ambiguity: indentation IS the
 * containment, so no label has to explain it.
 *
 * Renders from a flat `SectionNode[]` (id + parentId) rather than a nested
 * structure, because that is what the API returns and what the reparent endpoint
 * operates on — building a nested copy here would mean keeping two
 * representations in sync.
 */

export interface SuiteOption {
  id: string;
  name: string;
  sections: SectionNode[];
}

interface SuiteTreeProps {
  suites: SuiteOption[];
  activeSuiteId: string | null;
  activeSectionId: string | null;
  onSelectSuite: (suiteId: string) => void;
  onSelectSection: (sectionId: string | null) => void;
  onAddSuite: () => void;
  onAddSection: (parentId: string | null) => void;
  canEdit: boolean;
}


export function SuiteTree({
  suites,
  activeSuiteId,
  activeSectionId,
  onSelectSuite,
  onSelectSection,
  onAddSuite,
  onAddSection,
  canEdit,
}: SuiteTreeProps) {
  // Collapsed rather than expanded state, so a freshly loaded tree is open by
  // default (a QA lead wants to see the whole suite, not click into it).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const byParentPerSuite = useMemo(() => {
    const map = new Map<string, Map<string | null, SectionNode[]>>();
    for (const suite of suites) {
      const grouped = groupSections(suite.sections);
      for (const list of grouped.values()) {
        list.sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name));
      }
      map.set(suite.id, grouped);
    }
    return map;
  }, [suites]);

  const renderFolders = (
    suiteId: string,
    parentId: string | null,
    depth: number,
  ): React.ReactNode => {
    const nodes = byParentPerSuite.get(suiteId)?.get(parentId) ?? [];

    return nodes.map((node) => {
      const kids = byParentPerSuite.get(suiteId)?.get(node.id) ?? [];
      const isCollapsed = collapsed.has(node.id);
      const isActive = node.id === activeSectionId && suiteId === activeSuiteId;

      return (
        <div key={node.id}>
          <div
            className={`group flex items-center rounded-md pr-1 ${
              isActive ? "bg-accent-50" : "hover:bg-gray-50"
            }`}
            style={{ paddingLeft: `${depth * 12 + 22}px` }}
          >
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(node.id)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
                aria-label={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}

            <button
              type="button"
              onClick={() => {
                if (suiteId !== activeSuiteId) onSelectSuite(suiteId);
                onSelectSection(node.id);
              }}
              className={`flex-1 truncate py-1.5 text-left text-[13px] ${
                isActive ? "font-medium text-accent-800" : "text-gray-700"
              }`}
            >
              {node.name}
            </button>

            {/* QUIKTR-332 — always rendered, INCLUDING 0. An empty folder that
                looks identical to one whose count hasn't loaded is exactly what a
                QA lead needs to spot before building a run from it. */}
            {typeof node.caseCount === "number" && (
              <span
                className={`shrink-0 rounded px-1.5 text-[11px] tabular-nums ${
                  node.caseCount === 0 ? "text-gray-300" : "text-gray-500"
                }`}
              >
                {node.caseCount}
              </span>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  if (suiteId !== activeSuiteId) onSelectSuite(suiteId);
                  onAddSection(node.id);
                }}
                className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100"
                aria-label={`Add a folder inside ${node.name}`}
                title="Add folder inside"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!isCollapsed && renderFolders(suiteId, node.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Suites &amp; folders
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onAddSuite}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-200 hover:text-gray-800"
            title="New suite"
          >
            <Plus className="h-3.5 w-3.5" />
            Suite
          </button>
        )}
      </div>

      {suites.length === 0 ? (
        <div className="px-3 py-2">
          <p className="text-[13px] text-gray-500">No suites yet.</p>
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            A suite is a collection of test cases — for example Regression or
            Smoke.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={onAddSuite}
              className="mt-2 rounded-md bg-accent-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-accent-700"
            >
              Create a suite
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {suites.map((suite) => {
            const isActiveSuite = suite.id === activeSuiteId;
            const isCollapsed = collapsed.has(suite.id);
            const total = suiteCaseCount(suite);
            const orphans = orphanFolderCount(suite);
            // The suite row itself selects "everything in this suite" — the job
            // the old separate "All cases in suite" row did, without a second row
            // that looked like a folder.
            const showingAll = isActiveSuite && activeSectionId === null;

            return (
              <div key={suite.id} className="mt-0.5">
                <div
                  className={`group flex items-center rounded-md pr-1 ${
                    showingAll ? "bg-accent-100" : "hover:bg-gray-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(suite.id)}
                    className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
                    aria-label={isCollapsed ? "Expand suite" : "Collapse suite"}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectSuite(suite.id);
                      onSelectSection(null);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                    title={`${suite.name} — show every case in this suite`}
                  >
                    <Layers
                      className={`h-3.5 w-3.5 shrink-0 ${
                        showingAll ? "text-accent-700" : "text-gray-400"
                      }`}
                    />
                    <span
                      className={`truncate text-[13px] ${
                        showingAll
                          ? "font-semibold text-accent-800"
                          : "font-medium text-gray-800"
                      }`}
                    >
                      {suite.name}
                    </span>
                  </button>

                  <span className="shrink-0 rounded px-1.5 text-[11px] tabular-nums text-gray-500">
                    {total}
                  </span>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSuite(suite.id);
                        onAddSection(null);
                      }}
                      className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Add a folder in ${suite.name}`}
                      title="Add folder"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <>
                    {renderFolders(suite.id, null, 0)}
                    {suite.sections.length === 0 && (
                      <p className="py-1 pl-[40px] text-[11px] text-gray-400">
                        No folders yet
                      </p>
                    )}
                    {/* A folder whose parentId points at a missing row cannot be
                        rendered anywhere in the tree, yet it still counts toward the
                        suite total above — so the badge would silently disagree with
                        the visible folders. Say so instead of hiding it. Does not
                        occur in normal use; reachable only via corrupt data. */}
                    {orphans > 0 && (
                      <p className="py-1 pl-[40px] text-[11px] text-amber-700">
                        {orphans} folder{orphans === 1 ? "" : "s"} not shown — parent
                        folder is missing.
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
