"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { SuiteTree, type SuiteOption } from "../../_components/suite-tree";
import { SelectCasesList } from "./select-cases-list";
import { SelectCasesSidebar } from "./select-cases-sidebar";

/**
 * "Select Cases" modal (QUIKTR-341) — the reference UI's three-column picker:
 * suite/folder tree (left, reusing the case repository's own `SuiteTree`),
 * the active folder's cases with search (middle), a filter sidebar (right).
 *
 * Replaces the old inline `IncludeCasesField`/`AddCasesField`/`CasePicker`
 * trio in BOTH the New Run and Edit Run panels — those showed a compact
 * summary line ("12 selected") plus a "Select cases…" button that opens this.
 *
 * Used in two modes, distinguished only by `lockedIds`:
 *  - CREATE: `lockedIds` is empty — nothing is locked, every tick is a plain
 *    "include this case" choice, exactly like the old picker.
 *  - EDIT: `lockedIds` holds cases with recorded results — those rows are
 *    ticked and their checkbox disabled. Untested cases already in the run
 *    are ticked but NOT locked (unticking removes them); cases never in the
 *    run start unticked (ticking adds them). The CALLER (EditRunPanel) is
 *    responsible for diffing the modal's returned selection against what was
 *    already in the run to know which ids are additions vs. removals — this
 *    modal only tracks one flat selection set.
 */

export function SelectCasesModal({
  open,
  onClose,
  onConfirm,
  projectId,
  initialSelected,
  lockedIds,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the FULL final selection (locked ids included) on OK. */
  onConfirm: (selected: Set<string>) => void;
  projectId: string;
  initialSelected: Set<string>;
  lockedIds: Set<string>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: suites } = useApiData<SuiteOption[]>(
    ["quiktrack", "test-suites", projectId],
    open ? `/api/test/suites?projectId=${projectId}` : null,
  );

  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Partial<Record<string, string>>>({});

  // Reset to the incoming selection every time the modal opens, so a
  // cancelled session never leaks a half-finished pick into the next open.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialSelected));
    setFilters({});
    setActiveSectionId(null);
  }, [open, initialSelected]);

  // Preselect the first suite so opening the modal doesn't show an empty
  // "choose a folder" middle column when there's only one suite anyway.
  useEffect(() => {
    if (open && suites && suites.length > 0 && !activeSuiteId) {
      setActiveSuiteId(suites[0].id);
    }
  }, [open, suites, activeSuiteId]);

  const setFilter = (key: string, value: string | undefined) =>
    setFilters((f) => {
      const next = { ...f };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  const toggle = (caseId: string, on: boolean) => {
    if (lockedIds.has(caseId)) return; // belt-and-braces; the row is disabled too
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(caseId);
      else next.delete(caseId);
      return next;
    });
  };

  if (!mounted || !open) return null;

  const activeSuite = (suites ?? []).find((s) => s.id === activeSuiteId);
  // The tree wants a suite selected before it can highlight a section; picking
  // any section auto-selects its suite too, mirroring SuiteTree's own click
  // behaviour elsewhere in the app.
  const suiteTreeOptions: SuiteOption[] = suites ?? [];

  const countText = `${selected.size} selected`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* NOTE: no `overflow-hidden` on this outer box. `FilterPicker` (from
          @quikit/ui, not modifiable per this app's rules) opens its dropdown
          with plain CSS `position: absolute`, not a portal — it does not flip
          upward when short on room below, so ANY clipping ancestor between it
          and the viewport cuts it off once its trigger is near the bottom of
          the modal (the Assignee field's dropdown in the screenshot). Corner
          rounding is done on the header/body/footer sections individually
          below instead of on this shared wrapper, so the modal still LOOKS
          like one rounded card without clipping anything that needs to
          escape its bounds. */}
      <div className="flex h-[85vh] w-full max-w-5xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Select cases</h2>
            <p className="text-xs text-gray-500">{countText}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 bg-white">
          <SuiteTree
            suites={suiteTreeOptions}
            activeSuiteId={activeSuiteId}
            activeSectionId={activeSectionId}
            onSelectSuite={(id) => {
              setActiveSuiteId(id);
              setActiveSectionId(null);
            }}
            onSelectSection={setActiveSectionId}
            onAddSuite={() => undefined}
            onAddSection={() => undefined}
            // A picker never edits the suite structure — no add-folder/add-suite
            // affordances, same tree component, read-only mode.
            canEdit={false}
          />

          <SelectCasesList
            projectId={projectId}
            sectionId={
              activeSectionId ?? activeSuite?.sections[0]?.id ?? null
            }
            filters={filters}
            selected={selected}
            onToggle={toggle}
            lockedIds={lockedIds}
          />

          <SelectCasesSidebar
            projectId={projectId}
            filters={filters}
            onSetFilter={setFilter}
          />
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-white px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onConfirm(selected);
              onClose();
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
