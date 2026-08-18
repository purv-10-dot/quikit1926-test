"use client";

import { useEffect, useMemo } from "react";
import type { TestStatusLite } from "./runner-types";

/**
 * Runner keyboard shortcuts: 1-5 record an outcome, j/k move.
 *
 * Extracted from `runner-view.tsx`, which went over the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once the four tabs landed.
 *
 * The guards matter more than the bindings — each one prevents a keystroke from
 * silently writing a result:
 *   - typing in an input/textarea (a comment containing "1")
 *   - a modifier chord (browser shortcuts)
 *   - a closed run, or a submit already in flight
 *   - any tab other than Tests (reading Activity must not record anything)
 */
export function useRunnerKeys({
  statuses,
  enabled,
  submitting,
  step,
  advance,
  submitResult,
}: {
  statuses: TestStatusLite[] | undefined;
  /** False on a closed run or a non-Tests tab. */
  enabled: boolean;
  submitting: boolean;
  step: (delta: number) => void;
  advance: () => void;
  submitResult: (input: { statusId: string }) => Promise<boolean>;
}) {
  // 1-5 in the reference UI's order, skipping any status the org has deleted so
  // the digits never shift silently onto a different outcome.
  const primaryStatusByIndex = useMemo(() => {
    const order = ["passed", "failed", "blocked", "retest", "skipped"];
    return order
      .map((key) => statuses?.find((s) => s.key === key))
      .filter((s): s is TestStatusLite => Boolean(s));
  }, [statuses]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!enabled || submitting) return;

      if (e.key === "j") {
        step(1);
        return;
      }
      if (e.key === "k") {
        step(-1);
        return;
      }

      const n = Number.parseInt(e.key, 10);
      if (Number.isInteger(n) && n >= 1 && n <= primaryStatusByIndex.length) {
        const status = primaryStatusByIndex[n - 1];
        void submitResult({ statusId: status.id }).then((saved) => {
          if (saved) advance();
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryStatusByIndex, enabled, submitting, step, advance]);

  return { primaryStatusByIndex };
}
