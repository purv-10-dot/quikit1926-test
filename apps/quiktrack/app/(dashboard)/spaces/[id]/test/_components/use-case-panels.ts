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
export interface LinkToIssue {
  id: string;
  key: string;
}

export function useCasePanels() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  /** Editor was reached from the detail panel, so closing goes back to it. */
  const [cameFromDetail, setCameFromDetail] = useState(false);
  /**
   * Work item to auto-link as coverage once this create finishes (QUIKTR-341 —
   * "QuikTest: Cases" opened from a work item). Cleared whenever the editor
   * closes so a later plain "New test case" click never inherits a stale link.
   */
  const [linkToIssue, setLinkToIssue] = useState<LinkToIssue | null>(null);

  return {
    caseId,
    detailOpen,
    editorOpen,
    linkToIssue,

    /** Row click — read the case. */
    openDetail(id: string) {
      setCaseId(id);
      setCameFromDetail(false);
      setDetailOpen(true);
    },

    /** "New test case" — no detail view to return to. */
    openCreate(link?: LinkToIssue) {
      setCaseId(null);
      // Both of these matter, and a state-machine test caught the second one:
      //  - clearing the flag stops the create form from "returning" to a detail
      //    view it never came from;
      //  - closing the detail sheet stops the PREVIOUSLY viewed case's panel from
      //    being left open behind the form, which then reappears on close with
      //    caseId already null.
      setCameFromDetail(false);
      setDetailOpen(false);
      setLinkToIssue(link ?? null);
      setEditorOpen(true);
    },

    /** Edit from the detail panel. Closes detail first so sheets never stack. */
    editFromDetail() {
      setDetailOpen(false);
      setCameFromDetail(true);
      // Editing an existing case must never inherit a link queued for a
      // different, since-abandoned create flow.
      setLinkToIssue(null);
      setEditorOpen(true);
    },

    closeDetail() {
      setDetailOpen(false);
    },

    closeEditor() {
      setEditorOpen(false);
      setLinkToIssue(null);
      if (cameFromDetail) {
        setCameFromDetail(false);
        setDetailOpen(true);
      }
    },
  };
}
