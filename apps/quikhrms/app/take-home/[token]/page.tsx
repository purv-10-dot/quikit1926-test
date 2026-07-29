"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Upload, Link2, Download, FileCheck2, Clock, ExternalLink } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface Submission {
  url: string | null;
  fileName: string | null;
  note: string | null;
  submittedAt: string;
}
interface Detail {
  companyName: string;
  candidateName: string;
  jobTitle: string;
  roundName: string;
  instructions: string;
  hasAttachment: boolean;
  dueDate: string | null;
  submission: Submission | null;
}

export default function TakeHomeTaskPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = () =>
    fetch(withBasePath(`/api/v1/hrms/recruit/take-home/${token}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) setDetail(res.data); else setLoadErr(res.error?.message ?? "Invalid link"); })
      .catch(() => setLoadErr("Could not load the page. Please try again."));

  useEffect(() => { refresh(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr(null);
    if (!file && !link.trim()) return setSubmitErr("Attach a file or paste a link (at least one is required).");
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) return setSubmitErr("Link must start with http:// or https://");

    setSubmitting(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (link.trim()) fd.append("link", link.trim());
      if (note.trim()) fd.append("note", note.trim());
      const r = await fetch(withBasePath(`/api/v1/hrms/recruit/take-home/${token}`), { method: "POST", body: fd });
      const res = await r.json();
      if (!res.success) throw new Error(res.error?.message ?? "Submit failed");
      setJustSubmitted(true);
      setFile(null); setLink(""); setNote("");
      await refresh();
    } catch (er) {
      setSubmitErr(er instanceof Error ? er.message : "Submit failed");
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

  const attachmentHref = withBasePath(`/api/v1/hrms/recruit/take-home/${token}?attachment=1`);
  const dueLabel = detail.dueDate ? new Date(`${detail.dueDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : null;
  const submitted = detail.submission;

  return (
    <Shell>
      <div className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">{detail.companyName}</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-1.5">Take-Home Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Hi {detail.candidateName || "there"} · {detail.jobTitle} · {detail.roundName}
        </p>
      </div>

      {/* Task brief */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800">Your task</h2>
          {dueLabel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-semibold">
              <Clock size={12} /> Due {dueLabel}
            </span>
          )}
        </div>
        {detail.instructions ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{detail.instructions}</p>
        ) : (
          <p className="text-sm text-gray-400">No written instructions were provided. See the attached file{detail.hasAttachment ? "" : " (if any)"} or contact HR.</p>
        )}
        {detail.hasAttachment && (
          <a href={attachmentHref} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100">
            <Download size={15} /> Download task file
          </a>
        )}
      </div>

      {/* Already submitted */}
      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 size={16} /> {justSubmitted ? "Submitted — thank you!" : "Already submitted"}
          </div>
          <div className="mt-2 text-xs text-gray-700 space-y-1">
            {submitted.url && (
              <div className="flex items-center gap-1.5">
                {submitted.fileName ? <FileCheck2 size={13} className="text-green-600" /> : <Link2 size={13} className="text-green-600" />}
                <a href={submitted.url.startsWith("http") ? submitted.url : withBasePath(submitted.url)} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline inline-flex items-center gap-1">
                  {submitted.fileName ?? submitted.url} <ExternalLink size={11} />
                </a>
              </div>
            )}
            {submitted.note && <div className="text-gray-600">Note: {submitted.note}</div>}
            <div className="text-gray-400">Submitted {new Date(submitted.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">You can re-submit below to replace your submission.</p>
        </div>
      )}

      {/* Submission form */}
      <form onSubmit={submit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">{submitted ? "Re-submit your work" : "Submit your work"}</h2>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Upload a file <span className="text-gray-400 font-normal">(optional)</span></label>
          <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.zip" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); }} />
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Upload size={15} /> Choose file
            </button>
            {file
              ? <span className="text-xs text-gray-600 inline-flex items-center gap-1"><FileCheck2 size={13} className="text-blue-600" /> {file.name}<button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} className="ml-1 text-gray-400 hover:text-red-500">✕</button></span>
              : <span className="text-[11px] text-gray-400">PDF, image, DOC/DOCX or ZIP · max 10MB</span>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5"><Link2 size={13} /> Or paste a link <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/… or a shared drive link"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Note <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000}
            placeholder="Anything the reviewer should know — assumptions, how to run it, etc."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <p className="text-[11px] text-gray-400">Attach a file and/or paste a link — at least one is required.</p>

        {submitErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5">{submitErr}</div>}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : submitted ? "Re-submit Task" : "Submit Task"}
          </button>
        </div>
      </form>

      <p className="text-[11px] text-gray-400 text-center mt-4">This is a secure, private link meant only for you. It expires 14 days after it was sent.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-5 px-4">
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  );
}
