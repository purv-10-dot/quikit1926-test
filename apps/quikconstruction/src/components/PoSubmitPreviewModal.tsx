"use client";

/**
 * PoSubmitPreviewModal — shows the user exactly what the vendor will
 * receive (subject, rendered email body, and the attached PDF)
 * before the PO is submitted for approval. Mirrors
 * `RfqSubmitPreviewModal` but simplified to one recipient since
 * every PO targets a single vendor.
 */

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  FileText,
  Loader2,
  Mail,
  Pencil,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

interface PreviewItem {
  itemName: string;
  quantity: string;
  uomCode: string;
  specification: string | null;
}

interface PreviewPayload {
  poNumber: string;
  projectName: string | null;
  termsBody: string | null;
  vendor: {
    vendorId: string;
    vendorName: string;
    email: string | null;
    itemCount: number;
    items: PreviewItem[];
    subject: string;
    htmlBody: string;
    skipReason: string | null;
  } | null;
}

interface Props {
  open: boolean;
  poId: string;
  poNumber: string | null;
  onClose: () => void;
  /**
   * Called when the user clicks "Submit for Approval". The optional
   * `emailHtmlBody` carries the contents of the editable preview when
   * the buyer has tweaked it, so the server can ship that exact body
   * to the vendor instead of regenerating from the default template.
   */
  onConfirm: (overrides?: { emailHtmlBody?: string }) => void;
  submitting: boolean;
  submitError: string | null;
}

