"use client";

/**
 * RfqSubmitPreviewModal — shows the user exactly what each vendor will
 * receive (subject, rendered email body, and the attached PDF) before
 * the RFQ is submitted for approval. The preview uses the same builder
 * functions as the real send path, so "what you see is what goes out".
 */

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Download,
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

interface PreviewVendor {
  vendorId: string;
  vendorName: string;
  email: string | null;
  itemCount: number;
  items: PreviewItem[];
  subject: string;
  htmlBody: string;
  skipReason: string | null;
}

interface PreviewPayload {
  rfqNumber: string;
  projectName: string | null;
  termsBody: string | null;
  vendors: PreviewVendor[];
}

interface Props {
  open: boolean;
  rfqId: string;
  rfqNumber: string | null;
  onClose: () => void;
  /**
   * Called when the user clicks "Send Email". The optional
   * `emailHtmlBodies` map carries the contents of the per-vendor
   * editable previews when the buyer has tweaked any of them, so the
   * server can ship those exact bodies instead of regenerating from
   * the default template. Keyed by `vendorId`.
   */
  onConfirm: (overrides?: { emailHtmlBodies?: Record<string, string> }) => void;
  submitting: boolean;
  submitError: string | null;
}

export function RfqSubmitPreviewModal({
  open,
  rfqId,
  rfqNumber,
  onClose,
  onConfirm,
  submitting,
  submitError,
}: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [tab, setTab] = useState<"email" | "pdf">("email");

  // Per-vendor edited cover-email bodies. We persist edits across
  // vendor switches in `bodies` so toggling between recipients in the
  // sidebar doesn't lose the user's in-progress changes. The
  // contentEditable div itself stays uncontrolled (writing on every
  // keystroke would clobber the caret); on each vendor switch /
  // mount we seed it from `bodies[vendorId]` if present, otherwise
  // from the default template.
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [editedSet, setEditedSet] = useState<Set<string>>(() => new Set());
  // Tracks which (vendorId, htmlBody) the editor was last seeded
  // with, so re-renders triggered by unrelated state (submitting /
  // tab toggles / loadError) don't re-seed and wipe edits.
  const seededFor = useRef<{ vendorId: string; html: string } | null>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Esc to close when not submitting
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onClose]);

  // Fetch preview once the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/purchase/rfqs/${rfqId}/preview`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<PreviewPayload>;
      })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        // Default to the first vendor that would actually receive an
        // email — falls back to the first vendor overall so the user
        // can still see why a vendor is being skipped.
        const first =
          data.vendors.find((v) => !v.skipReason) ?? data.vendors[0] ?? null;
        setSelectedVendorId(first?.vendorId ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? "Failed to load preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, rfqId]);

  // Reset local state on close so re-opening refetches
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setSelectedVendorId(null);
      setTab("email");
      setBodies({});
      setEditedSet(new Set());
      seededFor.current = null;
    }
  }, [open]);

  // Capture the current editor HTML into `bodies` before we tear it
  // down (vendor switch, tab swap, modal close). We use a ref-based
  // closure instead of state because the latest selectedVendorId is
  // needed at unmount time.
  const selectedRefForUnmount = useRef<string | null>(null);
  selectedRefForUnmount.current = selectedVendorId;
  const captureCurrent = () => {
    const vid = selectedRefForUnmount.current;
    if (!vid) return;
    const node = editorRef.current;
    if (!node) return;
    const html = node.innerHTML;
    setBodies((prev) =>
      prev[vid] === html ? prev : { ...prev, [vid]: html },
    );
  };

  // Seed the editor whenever the active vendor changes, the email
  // tab is on, or fresh preview data arrives. Order:
  //   1. user-edited body persisted in `bodies[vendorId]`
  //   2. preview's default htmlBody for that vendor
  // Skips re-seeding when `seededFor` matches what we'd write — that
  // keeps in-progress edits alive across re-renders triggered by
  // unrelated state (submitting flag, etc).
  useEffect(() => {
    if (!open || tab !== "email") return;
    const node = editorRef.current;
    if (!node) return;
    const vendor = preview?.vendors.find(
      (v) => v.vendorId === selectedVendorId,
    );
    if (!vendor) return;
    const target = bodies[vendor.vendorId] ?? vendor.htmlBody;
    if (
      seededFor.current?.vendorId === vendor.vendorId &&
      seededFor.current.html === target
    ) {
      return;
    }
    node.innerHTML = target;
    seededFor.current = { vendorId: vendor.vendorId, html: target };
  }, [open, tab, selectedVendorId, preview?.vendors, bodies]);

  // Capture when the user clicks a different vendor in the sidebar.
  const handleSelectVendor = (vendorId: string) => {
    captureCurrent();
    setSelectedVendorId(vendorId);
  };
  // …and when they switch tabs (the editor unmounts on the PDF tab).
  const handleSelectTab = (next: "email" | "pdf") => {
    if (tab === "email" && next !== "email") captureCurrent();
    setTab(next);
  };

  const markEdited = (vendorId: string) => {
    setEditedSet((prev) => {
      if (prev.has(vendorId)) return prev;
      const next = new Set(prev);
      next.add(vendorId);
      return next;
    });
  };

  const handleResetEmail = () => {
    if (!selectedVendorId) return;
    const vendor = preview?.vendors.find(
      (v) => v.vendorId === selectedVendorId,
    );
    if (!vendor || !editorRef.current) return;
    editorRef.current.innerHTML = vendor.htmlBody;
    seededFor.current = { vendorId: vendor.vendorId, html: vendor.htmlBody };
    setBodies((prev) => {
      const next = { ...prev };
      delete next[vendor.vendorId];
      return next;
    });
    setEditedSet((prev) => {
      if (!prev.has(vendor.vendorId)) return prev;
      const next = new Set(prev);
      next.delete(vendor.vendorId);
      return next;
    });
  };

  const handleConfirm = () => {
    captureCurrent();
    if (!preview) {
      onConfirm();
      return;
    }
    // Build a clean overrides map: only vendors the user actually
    // edited, only when their body differs from the default and is
    // non-empty. Falls back to the default per-vendor template
    // otherwise.
    const overrides: Record<string, string> = {};
    const live = editorRef.current?.innerHTML ?? "";
    for (const v of preview.vendors) {
      if (!editedSet.has(v.vendorId) && v.vendorId !== selectedVendorId)
        continue;
      const stored =
        v.vendorId === selectedVendorId ? live : bodies[v.vendorId];
      if (typeof stored !== "string") continue;
      const trimmed = stored.trim();
      if (trimmed.length === 0) continue;
      if (trimmed === v.htmlBody.trim()) continue;
      overrides[v.vendorId] = stored;
    }
    onConfirm(
      Object.keys(overrides).length > 0
        ? { emailHtmlBodies: overrides }
        : undefined,
    );
  };

  if (!open) return null;

  const selected =
    preview?.vendors.find((v) => v.vendorId === selectedVendorId) ?? null;

  const pdfUrl =
    selected && !selected.skipReason
      ? `/api/purchase/rfqs/${rfqId}/preview/pdf?vendorId=${encodeURIComponent(
          selected.vendorId,
        )}`
      : null;

  const pdfFileName = `${preview?.rfqNumber ?? "rfq"}.pdf`;

  const sendableCount =
    preview?.vendors.filter((v) => !v.skipReason).length ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={submitting ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Submit RFQ for Approval
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Preview what each vendor will receive. Emails are sent on
              final approval.
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

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* Vendor list sidebar */}
          <div className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/60">
            <div className="px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-gray-500 border-b border-gray-200">
              Recipients
              {preview && (
                <span className="ml-2 normal-case font-normal text-gray-400">
                  {sendableCount} / {preview.vendors.length}
                </span>
              )}
            </div>
            {loading && (
              <div className="flex items-center gap-2 px-4 py-6 text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading preview…
              </div>
            )}
            {loadError && (
              <div className="px-4 py-4 text-xs text-red-600">
                {loadError}
              </div>
            )}
            {preview?.vendors.length === 0 && (
              <div className="px-4 py-6 text-xs text-gray-500">
                No vendors on this RFQ.
              </div>
            )}
            <ul>
              {preview?.vendors.map((v) => {
                const active = v.vendorId === selectedVendorId;
                return (
                  <li key={v.vendorId}>
                    <button
                      type="button"
                      onClick={() => handleSelectVendor(v.vendorId)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-3 transition-colors ${
                        active ? "bg-white" : "hover:bg-white/60"
                      }`}
                    >
                      <div
                        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          v.skipReason
                            ? "bg-amber-50 text-amber-600"
                            : "bg-accent-50 text-accent-600"
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {v.vendorName}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {v.email ?? (
                            <span className="italic text-amber-600">
                              no email
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {v.itemCount} item{v.itemCount === 1 ? "" : "s"}
                          {v.skipReason && (
                            <span className="ml-1 text-amber-600">
                              • {v.skipReason}
                            </span>
                          )}
                          {editedSet.has(v.vendorId) && (
                            <span className="ml-1 text-orange-600">• edited</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Preview pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-200 shrink-0">
              <TabButton
                active={tab === "email"}
                onClick={() => handleSelectTab("email")}
                icon={<Mail className="w-3.5 h-3.5" />}
                label="Email"
              />
              <TabButton
                active={tab === "pdf"}
                onClick={() => handleSelectTab("pdf")}
                icon={<FileText className="w-3.5 h-3.5" />}
                label="PDF Attachment"
              />
            </div>

            <div className="flex-1 min-h-[600px] overflow-auto bg-gray-50">
              {!selected && !loading && (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  Select a vendor to preview
                </div>
              )}

              {selected && tab === "email" && (
                <div className="p-6">
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="uppercase tracking-wider text-gray-400 font-semibold w-16 shrink-0">
                          To
                        </span>
                        <span className="text-gray-800">
                          {selected.email ?? (
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
                          {selected.subject}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 text-xs mt-1.5">
                        <span className="uppercase tracking-wider text-gray-400 font-semibold w-16 shrink-0">
                          Attach
                        </span>
                        <span className="text-gray-700 flex items-center gap-2">
                          <span>
                            {pdfFileName} · {selected.itemCount} item
                            {selected.itemCount === 1 ? "" : "s"}
                          </span>
                          {pdfUrl && (
                            <a
                              href={pdfUrl}
                              download={pdfFileName}
                              className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-700 font-medium"
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-5 py-2 border-b border-gray-100 bg-white">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                        <Pencil className="w-3 h-3" />
                        Click the body below to edit before sending.
                      </span>
                      {editedSet.has(selected.vendorId) && (
                        <button
                          type="button"
                          onClick={handleResetEmail}
                          disabled={submitting}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-accent-600 disabled:opacity-40"
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
                      onInput={() => markEdited(selected.vendorId)}
                      spellCheck
                      className="px-6 py-5 text-sm text-gray-800 leading-relaxed min-h-[200px] focus:outline-none focus:bg-accent-50 focus:ring-1 focus:ring-inset focus:ring-accent-200"
                    />
                  </div>
                  {selected.skipReason && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                      This vendor would be skipped at send time —{" "}
                      <strong>{selected.skipReason}</strong>.
                    </div>
                  )}
                  {editedSet.has(selected.vendorId) && !selected.skipReason && (
                    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-800">
                      Your edits will be sent to this vendor instead of the
                      default email.
                    </div>
                  )}
                </div>
              )}

              {selected && tab === "pdf" && (
                <div className="h-full min-h-[600px] flex flex-col">
                  {pdfUrl ? (
                    <>
                      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
                        <span className="text-xs text-gray-600 truncate">
                          {pdfFileName}
                        </span>
                        <a
                          href={pdfUrl}
                          download={pdfFileName}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-md transition-colors"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download PDF
                        </a>
                      </div>
                      <iframe
                        key={pdfUrl}
                        src={pdfUrl}
                        className="w-full flex-1 min-h-[560px] border-0 bg-white"
                        title={`RFQ PDF — ${selected.vendorName}`}
                      />
                    </>
                  ) : (
                    <div className="h-full min-h-[600px] flex items-center justify-center p-6">
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        No PDF preview available — {selected.skipReason}.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="text-xs text-gray-500">
            {preview
              ? `${sendableCount} of ${preview.vendors.length} vendor${
                  preview.vendors.length === 1 ? "" : "s"
                } will receive this email on final approval.`
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
              {submitting ? "Sending…" : "Send Email"}
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
          ? "text-accent-600 border-accent-500 bg-white"
          : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
