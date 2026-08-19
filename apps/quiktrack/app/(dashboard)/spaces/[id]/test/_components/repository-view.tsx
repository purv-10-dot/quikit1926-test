"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Upload } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { CaseDetailPanel } from "./case-detail-panel";
import { CaseEditorPanel } from "./case-editor-panel";
import { CaseTable } from "./case-table";
import { loadColumns } from "./columns-menu";
import { ImportCasesPanel } from "./import-cases-panel";
import { BulkNotice } from "./bulk-notice";
import { RepositoryHeader } from "./repository-header";
import { useCaseSelection } from "./use-case-selection";
import { useInlineEdit } from "./use-inline-edit";
import { useSuitePrompt } from "./use-suite-prompt";
import { NamePromptPanel, type NamePromptConfig } from "./name-prompt-panel";
import { SuiteTree, type SuiteOption } from "./suite-tree";
import { useCasePanels } from "./use-case-panels";
import {
  DEFAULT_CASE_COLUMNS,
  type CaseColumnKey,
  type TestCaseRow,
} from "./case-meta";

/**
 * The test case repository — suite tree on the left, case list on the right,
 * editor in a right panel. This is the per-project "Tests" tab.
 *
 * Reads go through `useApiData` (shared React Query cache, so the tree and the
 * table don't double-fetch); writes are plain fetch + invalidate, per the repo's
 * convention.
 */

interface SuiteResponse {
  id: string;
  name: string;
  sections: Array<{
    id: string;
    name: string;
    parentId: string | null;
    orderNo: number;
    caseCount?: number;
  }>;
}

interface CaseListResponse {
  items: TestCaseRow[];
  total: number;
}

