"use client";

/**
 * VendorTermsCell — per-vendor Terms & Conditions override, rendered as
 * a grid cell in the RFQ / PO vendor rows.
 *
 * Each vendor gets the document-level default T&C unless the raiser
 * opens this editor and writes something specific for that vendor. The
 * override is stamped on that vendor's own document copy (RFQ vendor row
 * / that vendor's PO) — it never touches the T&C master.
 *
 * The row stores `termsAndConditions` (empty / absent = use the default)
 * and, when a named template was picked, `termsTemplateId` for audit.
 *
 * The editor itself is rich (bold/italic/underline/lists) for a nicer
 * writing experience, but what's persisted to the DB is always plain
 * text — `htmlToPlainText` strips formatting on save (bold/italic/
 * underline don't have a plain-text equivalent and are dropped; list
 * items become "1. "/"- " prefixed lines) so `termsAndConditions`
 * stays human-readable in the database, matching the plain-text T&C
 * master template.
 */

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";

export interface VendorTermsTemplate {
  id: string;
  title: string;
  body: string;
}

const HTML_TAG_RE = /<[a-zA-Z][\s\S]*>/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** T&C master template bodies (and legacy overrides saved before this
 *  editor existed) are plain text — wrap each line so it renders as a
 *  separate paragraph in the rich editor instead of one run-on line. */
function toEditorHtml(text: string): string {
  const t = String(text ?? "");
  if (!t.trim()) return "";
  if (HTML_TAG_RE.test(t)) return t;
  return t
    .split(/\r?\n/)
    .map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`)
    .join("");
}

/**
 * Converts the rich editor's HTML back to plain text for storage.
 * Bold/italic/underline have no plain-text equivalent and are simply
 * dropped; bullet/numbered list items become "- "/"N. " prefixed
 * lines so the structure survives even though the styling doesn't.
 */
function htmlToPlainText(html: string): string {
  const raw = String(html ?? "").trim();
  if (!raw) return "";
  if (!HTML_TAG_RE.test(raw)) return raw;

  const lines: string[] = [];
  let current = "";
  const listStack: Array<{ type: "bullet" | "number"; index: number }> = [];

  const flush = () => {
    const text = decodeEntities(current).replace(/[ \t]+/g, " ").trim();
    current = "";
    if (!text) return;
    const top = listStack[listStack.length - 1];
    if (top) lines.push(top.type === "number" ? `${top.index}. ${text}` : `- ${text}`);
    else lines.push(text);
  };

  const tagRe = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(raw))) {
    if (m.index > lastIndex) current += raw.slice(lastIndex, m.index);
    lastIndex = tagRe.lastIndex;
    const closing = m[0].startsWith("</");
    const tag = m[1].toLowerCase();
    if (tag === "br") flush();
    else if (tag === "div" || tag === "p") {
      if (closing) flush();
    } else if (tag === "ul") {
      if (!closing) listStack.push({ type: "bullet", index: 0 });
      else listStack.pop();
    } else if (tag === "ol") {
      if (!closing) listStack.push({ type: "number", index: 0 });
      else listStack.pop();
    } else if (tag === "li") {
      if (!closing) {
        flush();
        const top = listStack[listStack.length - 1];
        if (top) top.index += 1;
      } else {
        flush();
      }
    }
    // b/strong/i/em/u/span etc. are ignored — their inner text still
    // flows through, just without the styling.
  }
  if (lastIndex < raw.length) current += raw.slice(lastIndex);
  flush();

  return lines.join("\n");
}

interface VendorTermsCellProps {
  /** Current vendor row — reads `termsAndConditions` / `termsTemplateId`. */
  line: Record<string, unknown>;
  /** Patch this vendor row. */
  update: (patch: Record<string, unknown>) => void;
  /** Document-level T&C text used when this vendor has no override. */
  defaultBody: string;
  /** T&C master entries offered in the editor's template dropdown. */
  templates: VendorTermsTemplate[];
  /** Shown in the editor heading so the raiser knows whose terms these are. */
  vendorLabel?: string;
}

export function VendorTermsCell({
  line,
  update,
  defaultBody,
  templates,
  vendorLabel,
}: VendorTermsCellProps) {
  const stored = String(line.termsAndConditions ?? "");
  const hasOverride = stored.trim().length > 0;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(toEditorHtml(hasOverride ? stored : defaultBody));
    setTemplateId(String(line.termsTemplateId ?? ""));
    // Only re-seed when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const save = () => {
    const plainText = htmlToPlainText(draft);
    // Saving the untouched default is the same as "no override" — keep
    // the row clean so a later edit to the header terms still flows
    // through to this vendor.
    const isDefault = plainText.trim() === defaultBody.trim();
    update({
      termsAndConditions: isDefault ? "" : plainText,
      termsTemplateId: isDefault ? "" : templateId,
    });
    setOpen(false);
  };

  const useDefault = () => {
    update({ termsAndConditions: "", termsTemplateId: "" });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-between gap-2 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:border-accent-400 hover:bg-accent-50"
        title="Terms & Conditions for this vendor"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Terms</span>
        </span>
        <span
          className={`shrink-0 text-[11px] font-semibold ${
            hasOverride ? "text-accent-600" : "text-gray-500"
          }`}
        >
          {hasOverride ? "Custom" : "Default"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Terms &amp; Conditions
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {vendorLabel ? `For ${vendorLabel}` : "For this vendor"} — the
                  master template is never changed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-6 py-4">
              {templates.length > 0 && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Load from template
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTemplateId(id);
                      const tpl = templates.find((t) => t.id === id);
                      if (tpl) setDraft(toEditorHtml(tpl.body));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  >
                    <option value="">Keep current text…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Terms text for this vendor
                </label>
                <RichTextEditor
                  value={draft}
                  onChange={setDraft}
                  minHeight={260}
                  placeholder="Terms printed on this vendor's document"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-3">
              <button
                type="button"
                onClick={useDefault}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                Reset to document default
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
