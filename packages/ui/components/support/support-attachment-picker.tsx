"use client";

/**
 * File picker for the Raise-a-request form.
 *
 * Replaces the old Subject field: a screenshot of the broken screen tells the
 * triage team more than a one-line summary ever did, and the summary is now
 * derived server-side from the description.
 *
 * Selected files are held in local state and uploaded only on submit, so
 * removing one before sending costs nothing and abandoning the form uploads
 * nothing at all. Image previews use object URLs, revoked on unmount — without
 * that, every re-pick leaks a blob for the lifetime of the page.
 *
 * Limits are enforced here for feedback only; `@quikit/shared/supportAttachments`
 * re-checks all of them server-side, and that is the actual boundary.
 */

import { useEffect, useState } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_COUNT,
} from "@quikit/shared";

export interface PickedFile {
  /** Stable id so React keys survive reordering after a removal. */
  id: string;
  file: File;
  /** Object URL for images; null for PDFs (rendered as an icon instead). */
  previewUrl: string | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_MB = Math.round(SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024));

export function SupportAttachmentPicker({
  files,
  onChange,
  disabled,
}: {
  files: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  // Revoke every object URL still alive when the view unmounts. The picker is
  // inside a panel that mounts and unmounts on every open, so leaking here
  // would accumulate across a session.
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);

    const incoming = Array.from(list);
    const accepted: PickedFile[] = [];

    for (const file of incoming) {
      if (files.length + accepted.length >= SUPPORT_ATTACHMENT_MAX_COUNT) {
        setError(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_COUNT} files.`);
        break;
      }
      const type = (file.type || "").toLowerCase();
      if (!(SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(type)) {
        setError(`${file.name}: attach an image or a PDF.`);
        continue;
      }
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        setError(`${file.name} is ${formatBytes(file.size)} — the limit is ${MAX_MB} MB.`);
        continue;
      }
      // Same name + size + mtime twice over is a re-pick, not a second file.
      const duplicate =
        files.some((f) => f.file.name === file.name && f.file.size === file.size) ||
        accepted.some((f) => f.file.name === file.name && f.file.size === file.size);
      if (duplicate) continue;

      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }

    if (accepted.length > 0) onChange([...files, ...accepted]);
  }

  function removeFile(id: string) {
    const target = files.find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((f) => f.id !== id));
    setError(null);
  }

  const atLimit = files.length >= SUPPORT_ATTACHMENT_MAX_COUNT;

  return (
    <div>
      <label
        htmlFor="support-attachments"
        className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5"
      >
        Attachments{" "}
        <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span>
      </label>

      <input
        id="support-attachments"
        type="file"
        multiple
        accept={SUPPORT_ATTACHMENT_ACCEPT}
        disabled={disabled || atLimit}
        onChange={(e) => {
          addFiles(e.target.files);
          // Reset so picking the SAME file again after a removal still fires
          // a change event.
          e.currentTarget.value = "";
        }}
        className="sr-only"
      />

      <label
        htmlFor="support-attachments"
        aria-disabled={disabled || atLimit}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center transition-colors ${
          disabled || atLimit
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-accent-300 hover:bg-accent-50/40"
        }`}
      >
        <Paperclip className="h-4 w-4 text-accent-600" />
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {atLimit ? "Attachment limit reached" : "Add a screenshot or file"}
        </span>
        <span className="text-[11px] text-[var(--color-text-secondary)]">
          Images or PDF · up to {MAX_MB} MB · max {SUPPORT_ATTACHMENT_MAX_COUNT}
        </span>
      </label>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-1.5"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--color-neutral-100)]">
                {f.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : f.file.type === "application/pdf" ? (
                  <FileText className="h-4 w-4 text-[var(--color-text-secondary)]" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-[var(--color-text-secondary)]" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-[var(--color-text-primary)]">
                  {f.file.name}
                </span>
                <span className="block text-[11px] text-[var(--color-text-secondary)]">
                  {formatBytes(f.file.size)}
                </span>
              </span>

              <button
                type="button"
                onClick={() => removeFile(f.id)}
                disabled={disabled}
                aria-label={`Remove ${f.file.name}`}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
