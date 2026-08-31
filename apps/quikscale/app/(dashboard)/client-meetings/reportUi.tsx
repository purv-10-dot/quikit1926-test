"use client";

/**
 * Shared presentation primitives for the Meeting Rhythm report screens
 * (daily rollup, weekly meeting, monthly).
 *
 * These exist so the three reports look like one product rather than three
 * features built in sequence: the same card, the same stat tile, the same
 * empty state, the same sign-off bar. Every colour here is either an
 * `accent-*` token (branded chrome) or a semantic Tailwind colour that encodes
 * a data state — see the theming rules in CLAUDE.md.
 */

import type { ReactElement, ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Download, FileText, Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

/* ───────────────────────────── layout ───────────────────────────── */

/** A titled block. `action` sits on the right of the header row. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-gray-800">{title}</h4>
          {subtitle ? <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * One headline number.
 *
 * `tone` is semantic, never branded: a completion rate is not part of the
 * tenant's colour scheme, and theming it would make "good" and "bad" change
 * meaning between tenants.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10.5px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>;
}

/** Centred icon + message. Used for every "nothing here yet" state. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-6 py-10 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-300 shadow-sm">
        {icon ?? <FileText className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Grey bars standing in for content while it loads. */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-gray-100" style={{ width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/* ───────────────────────────── banners ───────────────────────────── */

export function Banner({
  tone,
  children,
}: {
  tone: "error" | "warn" | "info" | "success";
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "success"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-blue-200 bg-blue-50 text-blue-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`} role="status">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** 0..1 confidence, as a labelled pill. Semantic colours by design. */
export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.7
      ? "bg-green-100 text-green-700"
      : value >= 0.4
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${cls}`}
      title="How confident the model is in this report, overall"
    >
      {pct}% confidence
    </span>
  );
}

/**
 * Draft / Validated state plus the sign-off toggle.
 *
 * `blockedReason` disables sign-off with an explanation rather than hiding the
 * button — a reviewer who cannot sign off deserves to know why.
 */
export function SignOffBar({
  validatedAt,
  canEdit,
  saving,
  blockedReason,
  onToggle,
  extra,
}: {
  validatedAt: string | null;
  canEdit: boolean;
  saving: boolean;
  blockedReason?: string | null;
  onToggle: (next: boolean) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        {validatedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Validated
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">Draft</span>
        )}
        {extra}
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onToggle(!validatedAt)}
          disabled={saving || (!validatedAt && Boolean(blockedReason))}
          title={!validatedAt && blockedReason ? blockedReason : undefined}
          className="rounded-lg border border-accent-300 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50"
        >
          {saving ? "Saving…" : validatedAt ? "Withdraw sign-off" : "Mark as validated"}
        </button>
      ) : (
        <span className="text-[11px] italic text-gray-400">View only</span>
      )}
    </div>
  );
}

/* ───────────────────────────── download ───────────────────────────── */

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Download a stored report as .docx.
 *
 * The body carries only identifiers — the server reads the report from
 * storage, so a download can never contain client-supplied content dressed up
 * as an official deliverable.
 */
