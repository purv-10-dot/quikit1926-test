"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuotePdfPreviewModal } from "@/components/quotes/pdf-preview-modal";

type Tab = "pdf" | "portal" | "approval" | "collab" | "compare" | "cpq";

type UpcomingApproval = {
  id: string;
  status: string;
  triggerReason: string;
  requestedByName: string | null;
  requestedAt: string;
};

interface QuoteEnterprisePanelProps {
  quoteId: string;
  quoteNumber: string;
  canEdit: boolean;
  onOpenPdfPreview?: () => void;
}

export function QuoteEnterprisePanel({
  quoteId,
  quoteNumber,
  canEdit,
  onOpenPdfPreview,
}: QuoteEnterprisePanelProps) {
  const [tab, setTab] = useState<Tab>("pdf");
  const [pdfHistory, setPdfHistory] = useState<
    { id: string; fileName: string; createdAt: string; versionNumber: number }[]
  >([]);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [upcomingApproval, setUpcomingApproval] = useState<UpcomingApproval | null>(null);
  const [comments, setComments] = useState<
    { id: string; body: string; authorName: string | null; createdAt: string }[]
  >([]);
  const [commentBody, setCommentBody] = useState("");
  const [compareWith, setCompareWith] = useState("");
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    { productName: string; listPrice: number; reason: string }[]
  >([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPdfHistory = useCallback(async () => {
    const res = await fetch(`/api/quotes/${quoteId}/pdf/history`);
    const json = await res.json();
    if (json.success) setPdfHistory(json.data);
  }, [quoteId]);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/quotes/${quoteId}/comments`);
    const json = await res.json();
    if (json.success) setComments(json.data);
  }, [quoteId]);

  const loadUpcomingApproval = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes/approvals/inbox`);
      const json = await res.json();
      if (!json.success) return;
      const match = json.data?.find((a: any) => a.quoteId === quoteId) as
        | {
            id: string;
            status: string;
            triggerReason: string;
            requestedByName: string | null;
            requestedAt: string;
          }
        | undefined;
      setUpcomingApproval(match ? { ...match } : null);
    } catch {
      // If user doesn't have permission for inbox, just omit upcoming block.
      setUpcomingApproval(null);
    }
  }, [quoteId]);

  useEffect(() => {
    void loadPdfHistory();
    void loadComments();
    void loadUpcomingApproval();
  }, [loadPdfHistory, loadComments, loadUpcomingApproval]);

  const generatePdf = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pdf`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      void loadPdfHistory();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setBusy(false);
    }
  };

  const previewPdf = async () => {
    if (onOpenPdfPreview) return onOpenPdfPreview();
    setPreviewOpen(true);
  };

  const createPortal = async () => {
    const res = await fetch(`/api/quotes/${quoteId}/portal-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: 30 }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      setPortalUrl(json.data.url);
      await navigator.clipboard.writeText(json.data.url).catch(() => null);
    }
  };

  const requestApproval = async () => {
    const res = await fetch(`/api/quotes/${quoteId}/approval/request`, { method: "POST" });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      alert(`Approval requested: ${json.data.reasons.join("; ")}`);
      void loadUpcomingApproval();
    }
  };

  const postComment = async () => {
    if (!commentBody.trim()) return;
    const res = await fetch(`/api/quotes/${quoteId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      setCommentBody("");
      void loadComments();
    }
  };

  const runCompare = async () => {
    if (!compareWith) return;
    const res = await fetch(`/api/quotes/${quoteId}/compare?with=${compareWith}`);
    const json = await res.json();
    if (!json.success) alert(json.error);
    else setCompareResult(JSON.stringify(json.data, null, 2));
  };

  const loadCpq = async () => {
    const res = await fetch(`/api/quotes/${quoteId}/cpq-suggestions`);
    const json = await res.json();
    if (json.success) setSuggestions(json.data);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "pdf", label: "PDF" },
    { id: "portal", label: "Portal" },
    { id: "approval", label: "Approval" },
    { id: "collab", label: "Team" },
    { id: "compare", label: "Compare" },
    { id: "cpq", label: "CPQ" },
  ];

  return (
    <div className="rounded-lg border border-crm-border bg-white">
      <div className="flex flex-wrap gap-1 border-b border-crm-border p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === t.id
                ? "bg-accent-100 text-accent-700"
                : "text-crm-muted hover:bg-crm-bg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 text-sm">
        {tab === "pdf" && (
          <div className="space-y-3">
            <p className="text-crm-muted">
              Server-branded document for {quoteNumber}. Preview before send; each generate
              creates a locked snapshot.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void previewPdf()} disabled={busy}>
                Preview
              </Button>
              <Button
                size="sm"
                onClick={() => void generatePdf()}
                disabled={busy}
                title="Lock a server-side PDF snapshot for this quote version (used for preview/print + stable download)."
              >
                Generate snapshot
              </Button>
            </div>
            {pdfHistory.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-crm-muted">
                {pdfHistory.map((h) => (
                  <li key={h.id}>
                    v{h.versionNumber} · {h.fileName} · {new Date(h.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "portal" && (
          <div className="space-y-3">
            <p className="text-crm-muted">
              Customer portal: view, accept, reject, sign, and download.
            </p>
            {canEdit && (
              <Button size="sm" onClick={() => void createPortal()}>
                Create portal link
              </Button>
            )}
            {portalUrl && (
              <p className="break-all rounded bg-crm-bg p-2 text-xs">{portalUrl}</p>
            )}
          </div>
        )}

        {tab === "approval" && (
          <div className="space-y-3">
            {upcomingApproval ? (
              <div className="space-y-1 rounded-lg border border-crm-border bg-crm-bg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-700">
                  Upcoming approval
                </p>
                <p className="text-sm font-medium">Pending manager decision</p>
                <p className="text-xs text-crm-muted">
                  Requested by {upcomingApproval.requestedByName ?? "Manager"} ·{" "}
                  {new Date(upcomingApproval.requestedAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-xs">{upcomingApproval.triggerReason}</p>
              </div>
            ) : (
              <>
                <p className="text-crm-muted">
                  Request manager approval when discount or deal size exceeds policy.
                </p>
                {canEdit && (
                  <Button size="sm" onClick={() => void requestApproval()}>
                    Request approval
                  </Button>
                )}
              </>
            )}
            <a href="/quotes" className="block text-xs text-accent-600 hover:underline">
              View approval inbox on quotes list
            </a>
          </div>
        )}

        {tab === "collab" && (
          <div className="space-y-3">
            {upcomingApproval && (
              <div className="space-y-1 rounded-lg border border-crm-border bg-crm-bg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-700">
                  Upcoming approval
                </p>
                <p className="text-xs text-crm-muted">
                  Requested by {upcomingApproval.requestedByName ?? "Manager"} ·{" "}
                  {new Date(upcomingApproval.requestedAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-xs">{upcomingApproval.triggerReason}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="@mention in comment — e.g. @Rahul review pricing"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <Button size="sm" onClick={() => void postComment()}>
                Post
              </Button>
            </div>
            <ul className="max-h-40 space-y-2 overflow-y-auto">
              {comments.map((c) => (
                <li key={c.id} className="rounded bg-crm-bg p-2 text-xs">
                  <span className="font-medium">{c.authorName ?? "Team"}</span> ·{" "}
                  {new Date(c.createdAt).toLocaleString()}
                  <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "compare" && (
          <div className="space-y-2">
            <Input
              placeholder="Other quote ID to compare"
              value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={() => void runCompare()}>
              Compare versions
            </Button>
            {compareResult && (
              <pre className="max-h-48 overflow-auto rounded bg-crm-bg p-2 text-[10px]">
                {compareResult}
              </pre>
            )}
          </div>
        )}

        {tab === "cpq" && (
          <div className="space-y-2">
            <Button size="sm" variant="secondary" onClick={() => void loadCpq()}>
              Load upsell suggestions
            </Button>
            {suggestions.length === 0 ? (
              <p className="text-xs text-crm-muted">No suggestions — configure CPQ rules in settings.</p>
            ) : (
              <ul className="space-y-1">
                {suggestions.map((s, i) => (
                  <li key={i} className="rounded border border-crm-border px-2 py-1 text-xs">
                    {s.productName} · ₹{s.listPrice.toLocaleString("en-IN")} — {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <QuotePdfPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        quoteId={quoteId}
        quoteNumber={quoteNumber}
        canEdit={canEdit}
      />
    </div>
  );
}
