"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PortalQuote {
  quoteNumber: string;
  versionNumber: number;
  status: string;
  engagementStatus: string;
  effectiveTo: string | null;
  grandTotal: number;
  grandTotalInWords: string | null;
  termsText: string | null;
  companyName: string;
  accountName: string | null;
  lines: {
    lineNumber: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  acceptedAt: string | null;
  rejectedAt: string | null;
  signedAt: string | null;
}

export default function PortalQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PortalQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [signerName, setSignerName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/portal/quotes/${token}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load");
      setQuote(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    const res = await fetch(`/api/public/portal/quotes/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error ?? "Accept failed");
    else void load();
  };

  const reject = async () => {
    if (!rejectReason.trim()) return alert("Please provide a reason");
    const res = await fetch(`/api/public/portal/quotes/${token}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error ?? "Reject failed");
    else void load();
  };

  const sign = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !signerName.trim()) return alert("Name and signature required");
    const dataUrl = canvas.toDataURL("image/png");
    const res = await fetch(`/api/public/portal/quotes/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatureDataUrl: dataUrl,
        signerName,
        otpVerified: false,
      }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error ?? "Sign failed");
    else void load();
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-crm-bg">
        <p className="text-crm-muted">Loading quotation…</p>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-crm-bg p-6">
        <p className="text-red-600">{error ?? "Quote unavailable"}</p>
      </div>
    );
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-crm-bg px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-xl border border-crm-border bg-crm-panel p-6 shadow-sm">
        <div className="mb-6 border-b border-crm-border pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-600">
            {quote.companyName}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-crm-text">
            Quotation {quote.quoteNumber}
          </h1>
          <p className="text-sm text-crm-muted">
            For {quote.accountName ?? "your organization"} · v{quote.versionNumber}
          </p>
        </div>

        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b border-crm-border bg-accent-50 text-left text-xs uppercase text-accent-700">
              <th className="p-2">#</th>
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => (
              <tr key={l.lineNumber} className="border-b border-crm-border/60">
                <td className="p-2">{l.lineNumber}</td>
                <td className="p-2">{l.productName}</td>
                <td className="p-2 text-right">{l.quantity}</td>
                <td className="p-2 text-right">{fmt(l.unitPrice)}</td>
                <td className="p-2 text-right font-medium">{fmt(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-6 text-right">
          <div className="text-lg font-bold text-crm-text">₹ {fmt(quote.grandTotal)}</div>
          {quote.grandTotalInWords && (
            <p className="text-xs text-crm-muted">{quote.grandTotalInWords}</p>
          )}
        </div>

        {quote.termsText && (
          <div className="mb-6 rounded-lg bg-crm-bg p-4 text-sm text-crm-muted">
            <p className="mb-1 font-semibold text-crm-text">Terms</p>
            <p className="whitespace-pre-wrap">{quote.termsText}</p>
          </div>
        )}

        {quote.acceptedAt ? (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Accepted on {new Date(quote.acceptedAt).toLocaleString()}
          </p>
        ) : quote.rejectedAt ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            Rejected on {new Date(quote.rejectedAt).toLocaleString()}
          </p>
        ) : (
          <div className="space-y-4">
            <Input
              placeholder="Optional comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void accept()}>
                Accept quote
              </Button>
              <Button type="button" variant="secondary" onClick={() => void reject()}>
                Reject
              </Button>
            </div>
            <Input
              placeholder="Rejection reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="rounded-lg border border-crm-border p-4">
              <p className="mb-2 text-sm font-semibold">E-signature</p>
              <Input
                placeholder="Your full name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mb-2"
              />
              <canvas
                ref={canvasRef}
                width={400}
                height={120}
                className="w-full cursor-crosshair rounded border border-dashed border-crm-border bg-white"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
              />
              <Button type="button" className="mt-2" variant="outline" onClick={() => void sign()}>
                Sign quotation
              </Button>
            </div>
          </div>
        )}

        {quote.signedAt && (
          <p className="mt-4 text-sm text-crm-muted">
            Signed on {new Date(quote.signedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
