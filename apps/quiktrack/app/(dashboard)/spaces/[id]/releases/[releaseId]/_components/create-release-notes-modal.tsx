"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@/components/modal";
import { showToast } from "@/lib/ui/toast";
import { sanitizeRichText } from "@/lib/sanitize";
import { PortalDropdown } from "../../_shared/portal-dropdown";
import {
  NOTES_TYPE_OPTIONS,
  buildReleaseNotesHtml,
  buildReleaseNotesMarkdown,
  type NotesSourceItem,
} from "./release-notes-format";

/**
 * "Create release notes" generator — fetches every work item linked to this
 * release, groups it by type, and renders a live preview the user can filter
 * (work types, keys/description fields), copy (Markdown or HTML), and save
 * as a Related work card. Saving re-runs on every open of an existing note so
 * "Save" always reflects the release's current work items.
 */
export function CreateReleaseNotesModal({
  open,
  onClose,
  releaseId,
  existingLinkId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  releaseId: string;
  /** Set when reopening an already-saved release-notes card — Save then
   * PATCHes that row instead of creating a new one. */
  existingLinkId?: string | null;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [releaseName, setReleaseName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [items, setItems] = useState<NotesSourceItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>(NOTES_TYPE_OPTIONS.map((o) => o.value));
  const [showKeys, setShowKeys] = useState(true);
  const [showDescription, setShowDescription] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFormattingOpen(false);
    setCopyMenuOpen(false);
    fetch(`/api/releases/${releaseId}/notes-source`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.success) {
          setReleaseName(res.data.releaseName);
          setProjectName(res.data.projectName);
          setItems(res.data.items ?? []);
          setTypeFilter(
            Array.from(new Set((res.data.items ?? []).map((i: NotesSourceItem) => i.type))),
          );
        }
      })
      .catch(() => showToast("Couldn't load work items for this release.", "error"))
      .finally(() => setLoading(false));
  }, [open, releaseId]);

  const filteredItems = useMemo(
    () => items.filter((i) => typeFilter.includes(i.type)),
    [items, typeFilter],
  );
  const fields = useMemo(() => ({ showKeys, showDescription }), [showKeys, showDescription]);

  const html = useMemo(
    () => buildReleaseNotesHtml(releaseName, projectName, filteredItems, fields),
    [releaseName, projectName, filteredItems, fields],
  );

  async function copy(format: "markdown" | "html") {
    setCopyMenuOpen(false);
    const text =
      format === "markdown"
        ? buildReleaseNotesMarkdown(releaseName, projectName, filteredItems, fields)
        : html;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard.", "success");
    } catch {
      showToast("Couldn't copy — your browser blocked clipboard access.", "error");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const title = `Release Notes - ${projectName} - ${releaseName}`;
      const body = existingLinkId
        ? await fetch(`/api/releases/${releaseId}/links/${existingLinkId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, noteBody: html }),
          }).then((r) => r.json())
        : await fetch(`/api/releases/${releaseId}/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, type: "Release notes", noteBody: html }),
          }).then((r) => r.json());
      if (!body?.success) {
        showToast(body?.error || "Couldn't save release notes.", "error");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <Modal open={open} onOpenChange={(v) => !v && onClose()} className="max-w-2xl">
      <ModalContent>
        <ModalHeader onClose={onClose}>
          <ModalTitle>Create release notes</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">Preview</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFormattingOpen((v) => !v)}
                className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded border ${
                  formattingOpen
                    ? "border-blue-500 text-blue-700 bg-blue-50"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Formatting options
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {formattingOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">Include work types</div>
                    <PortalDropdown
                      multiple
                      placeholder="All work types"
                      options={NOTES_TYPE_OPTIONS}
                      selected={typeFilter}
                      onChange={setTypeFilter}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">Work item fields</div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showKeys}
                        onChange={(e) => setShowKeys(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                      />
                      Work item keys
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showDescription}
                        onChange={(e) => setShowDescription(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                      />
                      Description
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 px-4 py-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className="qt-shimmer block h-5 rounded" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                No work items match the selected filters.
              </div>
            ) : (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
              />
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCopyMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 h-9 px-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Copy to clipboard
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {copyMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1 z-30 min-w-[140px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                <button
                  type="button"
                  onClick={() => void copy("markdown")}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Markdown
                </button>
                <button
                  type="button"
                  onClick={() => void copy("html")}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  HTML
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
          >
            {saving ? "Saving…" : "Save release notes"}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>,
    document.body,
  );
}
