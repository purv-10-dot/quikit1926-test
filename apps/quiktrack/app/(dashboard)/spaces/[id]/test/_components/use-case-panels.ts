"use client";

import { useState } from "react";

/**
 * Which case sheet is open, and how they hand off to each other (QUIKTR-336).
 *
 * A row click READS the case; Edit switches to the form and closing the form
 * returns to the detail view it came from. That handoff is three interacting
 * booleans, and getting it wrong is silent — the wrong sheet opens, or the detail
 * panel reopens showing a stale case — so it lives here rather than inline in
 * `repository-view.tsx` (which was one line off the 300-LOC ceiling).
 */
export function useCasePanels() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  /** Editor was reached from the detail panel, so closing goes back to it. */
  const [cameFromDetail, setCameFromDetail] = useState(false);

  return {
    caseId,
    detailOpen,
    editorOpen,

    /** Row click — read the case. */
    openDetail(id: string) {
      setCaseId(id);
      setCameFromDetail(false);
      setDetailOpen(true);
    },

    /** "New test case" — no detail view to return to. */
    openCreate() {
      setCaseId(null);
      // Both of these matter, and a state-machine test caught the second one:
      //  - clearing the flag stops the create form from "returning" to a detail
      //    view it never came from;
      //  - closing the detail sheet stops the PREVIOUSLY viewed case's panel from
      //    being left open behind the form, which then reappears on close with
      //    caseId already null.
      setCameFromDetail(false);
      setDetailOpen(false);
      setEditorOpen(true);
    },

    /** Edit from the detail panel. Closes detail first so sheets never stack. */
    editFromDetail() {
      setDetailOpen(false);
      setCameFromDetail(true);
      setEditorOpen(true);
    },

    closeDetail() {
      setDetailOpen(false);
    },

    closeEditor() {
      setEditorOpen(false);
      if (cameFromDetail) {
        setCameFromDetail(false);
        setDetailOpen(true);
      }
    },
  };
}