export function DownloadDocxButton({
  endpoint,
  body,
  filename,
  label = "Download .docx",
}: {
  endpoint: string;
  body: Record<string, string>;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Export failed (${res.status})`);
      }
      triggerDownload(await res.blob(), filename);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? "Building…" : label}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}

/**
 * Download a report as .pdf, rendered in the browser.
 *
 * The PDF is built client-side with react-pdf (lazy-imported, so its weight
 * never lands in the page bundle) from the SAME component the bulk export uses
 * on the server. One component, two callers: a report downloaded here and the
 * same report pulled out of a bulk zip are the same document.
 */
export function DownloadPdfButton({
  makeDoc,
  filename,
  label = ".pdf",
}: {
  /** Given the org name, produce the document element to render. */
  makeDoc: (orgName: string) => Promise<ReactElement>;
  filename: string;
  label?: string;
}) {
  const { org } = useOrgInfo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(await makeDoc(org?.name ?? "QuikScale")).toBlob();
      if (!blob || blob.size === 0) throw new Error("Generated PDF is empty");
      triggerDownload(blob, filename);
    } catch (e) {
      console.error("[report] PDF generation failed", e);
      setError("Could not generate the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? "Building…" : label}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}

/* ───────────────────────────── misc ───────────────────────────── */

/** RAG / status word → chip classes. Semantic, never themed. */
export function ragClass(value: string | null | undefined): string {
  const v = (value ?? "").toUpperCase();
  if (v.startsWith("G")) return "bg-green-100 text-green-700";
  if (v.startsWith("A") || v.startsWith("Y")) return "bg-amber-100 text-amber-800";
  if (v.startsWith("R")) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export const pctText = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${v.toFixed(digits)}%`;

/* ───────────────────────────── editing ───────────────────────────── */

/**
 * Inline edit primitives for report prose.
 *
 * Reports are read far more often than they are edited, so editing is a MODE
 * rather than a permanent field: `editing === false` renders exactly the text a
 * reader saw before any of this existed, with no boxes or affordances in the
 * way. Only in edit mode do the same values become inputs, in place, so a
 * facilitator never loses the surrounding table while correcting one cell.
 *
 * What may be edited is decided on the SERVER, by the allow-list in
 * `lib/reports/reportEditMerge.ts`. These components are the hands, not the
 * rules: an input rendered over a computed number would simply be ignored on
 * save — which is why no number gets one.
 */

/** A single prose field. `multiline` turns it into an auto-sized textarea. */
export function EditableText({
  value,
  editing,
  onChange,
  multiline = false,
  placeholder = "—",
  className = "",
  ariaLabel,
}: {
  value: string | null | undefined;
  editing: boolean;
  onChange: (next: string) => void;
  multiline?: boolean;
  /** Shown when the value is empty — as text in read mode, as a hint in edit. */
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  if (!editing) {
    const text = (value ?? "").trim();
    return <span className={className}>{text.length ? text : placeholder}</span>;
  }

  const shared =
    "w-full rounded border border-amber-300 bg-amber-50/40 px-1.5 py-1 text-inherit " +
    "focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300";

  return multiline ? (
    <textarea
      aria-label={ariaLabel}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      // Grows with its content: a six-line observation in a two-line box is how
      // an editor ends up rewriting text they cannot see.
      rows={Math.min(12, Math.max(2, Math.ceil((value ?? "").length / 90) + 1))}
      className={`${shared} resize-y leading-relaxed ${className}`}
    />
  ) : (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${shared} ${className}`}
    />
  );
}

/**
 * A bullet list (the §4.2 highlights).
 *
 * Add and remove live here rather than in `EditableText` because a list is the
 * one editable shape where the number of items is itself the edit.
 */
export function EditableList({
  items,
  editing,
  onChange,
  ariaLabel,
  addLabel = "Add bullet",
}: {
  items: string[];
  editing: boolean;
  onChange: (next: string[]) => void;
  ariaLabel: string;
  addLabel?: string;
}) {
  if (!editing) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }

  const replace = (i: number, next: string) =>
    onChange(items.map((item, idx) => (idx === i ? next : item)));

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="pt-1.5 text-gray-400">•</span>
          <EditableText
            value={item}
            editing
            multiline
            onChange={(next) => replace(i, next)}
            ariaLabel={`${ariaLabel} ${i + 1}`}
            className="text-sm"
          />
          <button
            type="button"
            aria-label={`Remove ${ariaLabel} ${i + 1}`}
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="mt-1 rounded px-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="rounded border border-dashed border-gray-300 px-2 py-1 text-[11px] text-gray-500 hover:border-accent-300 hover:text-accent-700"
      >
        + {addLabel}
      </button>
    </div>
  );
}

/** A small enum field (a stuck status). Renders `children` when not editing. */
export function EditableSelect({
  value,
  editing,
  options,
  onChange,
  ariaLabel,
  children,
}: {
  value: string | null;
  editing: boolean;
  /** `value: null` is offered when the underlying field is nullable. */
  options: { value: string | null; label: string }[];
  onChange: (next: string | null) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  if (!editing) return <>{children}</>;

  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className="rounded border border-amber-300 bg-amber-50/40 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-300"
    >
      {options.map((o) => (
        <option key={o.value ?? "__null"} value={o.value ?? ""}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Edit-mode toolbar: Edit, or Save/Cancel with a dirty indicator.
 *
 * Save is disabled while clean — there is nothing to send — but Cancel is always
 * live, so nobody gets stuck in edit mode after an accidental keystroke.
 */
export function EditToolbar({
  editing,
  dirty,
  saving,
  canEdit,
  onEdit,
  onSave,
  onCancel,
}: {
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!canEdit) return null;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-accent-300 hover:text-accent-700"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit report
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[11px] text-amber-700">
        {dirty ? "Unsaved changes" : "Editing — nothing changed yet"}
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save changes
      </button>
    </div>
  );
}

/**
 * "Edited by a human" marker.
 *
 * Shown wherever the report is read, because a reader is entitled to know that
 * a sentence was written by a facilitator rather than generated — and because it
 * is the honest counterpart to the warning that regenerating discards it.
 */
export function ManualEditBadge({
  manualEdit,
}: {
  manualEdit?: { at: string; by: string; fields: string[] } | null;
}) {
  if (!manualEdit) return null;
  const count = manualEdit.fields.length;
  return (
    <span
      title={`Edited fields: ${manualEdit.fields.join(", ")}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800"
    >
      <Pencil className="h-3 w-3" />
      Manually edited
      {count ? ` · ${count} field${count === 1 ? "" : "s"}` : ""}
    </span>
  );
}
