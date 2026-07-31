"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface Detail {
  companyName: string;
  assigneeName: string;
  newHireName: string;
  taskTitle: string;
  completed: boolean;
}

export default function TaskDonePortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const refresh = () =>
    fetch(withBasePath(`/api/v1/hrms/onboarding/task-done/${token}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) { setDetail(res.data); if (res.data.completed) setDone(true); } else setLoadErr(res.error?.message ?? "Invalid link"); })
      .catch(() => setLoadErr("Could not load the page. Please try again."));

  useEffect(() => { refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const markDone = async () => {
    setBusy(true);
    try {
      const r = await fetch(withBasePath(`/api/v1/hrms/onboarding/task-done/${token}`), { method: "POST" });
      const res = await r.json();
      if (res.success) setDone(true);
      else alert(res.error?.message ?? "Could not complete.");
    } finally {
      setBusy(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6 sm:p-8 max-w-md w-full text-center">{children}</div>
    </div>
  );

  if (loadErr) return <Shell><AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" /><h1 className="text-lg font-bold text-gray-900 mb-1">Link unavailable</h1><p className="text-sm text-gray-500">{loadErr}</p></Shell>;
  if (!detail) return <Shell><Loader2 size={30} className="text-green-600 mx-auto animate-spin" /><p className="text-sm text-gray-500 mt-3">Loading…</p></Shell>;

  return (
    <Shell>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-green-700">{detail.companyName}</div>
      {done ? (
        <>
          <CheckCircle2 size={44} className="text-green-600 mx-auto my-4" />
          <h1 className="text-xl font-bold text-gray-900">Marked as done</h1>
          <p className="text-sm text-gray-500 mt-1">Thanks{detail.assigneeName ? `, ${detail.assigneeName.split(" ")[0]}` : ""}! This task is now complete.</p>
          <div className="mt-4 rounded-xl bg-gray-50 ring-1 ring-gray-200 px-4 py-3 text-left">
            <div className="text-[13.5px] font-semibold text-gray-900">{detail.taskTitle}</div>
            <div className="text-[11.5px] text-gray-400">For {detail.newHireName}</div>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900 mt-2">Complete this task?</h1>
          <p className="text-sm text-gray-500 mt-1">For {detail.newHireName}</p>
          <div className="mt-4 rounded-xl bg-gray-50 ring-1 ring-gray-200 px-4 py-3 text-left">
            <div className="text-[13.5px] font-semibold text-gray-900">{detail.taskTitle}</div>
          </div>
          <button onClick={markDone} disabled={busy}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Mark as done
          </button>
        </>
      )}
      <p className="text-[11px] text-gray-400 mt-5">This is a secure, private link meant only for you.</p>
    </Shell>
  );
}
