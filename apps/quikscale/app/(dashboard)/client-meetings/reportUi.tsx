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

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

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
