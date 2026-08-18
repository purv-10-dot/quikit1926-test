"use client";

/**
 * Shared email compose form — the single source of the To / Cc / Subject /
 * rich-HTML-body / attachments UI, used by BOTH the record "Send Email" modal
 * (ComposeEmailModal) and the "Log Activity → Email" flow. There is exactly one
 * email form and one send path (POST /api/email/send) in the app.
 *
 * This component is presentational + a couple of pure helpers; the parent owns
 * the dialog chrome and the related-record context.
 */

import { useState } from "react";
import { RichTextField } from "@quikit/ui";
import { Paperclip, X } from "lucide-react";

export interface ComposeValue {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: OutboundAttachment[];
}

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  /** base64 (no data: prefix). */
  contentBase64: string;
}

/**
 * Drop blanks and case-insensitive duplicates while keeping the first spelling
 * and the original order. Records often carry the same address in more than one
 * field (e.g. a Lead's email and secondaryEmail), which otherwise prefills the
 * To field with the same recipient twice.
 */
export function dedupeAddresses(list: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function emptyCompose(prefill?: {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  /** Pre-written body HTML (an AI draft, a template). Empty for a blank form. */
  body?: string;
}): ComposeValue {
  return {
    to: dedupeAddresses(prefill?.to ?? []).join(", "),
    cc: dedupeAddresses(prefill?.cc ?? []).join(", "),
    bcc: dedupeAddresses(prefill?.bcc ?? []).join(", "),
    subject: prefill?.subject ?? "",
    body: prefill?.body ?? "",
    attachments: [],
  };
}

export function parseAddresses(raw: string): string[] {
  return dedupeAddresses(raw.split(/[,;]/).map((s) => s.trim().toLowerCase()));
}

/** One send path for the whole app. Returns { ok, error }. */
export async function sendComposedEmail(args: {
  // Mirrors ACTIVITY_KINDS (the enum /api/email/send validates against).
  // Spelled out rather than imported because that registry module is
  // server-only (it imports the Prisma client at module scope).
  relatedKind:
    | "Lead"
    | "Contact"
    | "Account"
    | "Opportunity"
    | "Prospect"
    | "Upwork"
    | "None";
  relatedObjectId?: string;
  value: ComposeValue;
  inReplyToMessageId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const to = parseAddresses(args.value.to);
  if (to.length === 0) return { ok: false, error: "Add at least one recipient." };
  if (!args.value.subject.trim()) return { ok: false, error: "Subject is required." };

  try {
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        relatedKind: args.relatedKind,
        // Standalone omits the id; the API fills the sentinel.
        relatedObjectId: args.relatedKind === "None" ? undefined : args.relatedObjectId,
        to,
        cc: parseAddresses(args.value.cc),
        bcc: parseAddresses(args.value.bcc),
        subject: args.value.subject.trim(),
        bodyHtml: args.value.body || "<p></p>",
        inReplyToMessageId: args.inReplyToMessageId,
        attachments: args.value.attachments,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) return { ok: true };
    return { ok: false, error: json.error ?? "Failed to send email." };
  } catch {
    return { ok: false, error: "Failed to send email." };
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // strip "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface Props {
  value: ComposeValue;
  onChange: (next: ComposeValue) => void;
}

export function EmailComposeFields({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const next: OutboundAttachment[] = [];
      for (const file of Array.from(files)) {
        next.push({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: await readFileAsBase64(file),
        });
      }
      onChange({ ...value, attachments: [...value.attachments, ...next] });
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(idx: number) {
    onChange({ ...value, attachments: value.attachments.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-crm-muted">To</label>
        <input
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          placeholder="customer@example.com"
          className="crm-input w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-crm-muted">Cc</label>
        <input
          value={value.cc}
          onChange={(e) => onChange({ ...value, cc: e.target.value })}
          placeholder="optional"
          className="crm-input w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-crm-muted">Bcc</label>
        <input
          value={value.bcc}
          onChange={(e) => onChange({ ...value, bcc: e.target.value })}
          placeholder="optional"
          className="crm-input w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-crm-muted">Subject</label>
        <input
          value={value.subject}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          className="crm-input w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-crm-muted">Message</label>
        <RichTextField
          value={value.body}
          onChange={(html) => onChange({ ...value, body: html })}
          minHeight={180}
          placeholder="Write your message…"
        />
      </div>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800">
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? "Attaching…" : "Attach files"}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>
        {value.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {value.attachments.map((a, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded border border-crm-border px-2 py-0.5 text-xs text-crm-muted"
              >
                {a.filename}
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-crm-muted hover:text-red-600"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
