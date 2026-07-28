"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  EditorDraft,
  EditorRule,
  EditorTransition,
  PublishError,
  TransitionType,
} from "./editor-types";

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
export function useWorkflowEditor(wfId: string, initial: EditorDraft) {
  const [draft, setDraft] = useState<EditorDraft>(initial);
  const [publishErrors, setPublishErrors] = useState<PublishError[]>([]);

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
    mutationFn: async () => {
      const r = await fetch(`/api/workflows/${wfId}/publish`, { method: "POST" });
      const j = await r.json();
      if (r.status === 422 && Array.isArray(j.errors)) {
        setPublishErrors(j.errors as PublishError[]);
        throw new Error(j.error ?? "The workflow is not valid.");
      }
      if (!r.ok || !j.success) throw new Error(j.error ?? "Publish failed");
      setPublishErrors([]);
      return j.data;
    },
  });

  // Apply a mutation to the draft AND persist it (debounced-ish: fire-and-save).
  const mutate = useCallback(
    (fn: (d: EditorDraft) => EditorDraft) => {
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
        transitions: d.transitions.map((t) =>
          t.id === transitionId ? { ...t, rules: [...t.rules, rule] } : t,
        ),
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
    publish,
    publishErrors,
    addStatus,
    removeStatus,
    moveNode,
    setInitial,
    addTransition,
    updateTransition,
    removeTransition,
    addRule,
    removeRule,
  };
}
