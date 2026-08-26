"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { SectionNode } from "./case-meta";

/**
 * One folder row, recursing into its children — the tree's indentation IS the
 * containment, so depth is just a padding multiplier. Extracted from
 * `suite-tree.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once folder delete landed.
 */
export function SuiteTreeFolderRow({
  suiteId,
  parentId,
  depth,
  byParent,
  collapsed,
  onToggle,
  activeSuiteId,
  activeSectionId,
  onSelectSuite,
  onSelectSection,
  onAddSection,
  canEdit,
  onDeleteSection,
}: {
  suiteId: string;
  parentId: string | null;
  depth: number;
  byParent: Map<string | null, SectionNode[]> | undefined;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  activeSuiteId: string | null;
  activeSectionId: string | null;
  onSelectSuite: (suiteId: string) => void;
  onSelectSection: (sectionId: string | null) => void;
  onAddSection: (parentId: string | null) => void;
  canEdit: boolean;
  onDeleteSection?: (sectionId: string, name: string) => void;
}) {
  const nodes = byParent?.get(parentId) ?? [];

  return (
    <>
      {nodes.map((node) => {
        const kids = byParent?.get(node.id) ?? [];
        const isCollapsed = collapsed.has(node.id);
        const isActive = node.id === activeSectionId && suiteId === activeSuiteId;

        return (
          <div key={node.id}>
            <div
              className={`group flex items-center rounded-md pr-1 ${
                isActive ? "bg-accent-50 dark:bg-gray-700" : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              style={{ paddingLeft: `${depth * 12 + 22}px` }}
            >
              {kids.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.id)}
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
                  isActive ? "font-medium text-accent-800 dark:text-accent-200" : "text-gray-700 dark:text-gray-300"
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
                  className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Add a folder inside ${node.name}`}
                  title="Add folder inside"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}

              {onDeleteSection && (
                <button
                  type="button"
                  onClick={() => onDeleteSection(node.id, node.name)}
                  className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-700 dark:hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete ${node.name}`}
                  title="Delete folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {!isCollapsed && (
              <SuiteTreeFolderRow
                suiteId={suiteId}
                parentId={node.id}
                depth={depth + 1}
                byParent={byParent}
                collapsed={collapsed}
                onToggle={onToggle}
                activeSuiteId={activeSuiteId}
                activeSectionId={activeSectionId}
                onSelectSuite={onSelectSuite}
                onSelectSection={onSelectSection}
                onAddSection={onAddSection}
                canEdit={canEdit}
                onDeleteSection={onDeleteSection}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
