"use client";

import { useCallback, useState } from "react";
import { TransitionScreenModal, type TransitionScreenData } from "./transition-screen-modal";

async function fetchTransitionScreen(issueId: string, toStatusId: string): Promise<TransitionScreenData | null> {
  const r = await fetch(`/api/issues/${issueId}/transition-screen?to=${encodeURIComponent(toStatusId)}`);
  const j = await r.json();
  if (!r.ok || !j.success) return null;
  return (j.data?.screen ?? null) as TransitionScreenData | null;
}

/**
 * Shared "Show a screen" gate for any move surface (board DnD, list, table…).
 *
 * `promptForMove(issueId, toStatusId, transitionName?)` resolves to:
 *   - a Record of inputs → the caller should move WITH these inputs, and
 *   - `undefined` → no screen gates the move; move as usual.
 * It rejects when the user cancels the screen. Render `modal` once in the tree.
 */
export function useTransitionScreenPrompt() {
  const [state, setState] = useState<{
    screen: TransitionScreenData;
    transitionName: string;
    resolve: (inputs: Record<string, unknown>) => void;
    reject: () => void;
  } | null>(null);

  const promptForMove = useCallback(
    async (issueId: string, toStatusId: string, transitionName = "Move"): Promise<Record<string, unknown> | undefined> => {
      const screen = await fetchTransitionScreen(issueId, toStatusId);
      if (!screen || screen.fields.length === 0) return undefined; // no gate
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        setState({ screen, transitionName, resolve, reject });
      });
    },
    [],
  );

  const modal = state ? (
    <TransitionScreenModal
      screen={state.screen}
      transitionName={state.transitionName}
      onSubmit={(inputs) => { state.resolve(inputs); setState(null); }}
      onCancel={() => { state.reject(); setState(null); }}
    />
  ) : null;

  return { promptForMove, modal };
}
