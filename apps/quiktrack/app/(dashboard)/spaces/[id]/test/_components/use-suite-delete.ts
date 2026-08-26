"use client";

import { confirmDialog } from "@/lib/ui/confirm";

/**
 * Delete a suite or folder from the tree — confirm, DELETE, refresh.
 *
 * Both endpoints soft-archive the WHOLE subtree server-side (see
 * `app/api/test/{suites,sections}/[id]/route.ts`), so a folder or suite with
 * nested children is removed in one action rather than leaving orphans behind.
 * Extracted from `repository-view.tsx`, which was already at the 300-line
 * ceiling in apps/quiktrack/CLAUDE.md before this landed.
 */
export function useSuiteDelete({
  onDeletedSuite,
  onDeletedSection,
  onChanged,
}: {
  /** Suite that was just deleted was the active one — clear the selection. */
  onDeletedSuite: (suiteId: string) => void;
  /** Section that was just deleted was the active one — clear the selection. */
  onDeletedSection: (sectionId: string) => void;
  /** Refetch the tree — folder counts and the suite list are both stale. */
  onChanged: () => void;
}) {
  const deleteSuite = async (suiteId: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      message:
        "This removes the suite and every folder in it. Cases already " +
        "referenced by a test run keep their history — only the suite and " +
        "folders are archived.",
      confirmText: "Delete suite",
      danger: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/test/suites/${suiteId}`, { method: "DELETE" });
    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      onDeletedSuite(suiteId);
      onChanged();
    }
  };

  const deleteSection = async (sectionId: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      message:
        "This removes the folder and every nested folder inside it. Cases " +
        "already referenced by a test run keep their history — only the " +
        "folders are archived.",
      confirmText: "Delete folder",
      danger: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/test/sections/${sectionId}`, { method: "DELETE" });
    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      onDeletedSection(sectionId);
      onChanged();
    }
  };

  return { deleteSuite, deleteSection };
}
