"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowLeft, Download, Printer, Send, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-1/3 animate-pulse rounded bg-crm-bg" />
      <div className="h-[70vh] w-full animate-pulse rounded-lg border border-crm-border bg-crm-bg" />
    </div>
  );
}

function downloadBlob(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function QuotePdfPreviewModal({
  open,
  onClose,
  quoteId,
  quoteNumber,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  quoteNumber: string;
  canEdit: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>(`${quoteNumber}.pdf`);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [sending, setSending] = useState(false);

  // Minimal send modal state (reuses /api/quotes/:id/send).
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Quotation ${quoteNumber}`);
  const [message, setMessage] = useState(
    "Hi,\n\nPlease find the quotation PDF attached. Let me know if you have any questions.\n\nBest regards,",
  );

  const pdfUrl = useMemo(() => `/api/quotes/${quoteId}/pdf`, [quoteId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error("Failed to load PDF");
        const disposition = res.headers.get("content-disposition") ?? "";
        const match = disposition.match(/filename="([^"]+)"/u);
        if (match?.[1]) setFileName(match[1]);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Failed to load PDF");
        onClose();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pdfUrl]);

  async function generateSnapshot() {
    if (!canEdit) return;
    const res = await fetch(`/api/quotes/${quoteId}/pdf`, { method: "POST" });
    const json = await res.json();
    if (!json.success) return alert(json.error ?? "Snapshot failed");
    const url = json.data?.downloadUrl as string | null | undefined;
    alert(url ? `Snapshot generated. Download: ${url}` : "Snapshot generated");
  }

  function handlePrint() {
    // Explicit action only (no auto trigger).
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  function splitAddresses(s: string): string[] {
    return s
      .split(/[,;\n]/u)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function sendEmail() {
    const payload = {
      to: splitAddresses(to),
      cc: cc.trim() ? splitAddresses(cc) : undefined,
      subject: subject.trim(),
      body: `${message}\n`,
    };
    const res = await fetch(`/api/quotes/${quoteId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) return alert(json.error ?? "Send failed");
    setSending(false);
    alert("Email sent");
  }

  const toolbar = (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-crm-border bg-white px-3 py-2">
      <button
        type="button"
        onClick={onClose}
        className="crm-btn-ghost inline-flex items-center gap-2"
        aria-label="Back"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-crm-text">Quote PDF Preview</div>
        <div className="truncate text-xs text-crm-muted">{fileName}</div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => objectUrl && downloadBlob(objectUrl, fileName)}
        disabled={!objectUrl || loading}
      >
        <Download size={14} /> Download PDF
      </Button>
      <Button size="sm" variant="secondary" onClick={handlePrint} disabled={!objectUrl || loading}>
        <Printer size={14} /> Print
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setSending(true)}>
        <Send size={14} /> Send Email
      </Button>
      <Button
        size="sm"
        onClick={() => void generateSnapshot()}
        disabled={!canEdit || loading}
        title={!canEdit ? "Edit permission required" : "Generate a locked PDF snapshot"}
      >
        <Camera size={14} /> Snapshot
      </Button>
      <button
        type="button"
        onClick={onClose}
        className="crm-btn-ghost h-8 w-8 p-0"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );

  return (
    <>
      {/* Fullscreen overlay (not the small Modal) */}
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-white"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          tabIndex={-1}
        >
          {toolbar}
          <div className="h-[calc(100vh-52px)] overflow-hidden p-3">
            {loading || !objectUrl ? (
              <Skeleton />
            ) : (
              <iframe
                ref={iframeRef}
                title="Quote PDF"
                src={objectUrl}
                className="h-full w-full rounded-lg border border-crm-border bg-white"
              />
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={sending}
        onClose={() => setSending(false)}
        title="Send quote"
        width="max-w-2xl"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">
              To <span className="text-red-500">*</span>
            </span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Cc</span>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">
              Subject <span className="text-red-500">*</span>
            </span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Message</span>
            <textarea
              className="crm-input min-h-[160px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={20000}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
          <Button onClick={() => void sendEmail()} disabled={!to.trim() || !subject.trim()}>
            Send
          </Button>
          <Button variant="secondary" onClick={() => setSending(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}

