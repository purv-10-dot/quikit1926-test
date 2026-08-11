"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, Briefcase, Loader2, AlertTriangle, CheckCircle2, Upload, FileCheck2 } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface JobDetail {
  id: string;
  title: string;
  jobLocation: string | null;
  employmentType: string;
  workLocation: string;
  experienceMin: string | number | null;
  experienceMax: string | number | null;
  jobDescription: string | null;
  responsibilities: string[] | null;
  requirements: string[] | null;
  niceToHave: string[] | null;
  skills: string[] | null;
  benefits: string[] | null;
  education: string | null;
  department: { name: string } | null;
}

interface JobDetailData {
  company: { name: string; logo: string | null };
  job: JobDetail;
}

function BulletList({ title, items }: { title: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-5">
      <h3 className="text-[13px] font-bold text-gray-900 mb-2">{title}</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

export default function JobDetailApplyPage({ params }: { params: { orgSlug: string; reqId: string } }) {
  const { orgSlug, reqId } = params;
  const [data, setData] = useState<JobDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [applied, setApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", city: "", linkedinUrl: "" });
  const resumeInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/v1/hrms/careers/${orgSlug}/${reqId}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data); else setNotFound(true); })
      .catch(() => setNotFound(true));
  }, [orgSlug, reqId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!resumeInput.current?.files?.[0]) {
      setSubmitError("Please attach your resume.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("requisitionId", reqId);
      fd.append("firstName", form.firstName);
      fd.append("lastName", form.lastName);
      fd.append("email", form.email);
      fd.append("phone", form.phone);
      fd.append("city", form.city);
      fd.append("linkedinUrl", form.linkedinUrl);
      fd.append("resume", resumeInput.current.files[0]);
      if (coverInput.current?.files?.[0]) fd.append("coverLetter", coverInput.current.files[0]);
      // Honeypot — a real visitor never sees or fills this (off-screen via CSS);
      // a naive bot's autofill script does. Read the live DOM value, not a
      // hardcoded "", so a bot that actually types into it gets caught.
      fd.append("hp", honeypot.current?.value ?? "");

      const r = await fetch(withBasePath(`/api/v1/hrms/careers/${orgSlug}/apply`), { method: "POST", body: fd });
      const res = await r.json().catch(() => null);
      if (res?.success) setApplied(true);
      else setSubmitError(res?.error?.message ?? "Couldn't submit your application. Please try again.");
    } catch {
      setSubmitError("Couldn't submit your application. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-1">Job not found</h1>
          <p className="text-sm text-gray-500 mb-4">This role is no longer open, or the link is invalid.</p>
          <Link href={`/careers/${orgSlug}`} className="text-sm font-semibold text-green-700 hover:underline">← Back to all jobs</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={30} className="text-green-600 animate-spin" />
      </div>
    );
  }

  const { company, job } = data;

  if (applied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8 max-w-md w-full text-center">
          <CheckCircle2 size={40} className="text-green-600 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-1">Application received!</h1>
          <p className="text-sm text-gray-500 mb-5">Thanks for applying to {job.title} at {company.name}. We&apos;ll review your application and get back to you.</p>
          <Link href={`/careers/${orgSlug}`} className="text-sm font-semibold text-green-700 hover:underline">← Browse other roles</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/careers/${orgSlug}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={13} /> All jobs at {company.name}
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
          <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-gray-500">
            {job.department?.name && <span className="inline-flex items-center gap-1"><Briefcase size={12} /> {job.department.name}</span>}
            {job.jobLocation && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {job.jobLocation}</span>}
            <span className="inline-flex items-center gap-1"><Clock size={12} /> {job.employmentType === "FullTime" ? "Full Time" : job.employmentType === "PartTime" ? "Part Time" : job.employmentType}</span>
          </div>

          {job.jobDescription && <p className="text-sm text-gray-600 mt-4 leading-relaxed whitespace-pre-line">{job.jobDescription}</p>}
          <div className="mt-4">
            <BulletList title="Responsibilities" items={job.responsibilities} />
            <BulletList title="Requirements" items={job.requirements} />
            <BulletList title="Nice to Have" items={job.niceToHave} />
            <BulletList title="Benefits" items={job.benefits} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-[15px] font-bold text-gray-900 mb-4">Apply for this position</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required>
                <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={INPUT} />
              </Field>
              <Field label="Last Name" required>
                <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={INPUT} />
              </Field>
              <Field label="Email" required>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />
              </Field>
              <Field label="Phone" required>
                <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={INPUT} />
              </Field>
              <Field label="LinkedIn (optional)">
                <input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" className={INPUT} />
              </Field>
            </div>

            <FileField
              label="Resume" required hint="PDF or Word, max 4MB"
              inputRef={resumeInput} name={resumeName}
              onPick={(f) => setResumeName(f?.name ?? null)}
            />
            <FileField
              label="Cover Letter (optional)" hint="PDF or Word, max 4MB"
              inputRef={coverInput} name={coverName}
              onPick={(f) => setCoverName(f?.name ?? null)}
            />

            {/* Honeypot — off-screen (not display:none, which some bots skip),
                tabIndex -1 so keyboard users never land on it. */}
            <div className="absolute -left-[9999px]" aria-hidden="true">
              <input ref={honeypot} tabIndex={-1} autoComplete="off" name="website" />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} /> {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : "Submit Application"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/25 focus:border-green-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}

function FileField({ label, required, hint, inputRef, name, onPick }: {
  label: string; required?: boolean; hint: string;
  inputRef: React.RefObject<HTMLInputElement>; name: string | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:border-green-400 hover:bg-green-50/40 transition"
      >
        {name ? <FileCheck2 size={15} className="text-green-600 shrink-0" /> : <Upload size={15} className="shrink-0" />}
        <span className="truncate">{name ?? `Choose file — ${hint}`}</span>
      </button>
    </div>
  );
}
