"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  EditorDraft,
  EditorRule,
  EditorTransition,
  PublishError,
  TransitionType,
} from "./editor-types";
import type { MigrationItem } from "../../_components/migration-dialog";

/** Small client-side unique id for new transitions (crypto.randomUUID). */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Editor state + persistence for one workflow. Holds the working draft, exposes
 * pure mutators, saves the draft to the scheme (PUT), and publishes (POST).
 */
export function useWorkflowEditor(wfId: string, initial: EditorDraft, hasPendingDraft = true) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EditorDraft>(initial);
  const [publishErrors, setPublishErrors] = useState<PublishError[]>([]);
  const [migration, setMigration] = useState<MigrationItem[] | null>(null);
  // True when there are NO unpublished changes → header shows a single "Close".
  // Seeded from the server: a workflow with no pending draft loads as published.
  // Set true on publish success, reset to false on the next edit.
  const [published, setPublished] = useState(!hasPendingDraft);

  const save = useMutation({
    mutationFn: async (next: EditorDraft) => {
      const r = await fetch(`/api/workflows/${wfId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Save failed");
    },
  });

  const publish = useMutation({
    mutationFn: async (statusMapping?: Record<string, string>) => {
      const r = await fetch(`/api/workflows/${wfId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statusMapping: statusMapping ?? {} }),
      });
      const j = await r.json();
      if (r.status === 422 && j.code === "NEEDS_MIGRATION") {
        setMigration(j.migration as MigrationItem[]);
        throw new Error("NEEDS_MIGRATION");
      }
      if (r.status === 422 && Array.isArray(j.errors)) {
        setPublishErrors(j.errors as PublishError[]);
        throw new Error(j.error ?? "The workflow is not valid.");
      }
      if (!r.ok || !j.success) throw new Error(j.error ?? "Publish failed");
      setPublishErrors([]);
      setMigration(null);
      setPublished(true);
      // Refresh the server read-model so a later remount sees the published
      // state (no pending draft) and keeps showing "Close".
      void qc.invalidateQueries({ queryKey: ["quiktrack", "workflow", wfId] });
      // Also refresh the Workflows OVERVIEW scheme query (prefix match, any
      // project) so its "unpublished changes" banner + DRAFT badge clear once
      // this workflow is published from the editor.
      void qc.invalidateQueries({ queryKey: ["quiktrack", "workflow-scheme"] });
      return j.data;
    },
  });

  // Apply a mutation to the draft AND persist it (debounced-ish: fire-and-save).
  const mutate = useCallback(
    (fn: (d: EditorDraft) => EditorDraft) => {
      setPublished(false); // editing again → there are unpublished changes
      setDraft((prev) => {
        const next = fn(prev);
        save.mutate(next);
        return next;
      });
    },
    [save],
  );

  const addStatus = useCallback(
    (statusId: string) =>
      mutate((d) => {
        if (d.statuses.some((s) => s.statusId === statusId)) return d;
        const isFirst = d.statuses.length === 0;
        return {
          ...d,
          statuses: [
            ...d.statuses,
            { statusId, isInitial: isFirst, x: 120 + d.statuses.length * 40, y: 120 + d.statuses.length * 40 },
          ],
        };
      }),
    [mutate],
  );

  const removeStatus = useCallback(
    (statusId: string) =>
      mutate((d) => ({
        ...d,
        statuses: d.statuses.filter((s) => s.statusId !== statusId),
        // Drop transitions that touch the removed status.
        transitions: d.transitions.filter(
          (t) => t.toStatusId !== statusId && !t.fromStatusIds.includes(statusId),
        ),
      })),
    [mutate],
  );

  /**
   * Replace a status in THIS workflow with another (which must NOT already be a
   * node here): swap the node (keep its initial flag/position) and re-point every
   * transition's To/From from old → new. Other workflows are untouched.
   */
  const replaceStatus = useCallback(
    (oldStatusId: string, newStatusId: string) =>
      mutate((d) => {
        if (oldStatusId === newStatusId) return d;
        if (d.statuses.some((s) => s.statusId === newStatusId)) return d; // already present
        return {
          ...d,
          statuses: d.statuses.map((s) =>
            s.statusId === oldStatusId ? { ...s, statusId: newStatusId } : s,
          ),
          transitions: d.transitions.map((t) => ({
            ...t,
            toStatusId: t.toStatusId === oldStatusId ? newStatusId : t.toStatusId,
            fromStatusIds: Array.from(
              new Set(t.fromStatusIds.map((id) => (id === oldStatusId ? newStatusId : id))),
            ),
          })),
        };
      }),
    [mutate],
  );

  const moveNode = useCallback(
    (statusId: string, x: number, y: number) =>
      mutate((d) => ({
        ...d,
        statuses: d.statuses.map((s) =>
          s.statusId === statusId ? { ...s, x, y } : s,
        ),
      })),
    [mutate],
  );

  const setInitial = useCallback(
    (statusId: string) =>
      mutate((d) => ({
        ...d,
        statuses: d.statuses.map((s) => ({ ...s, isInitial: s.statusId === statusId })),
      })),
    [mutate],
  );

  const addTransition = useCallback(
    (t: {
      name: string;
      type: TransitionType;
      toStatusId: string;
      fromStatusIds: string[];
    }) =>
      mutate((d) => ({
        ...d,
        transitions: [...d.transitions, { id: newId(), rules: [], ...t }],
      })),
    [mutate],
  );

  const addRule = useCallback(
    (transitionId: string, rule: EditorRule) =>
      mutate((d) => ({
        ...d,
        transitions: d.transitions.map((t) => {
          if (t.id !== transitionId) return t;
          // Only one "Show a screen" rule is allowed per transition.
          if (rule.type === "show_screen" && t.rules.some((r) => r.type === "show_screen")) {
            return t;
          }
          return { ...t, rules: [...t.rules, rule] };
        }),
      })),
    [mutate],
  );

  const removeRule = useCallback(
    (transitionId: string, index: number) =>
      mutate((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.id === transitionId
            ? { ...t, rules: t.rules.filter((_, i) => i !== index) }
            : t,
        ),
      })),
    [mutate],
  );

  /** Replace the rule at `index` on a transition (Edit Rule modal). */
  const updateRule = useCallback(
    (transitionId: string, index: number, rule: EditorRule) =>
      mutate((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.id === transitionId
            ? { ...t, rules: t.rules.map((r, i) => (i === index ? rule : r)) }
            : t,
        ),
      })),
    [mutate],
  );

  const updateTransition = useCallback(
    (id: string, patch: Partial<EditorTransition>) =>
      mutate((d) => ({
        ...d,
        transitions: d.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    [mutate],
  );

  const removeTransition = useCallback(
    (id: string) =>
      mutate((d) => ({
        ...d,
        transitions: d.transitions.filter((t) => t.id !== id),
      })),
    [mutate],
  );

  return {
    draft,
    saving: save.isPending,
    saveError: save.error as Error | null,
    published,
    publish,
    publishErrors,
    migration,
    clearMigration: () => setMigration(null),
    addStatus,
    removeStatus,
    replaceStatus,
    moveNode,
    setInitial,
    addTransition,
    updateTransition,
    removeTransition,
    addRule,
    removeRule,
    updateRule,
  };
}
