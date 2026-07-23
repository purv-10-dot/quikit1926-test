"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { EXIT_INTERVIEW_QUESTIONS } from "@/lib/data/exit-interview";
import { withBasePath } from "@/lib/utils/base-path";

interface Detail {
  companyName: string;
  employeeName: string;
  titleDepartment: string;
  startDate: string | null;
  separationDate: string | null;
  alreadySubmitted: boolean;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function ExitInterviewPortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(withBasePath(`/api/v1/hrms/offboarding/exit-interview/${token}`))
      .then((r) => r.json())
      .then((res) => {
        if (res.success) { setDetail(res.data); if (res.data.alreadySubmitted) setDone(true); }
        else setLoadErr(res.error?.message ?? "Invalid link");
      })
      .catch(() => setLoadErr("Could not load the form. Please try again."));
  }, [token]);

  const submit = async () => {
    if (!form.reasonForLeaving?.trim()) { alert("Please answer why you are leaving."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(withBasePath(`/api/v1/hrms/offboarding/exit-interview/${token}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, signatureName }),
      });
      const res = await r.json();
      if (res.success) setDone(true);
      else alert(res.error?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadErr) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8 max-w-md text-center">
          <AlertTriangle className="mx-auto text-amber-500 mb-3" size={32} />
          <h1 className="text-lg font-semibold text-gray-900">Link unavailable</h1>
          <p className="text-sm text-gray-500 mt-1">{loadErr}</p>
        </div>
      </div>
    );
  }
  if (!detail) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="animate-spin text-green-600" size={28} /></div>;
  }
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8 max-w-md text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={36} />
          <h1 className="text-lg font-semibold text-gray-900">Thank you</h1>
          <p className="text-sm text-gray-500 mt-1">Your exit interview has been submitted to the {detail.companyName} HR team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-5">
          <h1 className="text-xl font-bold text-gray-900">Employee Exit Interview</h1>
          <p className="text-sm text-gray-500">{detail.companyName}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Employee information</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Info label="Employee Name" value={detail.employeeName} />
            <Info label="Title / Department" value={detail.titleDepartment || "—"} />
            <Info label="Start Date" value={fmtDate(detail.startDate)} />
            <Info label="Separation Date" value={fmtDate(detail.separationDate)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Exit interview questionnaire</h2>
          {EXIT_INTERVIEW_QUESTIONS.map((q) => (
            <div key={q.key}>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">{q.label}</label>
              {q.type === "yesno" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    {["Yes", "No"].map((opt) => (
                      <label key={opt} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <input type="radio" name={q.key} checked={form[q.key] === opt}
                          onChange={() => setForm((f) => ({ ...f, [q.key]: opt }))} className="accent-green-600" />
                        {opt}
                      </label>
                    ))}
                  </div>
                  {q.explainKey && (
                    <textarea rows={2} placeholder="If not, please explain…"
                      value={form[q.explainKey] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [q.explainKey!]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                  )}
                </div>
              ) : (
                <textarea rows={3} value={form[q.key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [q.key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Signature (type your full name)</label>
            <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Full name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={submit} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={clsx("text-[10px] font-semibold uppercase tracking-wide text-gray-400")}>{label}</p>
      <p className="text-gray-800">{value}</p>
    </div>
  );
}
