"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderPlus, Plus } from "lucide-react";
import { Button } from "@quikit/ui";
import type { SectionNode } from "./case-meta";

/**
 * Left pane of the repository: the suite's nestable folder tree.
 *
 * Renders from a flat `SectionNode[]` (id + parentId) rather than a nested
 * structure, because that is what the API returns and what the reparent
 * endpoint operates on — building a nested copy here would mean keeping two
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

/** Groups sections by parent so each level renders in one pass. */
function childrenByParent(sections: SectionNode[]): Map<string | null, SectionNode[]> {
  const map = new Map<string | null, SectionNode[]>();
  for (const s of sections) {
    const key = s.parentId ?? null;
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name));
  }
  return map;
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
  const activeSuite = suites.find((s) => s.id === activeSuiteId) ?? null;
  const byParent = useMemo(
    () => childrenByParent(activeSuite?.sections ?? []),
    [activeSuite],
  );

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

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const nodes = byParent.get(parentId) ?? [];
    if (nodes.length === 0) return null;

    return nodes.map((node) => {
      const kids = byParent.get(node.id) ?? [];
      const isCollapsed = collapsed.has(node.id);
      const isActive = node.id === activeSectionId;

      return (
        <div key={node.id}>
          <div
            className={`group flex items-center gap-1 rounded pr-1 ${
              isActive ? "bg-blue-50" : "hover:bg-gray-100"
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
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
              onClick={() => onSelectSection(node.id)}
              className={`flex-1 truncate py-1.5 text-left text-sm ${
                isActive ? "font-medium text-blue-700" : "text-gray-700"
              }`}
            >
              {node.name}
            </button>

            {typeof node.caseCount === "number" && node.caseCount > 0 && (
              <span className="shrink-0 text-[11px] text-gray-400">{node.caseCount}</span>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => onAddSection(node.id)}
                className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:text-gray-700 group-hover:opacity-100"
                aria-label={`Add a folder inside ${node.name}`}
                title="Add nested folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!isCollapsed && renderLevel(node.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Suites
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onAddSuite}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="New suite"
            title="New suite"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {suites.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">
          <p>No suites yet.</p>
          {canEdit && (
            <Button
              size="sm"
              className="mt-3 bg-accent-600 text-white hover:bg-accent-700"
              onClick={onAddSuite}
            >
              Create a suite
            </Button>
          )}
        </div>
      ) : (
        <>
          {suites.length > 1 && (
            <div className="border-b border-gray-200 px-2 py-2">
              {suites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSuite(s.id)}
                  className={`w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                    s.id === activeSuiteId
                      ? "bg-accent-100 font-medium text-accent-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => onSelectSection(null)}
              className={`mb-1 w-full rounded px-2 py-1.5 text-left text-sm ${
                activeSectionId === null
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              All cases in suite
            </button>

            {renderLevel(null, 0)}

            {canEdit && (
              <button
                type="button"
                onClick={() => onAddSection(null)}
                className="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Add folder
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
