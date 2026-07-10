"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, Paperclip, Plus, RefreshCw, Upload, XCircle } from "lucide-react";
import { clsx } from "clsx";

type Bundle = "PreOffer" | "PostOffer";
type UploadStatus = "Pending" | "Approved" | "Rejected";

interface DocType { id: string; code: string; name: string; isRequired: boolean; helpText: string | null; sortOrder: number }
interface UploadRow {
  id: string;
  documentTypeId: string | null;
  customLabel: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  status: UploadStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  documentType: { id: string; code: string; name: string; isRequired: boolean } | null;
}
interface Detail {
  companyName: string;
  bundle: Bundle;
  candidate: { name: string; email: string };
  jobTitle: string;
  status: string;
  docTypes: DocType[];
  uploads: UploadRow[];
  tokenExpiresAt: string;
  submissionDeadline: string | null;
  submittedAt: string | null;
}

export default function CandidateDocPortal({ params }: { params: { token: string } }) {
  const { token } = params;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyTypeId, setBusyTypeId] = useState<string | null>(null);
  const [busyReuploadId, setBusyReuploadId] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState("");
  const [otherBusy, setOtherBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    try {
      const r = await fetch(`/api/v1/hrms/recruit/candidate-documents/${token}`);
      const j = await r.json();
      if (!j.success) return setLoadErr(j.error?.message ?? "Failed to load");
      setDetail(j.data);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Network error");
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  if (loadErr) return (
    <Shell>
      <div className="text-center py-16">
        <AlertTriangle size={40} className="mx-auto text-red-500 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Link invalid or expired</h1>
        <p className="text-sm text-gray-600 mt-2">{loadErr}</p>
        <p className="text-xs text-gray-400 mt-4">Contact HR if you think this is an error.</p>
      </div>
    </Shell>
  );

  if (!detail) return (
    <Shell>
      <div className="text-center py-16 text-gray-400">
        <Loader2 size={28} className="animate-spin mx-auto mb-2" /> Loading…
      </div>
    </Shell>
  );

  const uploadFile = async (file: File, documentTypeId: string | null, customLabel: string | null, reuploadId?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (documentTypeId) fd.append("documentTypeId", documentTypeId);
    if (customLabel) fd.append("customLabel", customLabel);
    if (reuploadId) fd.append("uploadId", reuploadId);
    const r = await fetch(`/api/v1/hrms/recruit/candidate-documents/${token}/upload`, { method: "POST", body: fd });
    const j = await r.json();
    if (!j.success) throw new Error(j.error?.message ?? "Upload failed");
  };

  const onPick = async (docTypeId: string, file: File) => {
    setBusyTypeId(docTypeId); setMsg(null);
    try { await uploadFile(file, docTypeId, null); setMsg({ kind: "ok", text: "Uploaded. HR will review shortly." }); await reload(); }
    catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Upload failed" }); }
    finally { setBusyTypeId(null); }
  };

  const onReupload = async (prev: UploadRow, file: File) => {
    setBusyReuploadId(prev.id); setMsg(null);
    try { await uploadFile(file, prev.documentTypeId, prev.customLabel, prev.id); setMsg({ kind: "ok", text: "Re-uploaded. HR will review shortly." }); await reload(); }
    catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Upload failed" }); }
    finally { setBusyReuploadId(null); }
  };

  const onSubmitForReview = async () => {
    setSubmitting(true); setMsg(null);
    try {
      const r = await fetch(`/api/v1/hrms/recruit/candidate-documents/${token}/submit`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message ?? "Could not submit");
      setMsg({ kind: "ok", text: "Submitted for review. HR will reach out shortly." });
      await reload();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not submit" });
    } finally {
      setSubmitting(false);
    }
  };

  const onOtherUpload = async (file: File) => {
    if (!otherLabel.trim()) { setMsg({ kind: "err", text: "Enter a label for the document first" }); return; }
    setOtherBusy(true); setMsg(null);
    try { await uploadFile(file, null, otherLabel.trim()); setOtherLabel(""); setMsg({ kind: "ok", text: "Uploaded." }); await reload(); }
    catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Upload failed" }); }
    finally { setOtherBusy(false); }
  };

  // group uploads by documentTypeId
  const uploadsByType = new Map<string, UploadRow>();
  for (const u of detail.uploads) {
    if (u.documentTypeId && !uploadsByType.has(u.documentTypeId)) uploadsByType.set(u.documentTypeId, u);
  }
  const otherUploads = detail.uploads.filter((u) => !u.documentTypeId);

  const requiredTotal = detail.docTypes.filter((d) => d.isRequired).length;
  const requiredApproved = detail.docTypes.filter((d) => d.isRequired && uploadsByType.get(d.id)?.status === "Approved").length;
  const complete = detail.status === "Completed" || (requiredTotal > 0 && requiredApproved === requiredTotal);

  // Submission gating: every REQUIRED doc must have at least one upload (any status).
  const submitted = !!detail.submittedAt;
  const requiredUploaded = detail.docTypes.filter((d) => d.isRequired && uploadsByType.has(d.id)).length;
  const canSubmit = requiredTotal > 0 && requiredUploaded === requiredTotal;

  return (
    <Shell>
      <header className="mb-5">
        <p className="text-xs uppercase tracking-widest text-blue-600 font-semibold mb-1">{detail.bundle === "PreOffer" ? "Before Offer" : "After Offer"} — Document Submission</p>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {detail.candidate.name}</h1>
        <p className="text-sm text-gray-600 mt-1">Role: <strong>{detail.jobTitle}</strong> · {detail.companyName}</p>
        {detail.submissionDeadline && (
          <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Clock size={13} /> Submit by {new Date(detail.submissionDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        )}
      </header>

      <div className={clsx("rounded-lg border p-3 mb-4 flex items-center gap-3",
        complete ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-200")}>
        {complete
          ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          : <Clock size={20} className="text-blue-600 shrink-0" />}
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold text-gray-900">
            {complete ? "All required documents approved" : `${requiredApproved} of ${requiredTotal} required documents approved`}
          </p>
          <p className="text-xs text-gray-600">
            Link valid until {new Date(detail.tokenExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.
            Accepted: PDF, JPG, PNG, DOCX. Max 15 MB per file.
          </p>
        </div>
      </div>

      {submitted && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-semibold text-emerald-800">Submitted for review</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              You submitted your documents on{" "}
              <strong>{new Date(detail.submittedAt as string).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.
              HR will review them. If a change is needed, you'll get an updated link.
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div className={clsx("rounded-md border p-2.5 mb-4 text-sm",
          msg.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700")}>
          {msg.text}
        </div>
      )}

      <ol className="space-y-3">
        {detail.docTypes.map((d) => {
          const up = uploadsByType.get(d.id);
          return <DocRow key={d.id}
            type={d}
            upload={up}
            busy={busyTypeId === d.id || busyReuploadId === up?.id}
            locked={submitted}
            onPick={(f) => onPick(d.id, f)}
            onReupload={(f) => up && onReupload(up, f)}
          />;
        })}
      </ol>

      {/* Submit footer — visible only while not yet submitted. */}
      {!submitted && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Ready to submit?</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {canSubmit
                ? "All required documents uploaded. Submitting locks further changes — HR will review."
                : `${requiredUploaded} of ${requiredTotal} required documents uploaded. Upload all to submit.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onSubmitForReview}
            disabled={!canSubmit || submitting}
            className={clsx(
              "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition",
              canSubmit && !submitting
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      )}

      {!submitted && (
      <div className="mt-5 bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Plus size={14} /> Other documents (optional)</p>
        <p className="text-xs text-gray-500 mt-0.5">Submit anything else HR asked for — experience letters, certifications, etc.</p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            value={otherLabel}
            onChange={(e) => setOtherLabel(e.target.value)}
            placeholder="e.g. Skill certification, Additional ID proof"
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer",
            otherBusy ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-50 text-blue-700 hover:bg-blue-100")}>
            <Upload size={14} /> {otherBusy ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={otherBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onOtherUpload(f); e.target.value = ""; }}
            />
          </label>
        </div>

        {otherUploads.length > 0 && (
          <ul className="mt-4 space-y-2">
            {otherUploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
                <span className="flex items-center gap-2">
                  <Paperclip size={12} className="text-gray-400" />
                  <span className="font-medium text-gray-800">{u.customLabel}</span>
                  <a href={u.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">{u.fileName}</a>
                </span>
                <StatusBadge status={u.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-5">
        Secure link · No login required · Expires automatically · HR team of {detail.companyName}
      </p>
    </Shell>
  );
}

function DocRow({ type, upload, busy, locked, onPick, onReupload }: {
  type: DocType; upload: UploadRow | undefined; busy: boolean; locked?: boolean;
  onPick: (f: File) => void; onReupload: (f: File) => void;
}) {
  const hasFile = !!upload;

  return (
    <li className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText size={14} className="text-gray-500" />
            <p className="font-semibold text-gray-900">{type.name}</p>
            {type.isRequired ? <span className="text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 ring-1 ring-red-200 px-1.5 py-0.5 rounded">Required</span>
              : <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Optional</span>}
            {upload && <StatusBadge status={upload.status} />}
          </div>
          {type.helpText && <p className="text-[11px] text-gray-500 mt-1">{type.helpText}</p>}

          {upload && (
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
              <a href={upload.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                <Paperclip size={10} /> {upload.fileName}
              </a>
              {upload.fileSize != null && <span>({Math.round(upload.fileSize / 1024)} KB)</span>}
              <span>· Uploaded {new Date(upload.uploadedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
          {upload?.status === "Rejected" && upload.rejectionReason && (
            <div className="mt-2 text-xs bg-red-50 border border-red-200 rounded-md px-2 py-1.5 text-red-700">
              <strong>HR feedback:</strong> {upload.rejectionReason}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {hasFile && upload.status === "Approved" ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle2 size={13} /> Done</span>
          ) : locked ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">Locked</span>
          ) : (
            <label className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer",
              busy ? "bg-gray-100 text-gray-400 cursor-not-allowed" : hasFile ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-blue-50 text-blue-700 hover:bg-blue-100")}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : hasFile ? <RefreshCw size={12} /> : <Upload size={12} />}
              {busy ? "Uploading…" : hasFile ? "Re-upload" : "Upload"}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (hasFile && upload.status === "Rejected") onReupload(f); else if (hasFile && upload.status === "Pending") onReupload(f); else onPick(f); e.target.value = ""; }}
              />
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const cls = status === "Approved"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : status === "Rejected"
    ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
  const Icon = status === "Approved" ? CheckCircle2 : status === "Rejected" ? XCircle : Clock;
  return (
    <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1", cls)}>
      <Icon size={10} /> {status}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-5 px-4">
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  );
}
