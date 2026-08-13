"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { CaseEditorPanel } from "./case-editor-panel";
import { CaseTable } from "./case-table";
import { NamePromptPanel, type NamePromptConfig } from "./name-prompt-panel";
import { SuiteTree, type SuiteOption } from "./suite-tree";
import type { TestCaseRow } from "./case-meta";

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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);

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

  const openCreate = () => {
    setEditingCaseId(null);
    setEditorOpen(true);
  };

  // Creating needs a destination folder. Fall back to the first section of the
  // active suite so the button works straight after suite creation.
  const targetSectionId =
    activeSectionId ?? activeSuite?.sections[0]?.id ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Test cases</h1>
          <p className="text-xs text-gray-500">
            Reusable cases organised in suites and folders. Execute them from a
            test run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/spaces/${projectId}/test/runs`}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Test runs
          </Link>
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
            <div className="p-8 text-sm text-gray-500">
              Create a suite to start adding test cases.
            </div>
          ) : (
            <CaseTable
              rows={cases?.items ?? []}
              total={cases?.total ?? 0}
              loading={casesLoading}
              sectionName={activeSectionName}
              canCreate={canCreate}
              onCreate={openCreate}
              onOpen={(id) => {
                setEditingCaseId(id);
                setEditorOpen(true);
              }}
            />
          )}
        </div>
      </div>

      <CaseEditorPanel
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        caseId={editingCaseId}
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
