"use client";

import { useEffect, useState } from "react";
import { Star, CheckCircle2, AlertTriangle, ExternalLink, Phone, Mail, Briefcase, Loader2, Clock } from "lucide-react";
import { clsx } from "clsx";

interface Detail {
  alreadySubmitted: boolean;
  /** Interview hasn't started yet — the scorecard stays locked until then. */
  notYetOpen?: boolean;
  companyName: string;
  interview: {
    id: string;
    round: number;
    roundName: string;
    type: string;
    scheduledAt: string;
    duration: number;
    interviewer: { name: string; code: string };
    candidate: {
      name: string; email: string; phone: string | null;
      resumeUrl: string | null; currentCompany: string | null;
      currentDesignation: string | null; totalExperience: number | null;
    };
    requisition: { id: string; title: string };
  };
}

const RECOMMENDATIONS = [
  { value: "StrongHire",   label: "Strong Hire",   desc: "Top-tier candidate", color: "emerald" },
  { value: "Hire",         label: "Hire",          desc: "Good fit — move forward", color: "emerald" },
  { value: "MaybeHire",    label: "On Hold",       desc: "Need more info", color: "amber" },
  { value: "NoHire",       label: "Reject",        desc: "Not a fit", color: "red" },
  { value: "StrongNoHire", label: "Strong Reject", desc: "Definitely not", color: "red" },
];

export default function InterviewFeedbackPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    overallRating: 0,
    recommendation: "",
    strengths: "",
    concerns: "",
    overallComments: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/v1/hrms/recruit/interview-feedback/${token}`);
        const j = await r.json();
        if (cancelled) return;
        if (!j.success) setLoadErr(j.error?.message ?? "Failed to load");
        else setDetail(j.data);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Network error");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr(null);
    if (!form.overallRating) return setSubmitErr("Please provide an overall rating");
    if (!form.recommendation) return setSubmitErr("Please select a recommendation");

    setSubmitting(true);
    try {
      const r = await fetch(`/api/v1/hrms/recruit/interview-feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message ?? "Submit failed");
      setSubmitted(true);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadErr) {
    return (
      <Shell>
        <div className="text-center py-16">
          <AlertTriangle size={40} className="mx-auto text-red-500 mb-3" />
          <h1 className="text-xl font-bold text-gray-900">Link invalid or expired</h1>
          <p className="text-sm text-gray-600 mt-2">{loadErr}</p>
          <p className="text-xs text-gray-400 mt-4">If you believe this is an error, contact HR.</p>
        </div>
      </Shell>
    );
  }

  if (!detail) {
    return (
      <Shell>
        <div className="text-center py-16 text-gray-400"><Loader2 size={28} className="animate-spin mx-auto mb-2" />Loading…</div>
      </Shell>
    );
  }

  if (detail.alreadySubmitted || submitted) {
    return (
      <Shell>
        <div className="text-center py-16">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Feedback submitted</h1>
          <p className="text-sm text-gray-600 mt-2">Thank you for your input. HR has been notified and will proceed with the next step.</p>
        </div>
      </Shell>
    );
  }

  // Locked until the interview's scheduled start time — same rule as the
  // in-app pipeline, enforced again by the API on submit.
  if (detail.notYetOpen) {
    const startsAt = new Date(detail.interview.scheduledAt);
    return (
      <Shell>
        <div className="text-center py-16">
          <Clock size={44} className="mx-auto text-amber-500 mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Feedback isn&apos;t open yet</h1>
          <p className="text-sm text-gray-600 mt-2">
            This interview is scheduled for{" "}
            <span className="font-semibold text-gray-900">
              {startsAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>.
          </p>
          <p className="text-sm text-gray-600 mt-1">
            You can submit your scorecard for {detail.interview.candidate.name} once the interview begins — open this same link again then.
          </p>
          <p className="text-xs text-gray-400 mt-4">{detail.companyName} · {detail.interview.roundName}</p>
        </div>
      </Shell>
    );
  }

  const { interview: iv } = detail;
  const dt = new Date(iv.scheduledAt);

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Interview Feedback</h1>
        <p className="text-sm text-gray-500 mt-0.5">{detail.companyName} · Submit feedback for {iv.candidate.name}</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white ring-2 ring-green-200 flex items-center justify-center text-green-700 font-bold">
            {iv.candidate.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{iv.candidate.name}</p>
            <p className="text-xs text-gray-600 mt-0.5">{iv.requisition.title} · {iv.roundName} · {iv.type}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-600">
              <span className="inline-flex items-center gap-1"><Mail size={10} /> {iv.candidate.email}</span>
              {iv.candidate.phone && <span className="inline-flex items-center gap-1"><Phone size={10} /> {iv.candidate.phone}</span>}
              {iv.candidate.currentCompany && <span className="inline-flex items-center gap-1"><Briefcase size={10} /> {iv.candidate.currentDesignation ?? ""} @ {iv.candidate.currentCompany}</span>}
              {iv.candidate.totalExperience ? <span>{Math.floor(iv.candidate.totalExperience / 12)}y exp</span> : null}
              {iv.candidate.resumeUrl && <a href={iv.candidate.resumeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-600 hover:underline"><ExternalLink size={10} /> Resume</a>}
            </div>
            <div className="text-[11px] text-gray-500 mt-2">Interview: {dt.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {iv.duration}min · Interviewer: {iv.interviewer.name}</div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Overall Rating <span className="text-gray-400 font-normal">(out of 10)</span> *</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm({ ...form, overallRating: n })}
                className={clsx(
                  "w-10 h-10 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition",
                  n <= form.overallRating
                    ? "border-amber-400 bg-amber-50 text-amber-600"
                    : "border-slate-200 text-slate-400 hover:border-slate-300",
                )}
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-sm font-semibold text-slate-700">{form.overallRating || "—"}/10</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Recommendation *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RECOMMENDATIONS.map((r) => {
              const on = form.recommendation === r.value;
              const colorCls = {
                emerald: on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 hover:border-emerald-200",
                amber:   on ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 hover:border-amber-200",
                red:     on ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 hover:border-red-200",
              }[r.color as "emerald" | "amber" | "red"];
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm({ ...form, recommendation: r.value })}
                  className={clsx("text-left p-3 rounded-lg border-2 transition", colorCls)}
                >
                  <div className="font-semibold text-sm">{r.label}</div>
                  <div className="text-[11px] opacity-75 mt-0.5">{r.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Strengths</label>
            <textarea
              rows={4}
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
              placeholder="What did the candidate do well?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Concerns</label>
            <textarea
              rows={4}
              value={form.concerns}
              onChange={(e) => setForm({ ...form, concerns: e.target.value })}
              placeholder="Any red flags or gaps?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Overall Comments</label>
          <textarea
            rows={3}
            value={form.overallComments}
            onChange={(e) => setForm({ ...form, overallComments: e.target.value })}
            placeholder="Summary, stage-specific notes, follow-up questions…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {submitErr && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5">{submitErr}</div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-600 hover:from-green-700 hover:to-green-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
          >
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : "Submit Feedback"}
          </button>
        </div>
      </form>

      <p className="text-[11px] text-gray-400 text-center mt-4">One-time link. Expires 7 days after interview completion.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-5 px-4">
      <div className="max-w-3xl mx-auto">
        {children}
      </div>
    </div>
  );
}
