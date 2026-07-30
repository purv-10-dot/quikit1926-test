"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, XCircle } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface Offer {
  companyName: string;
  candidateName: string;
  jobTitle: string;
  designation: string;
  offeredCTC: number | null;
  joiningDate: string | null;
  expiresAt: string | null;
  expired: boolean;
  status: string;
  decided: boolean;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const fmtMoney = (n: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

export default function OfferResponsePortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"accept" | "decline" | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch(withBasePath(`/api/v1/hrms/recruit/offer-response/${token}`))
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setOffer(res.data);
          if (res.data.status === "OfferAccepted") setResult("accept");
          if (res.data.status === "OfferDeclined") setResult("decline");
        } else setLoadErr(res.error?.message ?? "Invalid link");
      })
      .catch(() => setLoadErr("Could not load the offer. Please try again."));
  }, [token]);

  const respond = async (action: "accept" | "decline") => {
    setBusy(true);
    try {
      const r = await fetch(withBasePath(`/api/v1/hrms/recruit/offer-response/${token}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "decline" ? reason : undefined }),
      });
      const res = await r.json();
      if (res.success) setResult(action);
      else alert(res.error?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8 max-w-md w-full">{children}</div>
    </div>
  );

  if (loadErr) {
    return <Shell><div className="text-center"><AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" /><h1 className="text-lg font-bold text-gray-900 mb-1">Link unavailable</h1><p className="text-sm text-gray-500">{loadErr}</p></div></Shell>;
  }
  if (!offer) {
    return <Shell><div className="text-center py-6"><Loader2 size={30} className="text-green-600 mx-auto animate-spin" /><p className="text-sm text-gray-500 mt-3">Loading your offer…</p></div></Shell>;
  }

  if (result) {
    const accepted = result === "accept";
    return (
      <Shell>
        <div className="text-center">
          {accepted ? <CheckCircle2 size={44} className="text-green-600 mx-auto mb-3" /> : <XCircle size={44} className="text-gray-400 mx-auto mb-3" />}
          <h1 className="text-lg font-bold text-gray-900 mb-1">{accepted ? "Offer accepted 🎉" : "Offer declined"}</h1>
          <p className="text-sm text-gray-500">
            {accepted
              ? `Thank you, ${offer.candidateName.split(" ")[0]}! ${offer.companyName}'s HR team will reach out with your onboarding details.`
              : `Thanks for letting us know. We've informed ${offer.companyName}'s HR team.`}
          </p>
        </div>
      </Shell>
    );
  }

  const locked = offer.decided || offer.expired || offer.status !== "OfferSent";

  return (
    <Shell>
      <div className="text-center mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-green-700">{offer.companyName}</div>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Your Offer of Employment</h1>
        <p className="text-sm text-gray-500 mt-1">Hi {offer.candidateName}, please review and respond below.</p>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm mb-5">
        <Row k="Position" v={offer.jobTitle || offer.designation || "—"} />
        {offer.designation && offer.designation !== offer.jobTitle && <Row k="Designation" v={offer.designation} />}
        <Row k="Annual CTC" v={fmtMoney(offer.offeredCTC)} />
        <Row k="Joining Date" v={fmtDate(offer.joiningDate)} />
        {offer.expiresAt && <Row k="Respond By" v={fmtDate(offer.expiresAt)} />}
      </div>

      {offer.expired ? (
        <p className="text-center text-sm text-amber-600 font-medium">This offer has expired. Please contact HR.</p>
      ) : showDecline ? (
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reason for declining (optional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" placeholder="Let us know why…" />
          <div className="flex gap-2 mt-3">
            <button onClick={() => setShowDecline(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Back</button>
            <button onClick={() => respond("decline")} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60">Confirm Decline</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setShowDecline(true)} disabled={busy || locked} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Decline</button>
          <button onClick={() => respond("accept")} disabled={busy || locked} className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60 inline-flex items-center justify-center gap-1.5">
            {busy && <Loader2 size={15} className="animate-spin" />} Accept Offer
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-gray-400 mt-4">This is a secure, private link meant only for you.</p>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-gray-500">{k}</span>
      <span className="font-semibold text-gray-900">{v}</span>
    </div>
  );
}
