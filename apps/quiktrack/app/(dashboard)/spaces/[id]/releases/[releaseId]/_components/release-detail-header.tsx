"use client";

import { useState } from "react";
import { Check, MessageSquare, PanelRightClose, PanelRightOpen, Rocket, X } from "lucide-react";
import { ShareFeedbackModal } from "@/components/share-feedback-modal";
import { CreateReleaseNotesModal } from "./create-release-notes-modal";
import type { ReleaseDetail } from "./release-detail-meta";

/** Release detail's title row: inline-editable name, "Give feedback" (reuses
 * the app-wide ShareFeedbackModal), "Release notes" (opens the generator),
 * and the sidebar collapse toggle. */
export function ReleaseDetailHeader({
  projectId,
  release,
  canUpdate,
  sidebarOpen,
  onToggleSidebar,
  onSaveName,
  onNotesSaved,
}: {
  projectId: string;
  release: ReleaseDetail;
  canUpdate: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSaveName: (name: string) => Promise<void>;
  onNotesSaved: () => void;
}) {
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  async function saveName() {
    const t = nameDraft.trim();
    if (!t) return;
    setNameEditing(false);
    if (t !== release.name) await onSaveName(t);
  }

  return (
    <>
      <header className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-100">
            <Rocket className="h-4 w-4 text-blue-600" />
          </span>
          {nameEditing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") setNameEditing(false);
                }}
                className="flex-1 min-w-0 h-9 px-3 text-2xl font-semibold border border-blue-500 rounded focus:outline-none"
              />
              <button
                type="button"
                disabled={!nameDraft.trim()}
                onClick={() => void saveName()}
                className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50"
                aria-label="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setNameEditing(false)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => {
                if (!canUpdate) return;
                setNameDraft(release.name);
                setNameEditing(true);
              }}
              className={`text-2xl font-semibold tracking-tight text-gray-900 truncate rounded px-1 -mx-1 ${
                canUpdate ? "cursor-text hover:bg-gray-50" : ""
              }`}
            >
              {release.name}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Give feedback
          </button>
          {canUpdate && (
            <button
              type="button"
              onClick={() => setNotesModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Release notes
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {feedbackOpen && (
        <ShareFeedbackModal projectId={projectId} onClose={() => setFeedbackOpen(false)} />
      )}
      <CreateReleaseNotesModal
        open={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        releaseId={release.id}
        onSaved={onNotesSaved}
      />
    </>
  );
}