export function PoSubmitPreviewModal({
  open,
  poId,
  poNumber,
  onClose,
  onConfirm,
  submitting,
  submitError,
}: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"email" | "pdf">("email");
  // Editable cover-email body. The contentEditable div is uncontrolled
  // (writing to React state on every keystroke would clobber the
  // caret), so we keep two refs:
  //  - `editorRef`        → the live DOM node we read on submit
  //  - `initializedFor`   → the htmlBody string we last wrote into the
  //                         div, so we don't overwrite the user's
  //                         edits when the modal re-renders for an
  //                         unrelated reason (submitting / tab swap).
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initializedFor = useRef<string | null>(null);
  // True once the user has typed into the editor. Drives the "Reset"
  // button visibility and signals to the submit handler that we
  // should ship a custom body instead of the default template.
  const [edited, setEdited] = useState(false);

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
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/purchase/orders/${poId}/preview`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<PreviewPayload>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? "Failed to load preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, poId]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setTab("email");
      // Drop the "already initialized" marker so the next open
      // re-seeds the editor from a fresh preview.
      initializedFor.current = null;
      setEdited(false);
    }
  }, [open]);

  // Seed the editable email body once per (modal-open, htmlBody) pair.
  // We compare against `initializedFor` so re-renders triggered by
  // unrelated state (submitting / tab toggles) don't wipe the user's
  // in-progress edits. The `MutationObserver` keeps `edited` honest
  // when the user types — that drives the Reset button + decides
  // whether to ship an override on submit.
  useEffect(() => {
    if (!open) return;
    if (tab !== "email") return; // editor is unmounted on the PDF tab
    const node = editorRef.current;
    const html = preview?.vendor?.htmlBody;
    if (!node || !html) return;
    if (initializedFor.current === html) return;
    node.innerHTML = html;
    initializedFor.current = html;
    setEdited(false);
  }, [open, tab, preview?.vendor?.htmlBody]);

  const handleResetEmail = () => {
    const html = preview?.vendor?.htmlBody;
    if (!editorRef.current || !html) return;
    editorRef.current.innerHTML = html;
    initializedFor.current = html;
    setEdited(false);
  };

  const handleConfirm = () => {
    const liveHtml = editorRef.current?.innerHTML?.trim() ?? "";
    const original = preview?.vendor?.htmlBody?.trim() ?? "";
    // Only ship the override if the user actually changed something
    // and there's content to send. Empty body would leave the vendor
    // staring at a blank email — fall back to the template instead.
    const overrides =
      edited && liveHtml.length > 0 && liveHtml !== original
        ? { emailHtmlBody: editorRef.current?.innerHTML }
        : undefined;
    onConfirm(overrides);
  };

  if (!open) return null;

  const v = preview?.vendor ?? null;
  const sendable = v && !v.skipReason;
  const pdfUrl = sendable ? `/api/purchase/orders/${poId}/preview/pdf` : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={submitting ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Submit PO for Approval
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Preview the email + PDF the vendor will receive once the PO is
              approved.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vendor strip */}
        {v && (
          <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                v.skipReason
                  ? "bg-amber-50 text-amber-600"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {v.vendorName}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {v.email ?? (
                  <span className="italic text-amber-600">no email on file</span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-gray-500">
              {v.itemCount} item{v.itemCount === 1 ? "" : "s"}
              {v.skipReason && (
                <span className="ml-2 text-amber-600 font-medium">
                  • {v.skipReason}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tabs + body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-200 shrink-0">
            <TabButton
              active={tab === "email"}
              onClick={() => setTab("email")}
              icon={<Mail className="w-3.5 h-3.5" />}
              label="Email"
            />
            <TabButton
              active={tab === "pdf"}
              onClick={() => setTab("pdf")}
              icon={<FileText className="w-3.5 h-3.5" />}
              label="PDF Attachment"
            />
          </div>

          <div className="flex-1 min-h-[560px] overflow-auto bg-gray-50">
            {loading && (
              <div className="h-full flex items-center justify-center text-sm text-gray-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading preview…
              </div>
            )}
            {loadError && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {loadError}
                </div>
              </div>
            )}

            {!loading && !loadError && !v && (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                This PO has no vendor attached to preview.
              </div>
            )}

            {!loading && !loadError && v && tab === "email" && (
              <div className="p-6">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="uppercase tracking-wider text-gray-400 font-semibold w-16 shrink-0">
                        To
                      </span>
                      <span className="text-gray-800">
                        {v.email ?? (
                          <span className="italic text-amber-600">
                            no email on file
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-xs mt-1.5">
                      <span className="uppercase tracking-wider text-gray-400 font-semibold w-16 shrink-0">
                        Subject
                      </span>
                      <span className="text-gray-900 font-medium">
                        {v.subject}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-xs mt-1.5">
                      <span className="uppercase tracking-wider text-gray-400 font-semibold w-16 shrink-0">
                        Attach
                      </span>
                      <span className="text-gray-700">
                        {(preview?.poNumber ?? "po") + ".pdf"} · {v.itemCount}{" "}
                        item{v.itemCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-5 py-2 border-b border-gray-100 bg-white">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                      <Pencil className="w-3 h-3" />
                      Click the body below to edit before sending.
                    </span>
                    {edited && (
                      <button
                        type="button"
                        onClick={handleResetEmail}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-orange-600 disabled:opacity-40"
                        title="Reset to default email"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    )}
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable={!submitting}
                    suppressContentEditableWarning
                    onInput={() => {
                      if (!edited) setEdited(true);
                    }}
                    spellCheck
                    className="px-6 py-5 text-sm text-gray-800 leading-relaxed min-h-[200px] focus:outline-none focus:bg-orange-50/30 focus:ring-1 focus:ring-inset focus:ring-orange-200"
                  />
                </div>
                {v.skipReason && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                    This email would be skipped at send time —{" "}
                    <strong>{v.skipReason}</strong>.
                  </div>
                )}
                {edited && !v.skipReason && (
                  <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-800">
                    Your edits will be sent to the vendor instead of the
                    default email.
                  </div>
                )}
              </div>
            )}

            {!loading && !loadError && v && tab === "pdf" && (
              <div className="h-full min-h-[560px]">
                {pdfUrl ? (
                  <iframe
                    key={pdfUrl}
                    src={pdfUrl}
                    className="w-full h-full min-h-[560px] border-0 bg-white"
                    title={`PO PDF — ${v.vendorName}`}
                  />
                ) : (
                  <div className="h-full min-h-[560px] flex items-center justify-center p-6">
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      No PDF preview available — {v.skipReason ?? "missing data"}.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="text-xs text-gray-500">
            {v && !v.skipReason
              ? "The vendor will receive this on final approval."
              : v?.skipReason
                ? "Email will be skipped at send time."
                : ""}
          </div>
          <div className="flex items-center gap-2">
            {submitError && (
              <span className="text-xs text-red-600 mr-2">{submitError}</span>
            )}
            <SecondaryButton onClick={onClose} disabled={submitting}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={handleConfirm}
              disabled={submitting || loading || !!loadError}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? "Submitting\u2026" : "Submit for Approval"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
        active
          ? "text-orange-600 border-orange-500 bg-white"
          : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