export function RepositoryView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const perms = useMyProjectPermissions(projectId);
  const canCreate = perms.loading || perms.has("TestCase", "create");
  const canEditSuite = perms.loading || perms.has("TestSuite", "create");
  // NOT `perms.loading ||` — unlike a read affordance, a destructive control must
  // not appear optimistically while permissions are still loading.
  const canDelete = !perms.loading && perms.has("TestCase", "delete");
  // Inline editing writes, so like delete it must not appear optimistically while
  // permissions are still loading.
  const canEdit = !perms.loading && perms.has("TestCase", "update");

  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  // Read → Edit → back handoff lives in the hook; see use-case-panels.ts.
  const panels = useCasePanels();
  const [importOpen, setImportOpen] = useState(false);

  // Visible columns (QUIKTR-335). Starts at the defaults and reads the stored
  // preference AFTER mount — localStorage is unavailable during SSR, so seeding
  // state from it directly would hydrate with different markup than the server
  // rendered.
  const [columns, setColumns] = useState<CaseColumnKey[]>(DEFAULT_CASE_COLUMNS);
  useEffect(() => {
    setColumns(loadColumns(projectId));
  }, [projectId]);

  const suitesKey = ["quiktrack", "test-suites", projectId] as const;
  const { data: suites, isLoading: suitesLoading } = useApiData<SuiteResponse[]>(
    suitesKey,
    `/api/test/suites?projectId=${projectId}`,
  );

  // Default to the first suite once loaded. Kept in an effect (not derived) so
  // the user's later selection isn't overwritten on every refetch.
  useEffect(() => {
    if (activeSuiteId === null && suites && suites.length > 0) {
      setActiveSuiteId(suites[0].id);
    }
  }, [suites, activeSuiteId]);

  /** "Deleted" view — how restore is reached. */
  const [showDeleted, setShowDeleted] = useState(false);

  const caseQuery = useMemo(() => {
    const scope = activeSectionId
      ? `sectionId=${activeSectionId}`
      : activeSuiteId
        ? `suiteId=${activeSuiteId}`
        : null;
    if (!scope) return null;
    return `${scope}&deleted=${showDeleted ? "true" : "false"}`;
  }, [activeSectionId, activeSuiteId, showDeleted]);

  // showDeleted is part of the cache key: the two lists are different data, and
  // sharing one key would show live cases in the deleted view until a refetch.
  const casesKey = [
    "quiktrack",
    "test-cases",
    projectId,
    activeSectionId ?? activeSuiteId ?? "none",
    showDeleted ? "deleted" : "live",
  ] as const;
  const { data: cases, isLoading: casesLoading } = useApiData<CaseListResponse>(
    casesKey,
    caseQuery ? `/api/test/cases?projectId=${projectId}&${caseQuery}` : null,
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["quiktrack", "test-cases"] });
    // The tree shows per-folder counts, so it is stale after any case write.
    void queryClient.invalidateQueries({ queryKey: suitesKey });
  };

  const inline = useInlineEdit({ onSaved: refresh });

  const caseRows = cases?.items ?? [];
  const selection = useCaseSelection({
    projectId,
    visibleIds: caseRows.map((c) => c.id),
    onDone: refresh,
  });

  // Suite/folder creation lives in the hook; see use-suite-prompt.ts.
  const prompt = useSuitePrompt({
    projectId,
    activeSuiteId,
    onSuiteCreated: (id) => {
      setActiveSuiteId(id);
      setActiveSectionId(null);
    },
    onChanged: () => {
      void queryClient.invalidateQueries({ queryKey: suitesKey });
    },
  });

  const treeSuites: SuiteOption[] = (suites ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sections: s.sections,
  }));

  const activeSuite = treeSuites.find((s) => s.id === activeSuiteId) ?? null;
  const activeSectionName =
    activeSuite?.sections.find((s) => s.id === activeSectionId)?.name ?? null;

  const openCreate = panels.openCreate;

  // Creating needs a destination folder. Fall back to the first section of the
  // active suite so the button works straight after suite creation.
  const targetSectionId =
    activeSectionId ?? activeSuite?.sections[0]?.id ?? null;

  return (
    <div className="flex h-full flex-col">
      <RepositoryHeader
        projectId={projectId}
        canCreate={canCreate}
        hasSuites={treeSuites.length > 0}
        onCreate={openCreate}
        onImport={() => setImportOpen(true)}
        // Only offered to users who can delete — nobody else has anything to
        // restore, so the tab would be an empty dead end.
        showDeleted={canDelete ? showDeleted : undefined}
        onShowDeleted={(v) => {
          setShowDeleted(v);
          selection.clear();
        }}
      />

      <BulkNotice
        notice={selection.notice}
        // A failed inline edit reuses this banner rather than inventing a second
        // error surface. Selection errors take precedence — they follow an explicit
        // bulk action, so they are the more urgent of the two.
        error={selection.error ?? inline.error}
        showingDeleted={showDeleted}
        onViewDeleted={() => {
          setShowDeleted(true);
          selection.dismissNotice();
        }}
        onDismiss={() => {
          selection.dismissNotice();
          inline.dismissError();
        }}
      />

      <div className="flex min-h-0 flex-1">
        {suitesLoading ? (
          <div className="w-64 shrink-0 border-r border-gray-200 p-4 text-sm text-gray-400">
            Loading…
          </div>
        ) : (
          <SuiteTree
            suites={treeSuites}
            activeSuiteId={activeSuiteId}
            activeSectionId={activeSectionId}
            onSelectSuite={(id) => {
              setActiveSuiteId(id);
              setActiveSectionId(null);
            }}
            onSelectSection={setActiveSectionId}
            onAddSuite={() => prompt.setMode({ kind: "suite" })}
            onAddSection={(parentId) =>
              prompt.setMode({ kind: "section", parentId })
            }
            canEdit={canEditSuite}
          />
        )}

        <div className="min-w-0 flex-1">
          {treeSuites.length === 0 && !suitesLoading ? (
            // First-run state. Explains the two concepts in order rather than
            // leaving one sentence floating in an empty pane.
            <div className="flex h-full items-start justify-center px-6 py-12">
              <div className="max-w-md text-center">
                <Layers className="mx-auto h-8 w-8 text-gray-300" />
                <h3 className="mt-3 text-sm font-semibold text-gray-800">
                  Start with a suite
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  A <strong className="font-medium text-gray-700">suite</strong> is
                  a collection of test cases, like Regression or Smoke. Inside it you
                  can add <strong className="font-medium text-gray-700">folders</strong>{" "}
                  to group cases by area, then execute them together as a{" "}
                  <strong className="font-medium text-gray-700">test run</strong>.
                </p>
                {canEditSuite && (
                  <button
                    type="button"
                    onClick={() => prompt.setMode({ kind: "suite" })}
                    className="mt-4 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700"
                  >
                    Create your first suite
                  </button>
                )}
              </div>
            </div>
          ) : (
            <CaseTable
              rows={caseRows}
              total={cases?.total ?? 0}
              loading={casesLoading}
              sectionName={activeSectionName}
              projectId={projectId}
              columns={columns}
              onColumns={setColumns}
              canCreate={canCreate}
              onCreate={openCreate}
              // Inline edit needs Issue-style update rights, and is pointless in the
              // deleted view (you restore a case before editing it).
              onInlineEdit={canEdit && !showDeleted ? inline.save : undefined}
              // Checkboxes only for users who can actually delete — a read-only
              // viewer gets no dead controls.
              selection={selection.tableProps({
                enabled: canDelete,
                mode: showDeleted ? "deleted" : "live",
              })}
              // QUIKTR-336 — a row click now READS the case. Editing is an
              // explicit action from the detail panel: opening the editor to look
              // at a case invited a pointless version bump, since every save mints
              // a new version.
              onOpen={panels.openDetail}
            />
          )}
        </div>
      </div>

      <ImportCasesPanel
        open={importOpen}
        onClose={() => setImportOpen(false)}
        projectId={projectId}
        suiteId={activeSuiteId}
        suiteName={activeSuite?.name ?? null}
        // The folder the user is looking at. Null means "All cases in this suite", in
        // which case the server falls back to the suite's first folder.
        sectionId={activeSectionId}
        sectionName={activeSectionName}
        onImported={refresh}
      />

      <CaseDetailPanel
        open={panels.detailOpen}
        caseId={panels.caseId}
        canEdit={canCreate}
        onClose={panels.closeDetail}
        onEdit={panels.editFromDetail}
      />

      <CaseEditorPanel
        open={panels.editorOpen}
        onClose={panels.closeEditor}
        caseId={panels.caseId}
        sectionId={targetSectionId}
        projectId={projectId}
        onSaved={refresh}
      />

      <NamePromptPanel
        open={prompt.mode !== null}
        config={prompt.config}
        onClose={prompt.close}
        onSubmit={prompt.submit}
      />
    </div>
  );
}
