"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, BookOpen, Eye } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface FileItem { url: string; key: string | null; fileName: string; acknowledgedAt: string | null }
interface Detail {
  companyName: string;
  candidateName: string;
  title: string;
  files: FileItem[];
  completed: boolean;
}

export default function PolicyAckPortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    fetch(withBasePath(`/api/v1/hrms/onboarding/policy-ack/${token}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) setDetail(res.data); else setLoadErr(res.error?.message ?? "Invalid link"); })
      .catch(() => setLoadErr("Could not load the page. Please try again."));

  useEffect(() => { refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledge = async (url: string) => {
    setBusy(url);
    try {
      const r = await fetch(withBasePath(`/api/v1/hrms/onboarding/policy-ack/${token}`), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const res = await r.json();
      if (res.success) await refresh();
      else alert(res.error?.message ?? "Could not acknowledge.");
    } finally {
      setBusy(null);
    }
  };

  const rawHref = (f: FileItem) =>
    withBasePath(`/api/v1/hrms/onboarding/policy-ack/${token}?raw=${encodeURIComponent(f.key ?? "")}`);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6 sm:p-8 max-w-lg w-full">{children}</div>
    </div>
  );

  if (loadErr) return <Shell><div className="text-center"><AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" /><h1 className="text-lg font-bold text-gray-900 mb-1">Link unavailable</h1><p className="text-sm text-gray-500">{loadErr}</p></div></Shell>;
  if (!detail) return <Shell><div className="text-center py-6"><Loader2 size={30} className="text-green-600 mx-auto animate-spin" /><p className="text-sm text-gray-500 mt-3">Loading…</p></div></Shell>;

  const allDone = detail.completed || (detail.files.length > 0 && detail.files.every((f) => f.acknowledgedAt));

  return (
    <Shell>
      <div className="text-center mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-green-700">{detail.companyName}</div>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Review &amp; acknowledge</h1>
        <p className="text-sm text-gray-500 mt-1">Hi {detail.candidateName || "there"}, please open each document and confirm you have read it.</p>
      </div>

      {allDone && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 text-green-700 ring-1 ring-green-200 px-4 py-3 text-sm font-semibold">
          <CheckCircle2 size={18} /> All acknowledged — thank you!
        </div>
      )}

      <div className="space-y-3">
        {detail.files.map((f) => {
          const done = !!f.acknowledgedAt;
          const isBusy = busy === f.url;
          return (
            <div key={f.url} className={`rounded-xl border p-3 ${done ? "border-green-200" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${done ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <BookOpen size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-gray-900 truncate">{f.fileName}</div>
                  <div className="text-[11.5px] text-gray-400 truncate">
                    {done ? `Acknowledged on ${new Date(f.acknowledgedAt!).toLocaleDateString("en-IN")}` : "Please open and read"}
                  </div>
                </div>
                <a href={rawHref(f)} target="_blank" rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-gray-200 hover:bg-gray-50">
                  <Eye size={14} /> View
                </a>
                {done ? (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Acknowledged</span>
                ) : (
                  <button onClick={() => acknowledge(f.url)} disabled={isBusy}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    I Acknowledge
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-gray-400 mt-5">This is a secure, private link meant only for you.</p>
    </Shell>
  );
}
