"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SectionNode, TestCaseRow } from "../../_components/case-meta";
import { caseRef } from "../../_components/case-meta";
import {
  applyTick,
  descendantCaseIds,
  groupCases,
  groupSections,
  tickState,
} from "@/lib/test/caseSelection";
import { TriCheckbox } from "./tri-checkbox";

/**
 * "Include Test Cases" tree picker (QUIKTR-337).
 *
 * Mirrors the reference UI: the suite's folder tree with a checkbox on every
 * folder and case. Ticking a folder ticks the cases beneath it (including nested
 * folders); a folder whose children are partly ticked shows indeterminate.
 *
 * Selection is stored as CASE ids only — folders are a selection *gesture*, not
 * part of the payload. The API takes `suiteId` (whole suite) OR `caseIds`
 * (explicit list) and rejects both together, so the parent panel decides which
 * to send based on `mode`.
 */

interface CasePickerProps {
  sections: SectionNode[];
  cases: TestCaseRow[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

export function CasePicker({
  sections,
  cases,
  selected,
  onChange,
  disabled,
}: CasePickerProps) {
  // Grouping + descendant maths live in lib/test/caseSelection.ts so they can be
  // tested without a DOM.
  const byParent = useMemo(() => {
    const map = groupSections(sections);
    for (const list of map.values()) {
      list.sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name));
    }
    return map;
  }, [sections]);

  const casesBySection = useMemo(() => {
    const map = groupCases(cases);
    for (const list of map.values()) list.sort((a, b) => a.refId - b.refId);
    return map;
  }, [cases]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], on: boolean) =>
    onChange(applyTick(selected, ids, on));

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes.map((node) => {
      const own = casesBySection.get(node.id) ?? [];
      const all = descendantCaseIds(node.id, byParent, casesBySection);
      const picked = all.filter((id) => selected.has(id)).length;
      const state = tickState(all, selected);
      const isCollapsed = collapsed.has(node.id);
      const kids = byParent.get(node.id) ?? [];
      const hasContent = all.length > 0 || kids.length > 0;

      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-1 rounded py-1 hover:bg-gray-50"
            style={{ paddingLeft: `${depth * 14 + 2}px` }}
          >
            {hasContent ? (
              <button
                type="button"
                onClick={() => toggle(node.id)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
                aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
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

            <TriCheckbox
              checked={state === "all"}
              indeterminate={state === "some"}
              disabled={disabled || all.length === 0}
              onChange={(on) => setMany(all, on)}
              label={
                <span className="text-sm text-gray-800">
                  {node.name}
                  <span className="ml-1.5 text-[11px] text-gray-400">
                    {/* Always shown, including 0 — an empty folder that looks
                        identical to a full one is how a run ends up empty. */}
                    {picked}/{all.length}
                  </span>
                </span>
              }
            />
          </div>

          {!isCollapsed && (
            <>
              {own.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-1 rounded py-1 hover:bg-gray-50"
                  style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
                >
                  <TriCheckbox
                    checked={selected.has(c.id)}
                    disabled={disabled}
                    onChange={(on) => setMany([c.id], on)}
                    label={
                      <span className="text-sm text-gray-700">
                        <span className="mr-1.5 font-mono text-[11px] text-gray-400">
                          {caseRef(c.refId)}
                        </span>
                        {c.title}
                        {c.approvalState === "DRAFT" && (
                          <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
                            Draft
                          </span>
                        )}
                      </span>
                    }
                  />
                </div>
              ))}
              {renderLevel(node.id, depth + 1)}
            </>
          )}
        </div>
      );
    });
  };

  const allIds = useMemo(() => cases.map((c) => c.id), [cases]);

  if (cases.length === 0) {
    return (
      <p className="rounded border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
        This suite has no test cases yet.
      </p>
    );
  }

  return (
    <div className="rounded border border-gray-200">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-500">
          {selected.size} of {cases.length} selected
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMany(allIds, true)}
            className="text-xs text-accent-700 hover:underline disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMany(allIds, false)}
            className="text-xs text-gray-500 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 py-2">{renderLevel(null, 0)}</div>
    </div>
  );
}
