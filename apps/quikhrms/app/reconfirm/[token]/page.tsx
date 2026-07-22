"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Briefcase } from "lucide-react";
import { clsx } from "clsx";

type State = "pending" | "confirmed" | "withdrawn" | "closed";

interface Detail {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  state: State;
}

export default function ReconfirmPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [submitting, setSubmitting] = useState<"yes" | "no" | null>(null);
  const [intent, setIntent] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    if (a === "yes" || a === "no") setIntent(a);
    (async () => {
      try {
        const r = await fetch(`/api/v1/hrms/recruit/reconfirm/${token}`);
        const j = await r.json();
        if (!j.success) { setLoadErr(j.error?.message ?? "This link is invalid or has expired."); return; }
        setDetail(j.data);
        setState(j.data.state);
      } catch {
        setLoadErr("Something went wrong. Please try again later.");
      }
    })();
  }, [token]);

  const answer = async (a: "yes" | "no") => {
    setSubmitting(a);
    try {
      const r = await fetch(`/api/v1/hrms/recruit/reconfirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: a }),
      });
      const j = await r.json();
      if (j.success) setState(j.data.state);
      else setLoadErr(j.error?.message ?? "Something went wrong.");
    } catch {
      setLoadErr("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        {/* header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Briefcase size={16} /> {detail?.companyName ?? "Recruitment"}
          </div>
        </div>

        <div className="p-6">
          {loadErr ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-slate-700">{loadErr}</p>
            </div>
          ) : !detail || !state ? (
            <div className="text-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : state === "confirmed" ? (
            <Result icon={<CheckCircle2 className="w-12 h-12 text-green-600" />}
              title="You're confirmed — thank you!"
              body={`Great to have you on board for the ${detail.jobTitle} process. Our team will be in touch with the next steps shortly.`} />
          ) : state === "withdrawn" ? (
            <Result icon={<XCircle className="w-12 h-12 text-slate-400" />}
              title="No problem — you've been withdrawn"
              body={`We've closed your application for ${detail.jobTitle}. Thank you for your time, and we wish you all the best. You're welcome to apply again in the future.`} />
          ) : state === "closed" ? (
            <Result icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
              title="This link is no longer active"
              body="Your application is no longer awaiting a response. If you think this is a mistake, please contact the recruiter." />
          ) : (
            /* pending */
            <div>
              <p className="text-sm text-slate-600">Hello <strong className="text-slate-900">{detail.candidateName}</strong>,</p>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                The <strong className="text-slate-900">{detail.jobTitle}</strong> role at {detail.companyName} is active again.
                Are you still interested and available to continue?
              </p>

              <div className="mt-6 space-y-2.5">
                <button
                  onClick={() => answer("yes")}
                  disabled={!!submitting}
                  className={clsx(
                    "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60",
                    "bg-green-600 hover:bg-green-700",
                    intent === "yes" && "ring-2 ring-green-300 ring-offset-2",
                  )}
                >
                  {submitting === "yes" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Yes, I'm still interested
                </button>
                <button
                  onClick={() => answer("no")}
                  disabled={!!submitting}
                  className={clsx(
                    "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-60",
                    "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
                    intent === "no" && "ring-2 ring-slate-300 ring-offset-2",
                  )}
                >
                  {submitting === "no" ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  No, please withdraw me
                </button>
              </div>

              <p className="mt-4 text-[11px] text-slate-400 text-center">
                We won't move your application forward until you confirm above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-center py-4">
      <div className="mx-auto mb-4 flex items-center justify-center">{icon}</div>
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
