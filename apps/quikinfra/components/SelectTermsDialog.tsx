"use client";

/**
 * SelectTermsDialog — picker for which Terms & Conditions template to stamp
 * onto a document PDF before opening it.
 *
 * Presentational only: the caller passes the available templates and gets
 * back the chosen `termsId` (or one of the two sentinels). The component
 * resolves nothing itself — it just lets the user choose:
 *   • "Default terms" → onSelect(undefined)   (route falls back to org default)
 *   • a named template → onSelect(template.id)
 *   • "No terms"       → onSelect("none")      (route suppresses the section)
 */

import { useEffect } from "react";
import { X } from "lucide-react";

export interface TermsTemplate {
  id: string;
  title: string;
  applicableTo?: string | null;
}

interface SelectTermsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pass `undefined` for default, a template id, or "none" to suppress. */
  onSelect: (termsId: string | undefined) => void;
  templates: TermsTemplate[];
  loading?: boolean;
}

export function SelectTermsDialog({
  open,
  onClose,
  onSelect,
  templates,
  loading = false,
}: SelectTermsDialogProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Select Terms &amp; Conditions
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          <Option
            title="Default terms"
            subtitle="Use the organisation's default T&C template"
            onClick={() => onSelect(undefined)}
          />

          {loading && (
            <div className="px-6 py-4 text-sm text-gray-400">Loading templates…</div>
          )}

          {!loading &&
            templates.map((t) => (
              <Option
                key={t.id}
                title={t.title}
                subtitle={(t.applicableTo ?? "").toUpperCase() || undefined}
                onClick={() => onSelect(t.id)}
              />
            ))}

          <Option title="No terms" onClick={() => onSelect("none")} />
        </div>

        <p className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-400">
          Opens the PDF in a new tab with the selected terms stamped on it.
        </p>
      </div>
    </div>
  );
}

function Option({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-6 py-3 text-left transition-colors hover:bg-accent-50"
    >
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      {subtitle && <div className="mt-0.5 text-xs text-gray-500">{subtitle}</div>}
    </button>
  );
}
