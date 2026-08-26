"use client";

import { useState } from "react";
import type { NamePromptConfig } from "./name-prompt-panel";

/**
 * Suite and folder creation — the shared name prompt and its submit.
 *
 * One panel serves both, so `mode` says which is being created (and, for a nested
 * folder, under which parent). Extracted from `repository-view.tsx`, which passed the
 * 300-line ceiling in apps/quiktrack/CLAUDE.md once bulk selection landed.
 */
export type PromptMode =
  | { kind: "suite" }
  | { kind: "section"; parentId: string | null }
  | null;

export function useSuitePrompt({
  projectId,
  activeSuiteId,
  onSuiteCreated,
  onChanged,
}: {
  projectId: string;
  activeSuiteId: string | null;
  /** Select the new suite so the user lands inside what they just made. */
  onSuiteCreated: (suiteId: string) => void;
  /** Refetch the tree — folder counts and the suite list are both stale. */
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<PromptMode>(null);

  /** Returns an error message, or null on success (the panel's contract). */
  const submit = async (values: {
    name: string;
    description?: string;
  }): Promise<string | null> => {
    if (!mode) return "Nothing to create.";

    if (mode.kind === "suite") {
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
      onSuiteCreated(json.data.id);
      onChanged();
      return null;
    }

    if (!activeSuiteId) return "Select a suite first.";
    const res = await fetch("/api/test/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suiteId: activeSuiteId,
        // `parentId: null` creates at the suite root. The validator uses
        // `.nullish()` precisely so an explicit null is accepted here.
        parentId: mode.parentId,
        name: values.name,
      }),
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    if (!json.success) return json.error ?? "Could not create the folder.";
    onChanged();
    return null;
  };

  const config: NamePromptConfig | null =
    mode === null
      ? null
      : mode.kind === "suite"
        ? {
            title: "New test suite",
            subtitle: "A container for this project's test cases",
            label: "Suite name",
            placeholder: "Regression",
            withDescription: true,
            submitLabel: "Create suite",
          }
        : {
            title: mode.parentId ? "New nested folder" : "New folder",
            subtitle: mode.parentId
              ? "Created inside the selected folder"
              : "Created at the root of this suite",
            label: "Folder name",
            placeholder: "Login",
            submitLabel: "Create folder",
          };

  return {
    mode,
    setMode,
    config,
    submit,
    close: () => setMode(null),
  };
}
