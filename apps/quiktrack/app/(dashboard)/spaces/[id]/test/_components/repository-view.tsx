"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { CaseDetailPanel } from "./case-detail-panel";
import { CaseEditorPanel } from "./case-editor-panel";
import { CaseTable } from "./case-table";
import { loadColumns } from "./columns-menu";
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

  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  // Read → Edit → back handoff lives in the hook; see use-case-panels.ts.
  const panels = useCasePanels();

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

  const caseQuery = useMemo(() => {
    if (activeSectionId) return `sectionId=${activeSectionId}`;
    if (activeSuiteId) return `suiteId=${activeSuiteId}`;
    return null;
  }, [activeSectionId, activeSuiteId]);

  const casesKey = [
    "quiktrack",
    "test-cases",
    projectId,
    activeSectionId ?? activeSuiteId ?? "none",
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

  // One panel serves both suite and folder creation; `promptMode` says which
  // (and, for a nested folder, under which parent).
  const [promptMode, setPromptMode] = useState<
    { kind: "suite" } | { kind: "section"; parentId: string | null } | null
  >(null);

  const submitPrompt = async (values: {
    name: string;
    description?: string;
  }): Promise<string | null> => {
    if (!promptMode) return "Nothing to create.";

    if (promptMode.kind === "suite") {
      const res = await fetch("/api/test/suites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: values.name,
          description: values.description,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string };
      };
      if (!json.success || !json.data) {
        return json.error ?? "Could not create the suite.";
      }
      setActiveSuiteId(json.data.id);
      setActiveSectionId(null);
      void queryClient.invalidateQueries({ queryKey: suitesKey });
      return null;
    }

    if (!activeSuiteId) return "Select a suite first.";
    const res = await fetch("/api/test/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: activeSuiteId,
        parentId: promptMode.parentId,
        name: values.name,
      }),
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    if (!json.success) return json.error ?? "Could not create the folder.";
    void queryClient.invalidateQueries({ queryKey: suitesKey });
    return null;
  };

  const promptConfig: NamePromptConfig | null =
    promptMode === null
      ? null
      : promptMode.kind === "suite"
        ? {
            title: "New test suite",
            subtitle: "A container for this project's test cases",
            label: "Suite name",
            placeholder: "Regression",
            withDescription: true,
            submitLabel: "Create suite",
          }
        : {
            title: promptMode.parentId ? "New nested folder" : "New folder",
            subtitle: promptMode.parentId
              ? "Created inside the selected folder"
              : "Created at the root of this suite",
            label: "Folder name",
            placeholder: "Login",
            submitLabel: "Create folder",
          };

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
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
        {/* Two tabs, not a heading: "Test cases" and "Test runs" are the two halves
            of QuikTest, and the old header buried the runs link as a secondary
            button so it read as an action rather than a place. */}
        <nav className="flex items-center gap-1">
          <span className="rounded-md bg-accent-50 px-2.5 py-1.5 text-[13px] font-medium text-accent-800">
            Test cases
          </span>
          <Link
            href={`/spaces/${projectId}/test/runs`}
            className="rounded-md px-2.5 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Test runs
          </Link>
        </nav>

        {/* Only shown when there is somewhere to put a case. With no suite the
            empty state's own button is the single call to action, so the two no
            longer compete. */}
        {canCreate && treeSuites.length > 0 && (
          <Button
            size="sm"
            className="bg-accent-600 text-white hover:bg-accent-700"
            onClick={openCreate}
          >
            <Plus className="mr-1 h-4 w-4" />
            New test case
          </Button>
        )}
      </div>

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
            onAddSuite={() => setPromptMode({ kind: "suite" })}
            onAddSection={(parentId) => setPromptMode({ kind: "section", parentId })}
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
                    onClick={() => setPromptMode({ kind: "suite" })}
                    className="mt-4 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700"
                  >
                    Create your first suite
                  </button>
                )}
              </div>
            </div>
          ) : (
            <CaseTable
              rows={cases?.items ?? []}
              total={cases?.total ?? 0}
              loading={casesLoading}
              sectionName={activeSectionName}
              projectId={projectId}
              columns={columns}
              onColumns={setColumns}
              canCreate={canCreate}
              onCreate={openCreate}
              // QUIKTR-336 — a row click now READS the case. Editing is an
              // explicit action from the detail panel: opening the editor to look
              // at a case invited a pointless version bump, since every save mints
              // a new version.
              onOpen={panels.openDetail}
            />
          )}
        </div>
      </div>

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
        open={promptMode !== null}
        config={promptConfig}
        onClose={() => setPromptMode(null)}
        onSubmit={submitPrompt}
      />
    </div>
  );
}
