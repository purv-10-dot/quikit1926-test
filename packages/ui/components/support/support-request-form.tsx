"use client";

/**
 * "Raise a request" view — the one part of the widget backed by a real API.
 *
 * Submits to `POST {apiBase}` (default `/api/support/tickets`), which derives
 * org, user, app and role server-side.
 *
 * Deliberate differences from the reference widget this was ported from:
 *   - No Subject field. It was dropped in favour of attachments: a screenshot
 *     of the broken screen tells triage more than a one-line summary, and the
 *     summary is now derived server-side from the first line of the
 *     description (`deriveSubject` in @quikit/shared/supportTickets), so the
 *     admin queue still has something scannable in its title column.
 *   - Real attachments. The reference's picker only stored `{ name, size }` in
 *     local state and never uploaded — a control that silently discards the
 *     user's file is worse than no control. Files now go to Google Cloud
 *     Storage via `POST {uploadBase}`.
 *
 * Submit is two requests: upload the files, then create the ticket referencing
 * the returned keys. If ticket creation fails the uploaded objects are cleaned
 * up server-side, so a retry never double-stores.
 *
 * Uses plain `fetch` rather than react-query on purpose: @quikit/ui is consumed
 * by apps on three different @tanstack/react-query majors (and two with none at
 * all), so a hook dependency here would be a peer-version trap.
 */

import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_REQUEST_TYPES,
  SUPPORT_REQUEST_TYPE_LABELS,
  formatSupportTicketNo,
  type SupportRequestType,
} from "@quikit/shared";
import { SupportAttachmentPicker, type PickedFile } from "./support-attachment-picker";

interface CreatedTicket {
  id: string;
  ticketNo: number;
  requestType: SupportRequestType;
}

interface UploadedDescriptor {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const FIELD_CLS =
  "w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border,#E2E8F0)] bg-[var(--color-bg-primary,#FFFFFF)] text-[var(--color-text-primary,#0F172A)] focus:outline-none focus:ring-2 focus:ring-accent-400";

export function SupportRequestForm({
  apiBase,
  uploadBase,
  onClose,
}: {
  apiBase: string;
  uploadBase: string;
  onClose: () => void;
}) {
  const [requestType, setRequestType] = useState<SupportRequestType | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const [sent, setSent] = useState<CreatedTicket | null>(null);

  const isSubmitting = phase !== "idle";

  function resetForm() {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setRequestType("");
    setDescription("");
    setFiles([]);
    setErrors({});
    setSubmitError(null);
    setPhase("idle");
    setSent(null);
  }

  async function uploadFiles(): Promise<UploadedDescriptor[]> {
    if (files.length === 0) return [];
    const form = new FormData();
    files.forEach((f) => form.append("files", f.file));

    const res = await fetch(uploadBase, { method: "POST", body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || "Could not upload your attachments");
    }
    return (json.data?.files ?? []) as UploadedDescriptor[];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!requestType) next.requestType = "Select a request type";
    if (description.trim().length < 10)
      next.description = "Please describe the issue in at least 10 characters";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitError(null);
    try {
      setPhase("uploading");
      const attachments = await uploadFiles();

      setPhase("sending");
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          description,
          attachments: attachments.map((a) => ({
            objectKey: a.objectKey,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to submit support request");
      }
      setSent(json.data as CreatedTicket);
    } catch (err: unknown) {
      // Reported inline rather than as a toast: the panel is already on screen
      // and several apps have no toaster mounted at all.
      setSubmitError(err instanceof Error ? err.message : "Failed to submit support request");
    } finally {
      setPhase("idle");
    }
  }

  if (sent) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center text-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-6 w-6" />
          </span>
          <p className="text-sm text-[var(--color-text-secondary,#64748B)]">
            Thanks! Your{" "}
            <strong className="text-[var(--color-text-primary,#0F172A)]">
              {SUPPORT_REQUEST_TYPE_LABELS[sent.requestType]?.toLowerCase() ?? "request"}
            </strong>{" "}
            has been logged as{" "}
            <strong className="text-[var(--color-text-primary,#0F172A)]">
              {formatSupportTicketNo(sent.ticketNo)}
            </strong>
            . Our team will get back to you shortly.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--color-border,#E2E8F0)] text-[var(--color-text-secondary,#64748B)] hover:bg-[var(--color-neutral-50,#F8FAFC)]"
            >
              Send another
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
            <span>{submitError}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="support-type"
            className="block text-sm font-medium text-[var(--color-text-primary,#0F172A)] mb-1.5"
          >
            Request type <span className="text-red-500">*</span>
          </label>
          <select
            id="support-type"
            value={requestType}
            onChange={(e) => {
              setRequestType(e.target.value as SupportRequestType);
              setErrors((p) => ({ ...p, requestType: "" }));
            }}
            disabled={isSubmitting}
            className={FIELD_CLS}
          >
            <option value="">Select a request type…</option>
            {SUPPORT_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPPORT_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {errors.requestType && <p className="mt-1 text-xs text-red-600">{errors.requestType}</p>}
        </div>

        <div>
          <label
            htmlFor="support-description"
            className="block text-sm font-medium text-[var(--color-text-primary,#0F172A)] mb-1.5"
          >
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="support-description"
            rows={5}
            maxLength={SUPPORT_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((p) => ({ ...p, description: "" }));
            }}
            disabled={isSubmitting}
            placeholder="Describe your issue or request in a few lines…"
            className={`${FIELD_CLS} resize-y`}
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.description ? (
              <p className="text-xs text-red-600">{errors.description}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-[var(--color-text-secondary,#64748B)]">
              {description.length}/{SUPPORT_DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        <SupportAttachmentPicker files={files} onChange={setFiles} disabled={isSubmitting} />
      </div>

      <div className="flex gap-2 justify-end px-5 py-3 border-t border-[var(--color-border,#E2E8F0)] bg-[var(--color-neutral-50,#F8FAFC)]">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--color-border,#E2E8F0)] text-[var(--color-text-secondary,#64748B)] hover:bg-[var(--color-bg-primary,#FFFFFF)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white disabled:opacity-50 inline-flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "sending"
              ? "Sending…"
              : "Send request"}
        </button>
      </div>
    </form>
  );
}
