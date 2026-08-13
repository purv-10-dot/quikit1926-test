"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import {
  readDescriptionDraft,
  writeDescriptionDraft,
  clearDescriptionDraft,
} from "@/lib/utils/description-draft";
import { RichTextView } from "@/components/rich-text-view";
import { uploadProjectImage } from "@/lib/upload-image";
import type { MentionItem } from "@/components/editor/mention";
import type { IssuePageData } from "./types";

interface Props {
  issue: IssuePageData;
  projectId: string;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
  /** People list for `@`-mentions in the description editor. */
  mentions?: MentionItem[];
}

/**
 * Collapsible Description section for the full issue view — split out of
 * `IssueHeaderSections` so that file stays under the 300-LOC ceiling.
 */
export function IssueDescriptionSection({ issue, projectId, onPatch, mentions }: Props) {
  const [descOpen, setDescOpen] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  // Auto-open Description when there's content.
  useEffect(() => {
    if (issue.description) setDescOpen(true);
  }, [issue.description]);

  // Restore an unsaved edit made in another tab (e.g. "Open in new tab" before
  // Save was clicked) instead of showing only the last-saved server value.
  useEffect(() => {
    const draft = readDescriptionDraft(issue.id);
    const saved = issue.description ?? "";
    if (draft !== null && draft !== saved) {
      setDescDraft(draft);
      setDescEditing(true);
      setDescOpen(true);
    }
  }, [issue.id, issue.description]);

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setDescOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
      >
        {descOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Description
      </button>
      {descOpen && (
        <div className="mt-2">
          {descEditing ? (
            <div>
              <RichTextEditor
                value={descDraft}
                onChange={(value) => {
                  setDescDraft(value);
                  writeDescriptionDraft(issue.id, value);
                }}
                placeholder="Add a description..."
                mentions={mentions ?? []}
                uploadImage={(file) => uploadProjectImage(projectId, file)}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescEditing(false);
                    setDescDraft("");
                    clearDescriptionDraft(issue.id);
                  }}
                  className="h-7 px-3 text-xs text-gray-700 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onPatch({ description: descDraft });
                    setDescEditing(false);
                    clearDescriptionDraft(issue.id);
                  }}
                  className="h-7 px-3 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          ) : issue.description ? (
            <div
              onClick={() => {
                setDescDraft(issue.description ?? "");
                setDescEditing(true);
              }}
              className="qt-rich-content text-sm text-gray-800 rounded p-2 -mx-2 cursor-text hover:bg-gray-50"
            >
              {/* Read-only render via the SAME TipTap extensions as the editor,
                  so file attachments render as identical inline cards. */}
              <RichTextView html={sanitizeRichText(issue.description)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDescDraft("");
                setDescEditing(true);
              }}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 -mx-2 py-2 block w-full text-left rounded hover:bg-gray-50"
            >
              Add a description...
            </button>
          )}
        </div>
      )}
    </section>
  );
}
