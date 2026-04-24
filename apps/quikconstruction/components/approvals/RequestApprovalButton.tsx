"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle, XCircle, Clock } from "lucide-react";

interface Props {
  docType: "pr" | "po" | "rab" | "vendor_bill" | "payroll" | "other";
  docId: string;
  docRef: string;
  amount?: number | null;
}

interface ApprovalReq {
  id: string; status: "pending" | "approved" | "rejected";
  approverId: string; decisionAt: string | null; comment: string | null;
}

/**
 * Embeddable approval request widget. Shows current request status if one
 * exists, otherwise lets the user file a new request by typing an approver
 * user id. MVP — assumes the caller knows approver id; a user-picker is an
 * easy later upgrade.
 */
export function RequestApprovalButton({ docType, docId, docRef, amount }: Props) {
  const [req, setReq] = useState<ApprovalReq | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [approverId, setApproverId] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/approvals/requests`).then(r => r.json()).then(j => {
      if (j.success) {
        const match = (j.data as Array<ApprovalReq & { docType: string; docId: string }>)
          .filter(r => r.docType === docType && r.docId === docId)
          .sort((a, b) => (b.decisionAt ?? "").localeCompare(a.decisionAt ?? ""))[0] ?? null;
        setReq(match);
      }
      setLoading(false);
    });
  }, [docType, docId]);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body = { docType, docId, docRef, amount: amount ?? null, approverId };
      const r = await fetch("/api/approvals/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Request failed");
      setReq(j.data); setShowForm(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }

  if (loading) return null;

  if (req?.status === "approved") {
    return (
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
        <CheckCircle className="h-3 w-3" /> Approved
      </div>
    );
  }
  if (req?.status === "rejected") {
    return (
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
        <XCircle className="h-3 w-3" /> Rejected{req.comment ? `: ${req.comment}` : ""}
      </div>
    );
  }
  if (req?.status === "pending") {
    return (
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        <Clock className="h-3 w-3" /> Awaiting approval
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="text-[11px] inline-flex items-center gap-1 text-accent-700 bg-accent-50 border border-accent-200 rounded px-2 py-1 hover:bg-accent-100">
          <ShieldCheck className="h-3 w-3" /> Request Approval
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="approver user id" className="text-xs border border-gray-300 rounded px-2 py-1" />
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="comment" className="text-xs border border-gray-300 rounded px-2 py-1" />
          <button onClick={submit} disabled={busy || !approverId} className="text-xs bg-accent-600 text-white px-2 py-1 rounded disabled:opacity-50">{busy ? "…" : "Submit"}</button>
          <button onClick={() => setShowForm(false)} className="text-xs text-gray-500 px-1">Cancel</button>
        </div>
      )}
      {err && <div className="text-[11px] text-red-700">{err}</div>}
    </div>
  );
}
