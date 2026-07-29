"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, Upload, FileCheck2 } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface Detail {
  companyName: string;
  candidateName: string;
  title: string;
  documents: string[];
  uploaded: Record<string, { fileName: string; uploadedAt: string; review: string; rejectReason: string | null }>;
  completed: boolean;
}

export default function DocUploadPortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = () =>
    fetch(withBasePath(`/api/v1/hrms/onboarding/doc-upload/${token}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) setDetail(res.data); else setLoadErr(res.error?.message ?? "Invalid link"); })
      .catch(() => setLoadErr("Could not load the page. Please try again."));

  useEffect(() => { refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (docName: string, file: File) => {
    setBusyDoc(docName);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docName", docName);
      const r = await fetch(withBasePath(`/api/v1/hrms/onboarding/doc-upload/${token}`), { method: "POST", body: fd });
      const res = await r.json();
      if (res.success) await refresh();
      else alert(res.error?.message ?? "Upload failed.");
    } finally {
      setBusyDoc(null);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6 sm:p-8 max-w-lg w-full">{children}</div>
    </div>
  );

  if (loadErr) return <Shell><div className="text-center"><AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" /><h1 className="text-lg font-bold text-gray-900 mb-1">Link unavailable</h1><p className="text-sm text-gray-500">{loadErr}</p></div></Shell>;
  if (!detail) return <Shell><div className="text-center py-6"><Loader2 size={30} className="text-green-600 mx-auto animate-spin" /><p className="text-sm text-gray-500 mt-3">Loading…</p></div></Shell>;

  const allDone = detail.completed;

  return (
    <Shell>
      <div className="text-center mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-green-700">{detail.companyName}</div>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Upload your documents</h1>
        <p className="text-sm text-gray-500 mt-1">Hi {detail.candidateName || "there"}, please upload each document below.</p>
      </div>

      {allDone && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 text-green-700 ring-1 ring-green-200 px-4 py-3 text-sm font-semibold">
          <CheckCircle2 size={18} /> All documents approved — thank you!
        </div>
      )}

      <div className="space-y-3">
        {detail.documents.map((doc) => {
          const up = detail.uploaded[doc];
          const busy = busyDoc === doc;
          const review = up?.review ?? "missing";
          const badge = review === "approved" ? { c: "bg-green-100 text-green-700", t: "Approved" }
            : review === "rejected" ? { c: "bg-red-100 text-red-700", t: "Rejected" }
            : review === "pending" ? { c: "bg-amber-100 text-amber-700", t: "Pending review" }
            : null;
          return (
            <div key={doc} className={`rounded-xl border p-3 ${review === "rejected" ? "border-red-200" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${review === "approved" ? "bg-green-50 text-green-600" : up ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-400"}`}>
                  {up ? <FileCheck2 size={18} /> : <Upload size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-gray-900 truncate">{doc}</div>
                  <div className="text-[11.5px] text-gray-400 truncate">{up ? `Uploaded: ${up.fileName}` : "PDF, JPG or PNG · max 10MB"}</div>
                </div>
                {badge && <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.c}`}>{badge.t}</span>}
                <input ref={(el) => { fileInputs.current[doc] = el; }} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(doc, f); e.currentTarget.value = ""; }} />
                {review !== "approved" && (
                  <button onClick={() => fileInputs.current[doc]?.click()} disabled={busy}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-gray-200 hover:bg-gray-50 disabled:opacity-60">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {up ? "Replace" : "Upload"}
                  </button>
                )}
              </div>
              {review === "rejected" && up?.rejectReason && (
                <div className="mt-2 text-[11.5px] text-red-600">Rejected: {up.rejectReason} — please re-upload.</div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-gray-400 mt-5">This is a secure, private link meant only for you.</p>
    </Shell>
  );
}
