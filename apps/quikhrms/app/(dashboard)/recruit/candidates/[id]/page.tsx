"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { clsx } from "clsx";
import {
  User, Mail, FileText, Clock, Briefcase, MapPin, Phone, IndianRupee, Globe,
  Star, ThumbsUp, AlertTriangle, Check, X, ExternalLink, Inbox, ChevronDown,
  Ban, Archive, ArchiveRestore, RotateCcw, ShieldX, Rocket, MessageSquare, BellRing,
} from "lucide-react";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

// ─── Types ───────────────────────────────────────────────

interface Application {
  id: string;
  currentStage: string | null;
  status: string;
  requisition: { id: string; title: string; requisitionNumber: string } | null;
  screeningAnswers?: {
    answers?: Record<string, string>;
    technical?: { question: string; answer: string }[];
    comments?: string;
    submittedAt?: string;
  } | null;
}
interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  source: string;
  status: string;
  currentCompany: string | null;
  currentDesignation: string | null;
  totalExperience: number | null;
  noticePeriod: number | null;
  currentCTC: string | null;
  expectedCTC: string | null;
  willingToRelocate: boolean | null;
  resumeUrl: string | null;
  applications: Application[];
}

type TabKey = "overview" | "feedback" | "documents" | "mail" | "activity";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <User size={13} /> },
  { key: "feedback", label: "Feedback", icon: <MessageSquare size={13} /> },
  { key: "documents", label: "Documents", icon: <FileText size={13} /> },
  { key: "mail", label: "Mail", icon: <Mail size={13} /> },
  { key: "activity", label: "Activity", icon: <Clock size={13} /> },
];

const statusBadge: Record<string, string> = {
  New: "bg-[#dcfce7] text-[#16a34a]",
  InPipeline: "bg-yellow-100 text-yellow-700",
  Hired: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  OnHold: "bg-orange-100 text-orange-700",
  Withdrawn: "bg-gray-100 text-gray-500",
};

function cleanStatus(s: string) {
  return s.replace(/^Cand/, "");
}

// ─── Page ────────────────────────────────────────────────

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const api = useApiClient();
  const [tab, setTab] = useState<TabKey>("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-detail", id],
    queryFn: () => api.get<Candidate>(`/api/v1/hrms/recruit/candidates/${id}`),
  });
  const c = data?.data;
  const appId = c?.applications?.[0]?.id ?? null;

  const initials = c ? `${c.firstName?.[0] ?? ""}${c.lastName?.[0] ?? ""}`.toUpperCase() : "";
  const status = c ? cleanStatus(c.status) : "";

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 pt-5">
        <div className="flex items-start justify-between gap-4 flex-wrap pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-bold shrink-0">
              {isLoading ? "" : initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-page-title text-gray-900 truncate">
                  {isLoading ? <SkeletonLine w={160} h={18} /> : `${c?.firstName} ${c?.lastName}`}
                </h1>
                {c && (
                  <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", statusBadge[status] ?? "bg-gray-100 text-gray-500")}>
                    {status}
                  </span>
                )}
              </div>
              {c?.location && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <MapPin size={12} /> {c.location}
                </p>
              )}
            </div>
          </div>
          {c?.resumeUrl && (
            <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm">
              <FileText size={13} /> Resume
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-t border-gray-100 -mx-5 px-5 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-3 py-3 text-[13px] font-semibold border-b-2 -mb-px transition whitespace-nowrap",
                  active ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-800",
                )}>
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab candidate={c} loading={isLoading} />}
      {tab === "feedback" && <FeedbackTab appId={appId} />}
      {tab === "documents" && <DocumentsTab appId={appId} />}
      {tab === "mail" && <MailTab candidateId={id} email={c?.email ?? ""} />}
      {tab === "activity" && <ActivityTab candidateId={id} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────

function expLabel(months: number | null) {
  if (months == null) return "—";
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

const SCREENING_LABELS: Record<string, string> = {
  name: "Name", contact: "Number", email: "Email", techStack: "Tech stack",
  experience: "EXP", location: "Location", reasonForChange: "Reason for job change",
  noticePeriod: "Notice period", currentSalary: "Current salary",
  expectedSalary: "Expected salary", communication: "Communication",
};

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 min-w-0 truncate">{children}</span>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-green-700 mb-2">
        {icon}
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  );
}

function OverviewTab({ candidate: c, loading }: { candidate: Candidate | undefined; loading: boolean }) {
  if (loading || !c) {
    return <div className="bg-white rounded-xl border border-gray-200 p-4"><SkeletonLine w="40%" h={12} /></div>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card icon={<Mail size={16} />} title="Contact">
          <Row icon={<Mail size={14} />} label="Email">
            <a href={`mailto:${c.email}`} className="text-green-700 hover:underline inline-flex items-center gap-1">
              {c.email} <ExternalLink size={11} />
            </a>
          </Row>
          <Row icon={<Phone size={14} />} label="Phone">{c.phone || "—"}</Row>
          <Row icon={<MapPin size={14} />} label="Location">{c.location || "—"}</Row>
          <Row icon={<Globe size={14} />} label="Source">{c.source.replace(/^Cand/, "")}</Row>
        </Card>
        <Card icon={<Briefcase size={16} />} title="Professional">
          <Row icon={<Briefcase size={14} />} label="Current role">
            {c.currentDesignation ? `${c.currentDesignation}${c.currentCompany ? ` · ${c.currentCompany}` : ""}` : "—"}
          </Row>
          <Row icon={<Clock size={14} />} label="Experience">{expLabel(c.totalExperience)}</Row>
          <Row icon={<Clock size={14} />} label="Notice period">{c.noticePeriod != null ? `${c.noticePeriod} days` : "—"}</Row>
          <Row icon={<IndianRupee size={14} />} label="Current CTC">{c.currentCTC || "—"}</Row>
          <Row icon={<IndianRupee size={14} />} label="Expected CTC">{c.expectedCTC || "—"}</Row>
          <Row icon={<MapPin size={14} />} label="Relocate">{c.willingToRelocate ? "Yes" : "Not specified"}</Row>
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-green-700 mb-3">
          <FileText size={16} />
          <h3 className="text-[13px] font-semibold">Applications ({c.applications.length})</h3>
        </div>
        {c.applications.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Not applied to any requisition yet.</p>
        ) : (
          <div className="space-y-2">
            {c.applications.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{a.requisition?.title ?? "—"}</p>
                  <p className="text-[11px] font-mono text-gray-400">{a.requisition?.requisitionNumber ?? ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.currentStage && (
                    <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-50 text-green-700 ring-1 ring-green-200">{a.currentStage}</span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-gray-50 text-gray-600 ring-1 ring-gray-200">
                    <FileText size={11} /> {a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {c.applications
        .filter((a) => a.screeningAnswers && (
          Object.values(a.screeningAnswers.answers ?? {}).some(Boolean) ||
          (a.screeningAnswers.technical ?? []).some((t) => t.answer) ||
          !!a.screeningAnswers.comments
        ))
        .map((a) => {
          const sa = a.screeningAnswers!;
          const entries = Object.entries(sa.answers ?? {}).filter(([, v]) => v);
          const tech = (sa.technical ?? []).filter((t) => t.answer);
          return (
            <div key={a.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-green-700 mb-3">
                <FileText size={16} />
                <h3 className="text-[13px] font-semibold">Screening — {a.requisition?.title ?? "—"}</h3>
              </div>
              {entries.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5 mb-3">
                  {entries.map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[11px] text-gray-400">{SCREENING_LABELS[k] ?? k}</p>
                      <p className="text-xs text-gray-800 break-words">{v}</p>
                    </div>
                  ))}
                </div>
              )}
              {tech.length > 0 && (
                <div className="mb-3 pt-3 border-t border-gray-50">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Technical Questions</p>
                  <div className="space-y-2">
                    {tech.map((t, i) => (
                      <div key={i}>
                        <p className="text-xs font-medium text-gray-700">{t.question}</p>
                        <p className="text-xs text-gray-600 break-words">{t.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sa.comments && (
                <div className="pt-3 border-t border-gray-50">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1">Comments</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{sa.comments}</p>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ─── Feedback ────────────────────────────────────────────

interface FeedbackItem {
  id: string;
  stage: string;
  round: number;
  overallRating: number | null;
  recommendation: string | null;
  strengths: string | null;
  concerns: string | null;
  overallComments: string | null;
  submittedAt: string | null;
  interviewer: { name: string; jobTitle: string | null };
}

const RECO_META: Record<string, { label: string; cls: string }> = {
  StrongHire:   { label: "Strong Approve", cls: "bg-green-100 text-green-700" },
  Hire:         { label: "Approve",        cls: "bg-green-100 text-green-700" },
  MaybeHire:    { label: "Maybe",          cls: "bg-amber-100 text-amber-700" },
  NoHire:       { label: "Not Recommended", cls: "bg-red-100 text-red-700" },
  StrongNoHire: { label: "Strong Reject",  cls: "bg-red-100 text-red-700" },
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 ring-1 ring-amber-200">
      <Star size={13} className="text-amber-400 fill-amber-400" />
      <span className="text-xs font-semibold text-amber-700">{rating}/10</span>
    </span>
  );
}

function FeedbackTab({ appId }: { appId: string | null }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    enabled: !!appId,
    queryKey: ["feedback-history", appId],
    queryFn: () => api.get<{ history: FeedbackItem[] }>(`/api/v1/hrms/recruit/applications/${appId}/feedback-history`),
  });
  const history = data?.data?.history ?? [];

  if (!appId) return <EmptyState icon={<MessageSquare size={28} />} title="No application" sub="This candidate has no application to show feedback for." />;
  if (isLoading) return <CardSkeleton />;
  if (history.length === 0) return <EmptyState icon={<MessageSquare size={28} />} title="No feedback yet" sub="Interview scorecards will appear here once submitted." />;

  return (
    <div className="space-y-4">
      {history.map((f) => {
        const reco = f.recommendation ? RECO_META[f.recommendation] : null;
        return (
          <div key={f.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-[13px] font-semibold text-gray-900">{f.stage}</h4>
                  {reco && <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold", reco.cls)}>{reco.label}</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  by {f.interviewer.name}{f.interviewer.jobTitle ? ` · ${f.interviewer.jobTitle}` : ""}
                  {f.submittedAt && ` · ${new Date(f.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
                </p>
              </div>
              {f.overallRating != null && <Stars rating={f.overallRating} />}
            </div>
            {f.overallComments && <p className="text-xs text-gray-700 mt-3">{f.overallComments}</p>}
            {(f.strengths || f.concerns) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-green-50/70 border border-green-100 rounded-lg p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1"><ThumbsUp size={12} /> Strengths</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{f.strengths || "—"}</p>
                </div>
                <div className="bg-red-50/70 border border-red-100 rounded-lg p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1"><AlertTriangle size={12} /> Concerns</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{f.concerns || "—"}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Documents ───────────────────────────────────────────

interface Upload {
  id: string;
  fileUrl: string;
  fileName: string;
  status: "Pending" | "Approved" | "Rejected";
  rejectionReason: string | null;
  uploadedAt: string;
  customLabel: string | null;
  documentType: { id: string; name: string; code: string; isRequired: boolean } | null;
}
interface BundleData {
  bundle: string;
  request: { id: string; status: string; submittedAt: string | null; uploads: Upload[] } | null;
  ready: boolean;
}

const BUNDLES: { key: string; title: string }[] = [
  { key: "PreOffer", title: "Pre-Offer Documents" },
  { key: "PostOffer", title: "Post-Offer Documents" },
];

function bundleBadge(b: BundleData | undefined) {
  if (!b?.request) return { label: "Not requested", cls: "bg-gray-50 text-gray-500 ring-gray-200" };
  if (b.request.status === "Completed" || b.ready) return { label: "Complete", cls: "bg-green-50 text-green-700 ring-green-200" };
  return { label: "Under Review", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
}

function DocumentsTab({ appId }: { appId: string | null }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [review, setReview] = useState<{ upload: Upload; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const preOffer = useQuery({
    enabled: !!appId,
    queryKey: ["doc-bundle", appId, "PreOffer"],
    queryFn: () => api.get<BundleData>(`/api/v1/hrms/recruit/applications/${appId}/documents/PreOffer`),
  });
  const postOffer = useQuery({
    enabled: !!appId,
    queryKey: ["doc-bundle", appId, "PostOffer"],
    queryFn: () => api.get<BundleData>(`/api/v1/hrms/recruit/applications/${appId}/documents/PostOffer`),
  });
  const queries = [preOffer, postOffer];

  const reviewMut = useMutation({
    mutationFn: ({ uploadId, action, reason }: { uploadId: string; action: string; reason: string }) =>
      api.post(`/api/v1/hrms/recruit/document-reviews/${uploadId}`, { action, reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doc-bundle", appId] });
      toast.success(review?.action === "approve" ? "Document approved" : "Document rejected");
      setReview(null);
      setComment("");
    },
  });

  // Nudge the candidate about documents still pending (not yet approved).
  const remindMut = useMutation({
    mutationFn: (bundle: string) =>
      api.post<{ reminderCount: number; mailed: boolean; pendingDocs: string[] }>(
        `/api/v1/hrms/recruit/applications/${appId}/documents/${bundle}/remind`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doc-bundle", appId] });
    },
  });

  // Re-request after a rejection: re-opens the (submitted) packet so the
  // candidate can re-upload the rejected doc, then re-sends the doc email.
  const reopenMut = useMutation({
    mutationFn: (bundle: string) =>
      api.post(`/api/v1/hrms/recruit/applications/${appId}/documents/${bundle}/reopen`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doc-bundle", appId] });
    },
  });

  if (!appId) return <EmptyState icon={<FileText size={28} />} title="No application" sub="This candidate has no application to manage documents for." />;

  return (
    <div className="space-y-4">
      {BUNDLES.map((b, i) => {
        const data = queries[i].data?.data;
        const loading = queries[i].isLoading;
        const badge = bundleBadge(data);
        const uploads = data?.request?.uploads ?? [];
        return (
          <div key={b.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-gray-800">
                <FileText size={16} className="text-green-700" />
                <h3 className="text-[13px] font-semibold">{b.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {data?.request && badge.label !== "Complete" && (
                  <button
                    onClick={() => toast.promise(remindMut.mutateAsync(b.key), { loading: "Sending reminder…", success: "Reminder sent", error: "Couldn't send reminder" })}
                    disabled={remindMut.isPending}
                    title="Re-send the reminder email for documents still pending"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed">
                    <BellRing size={12} /> {remindMut.isPending ? "Sending…" : "Send Reminder"}
                  </button>
                )}
                <span className={clsx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1", badge.cls)}>
                  {badge.label === "Complete" && <Check size={11} />}
                  {badge.label === "Under Review" && <Clock size={11} />}
                  {badge.label}
                </span>
              </div>
            </div>
            {loading ? (
              <SkeletonLine w="50%" h={12} />
            ) : !data?.request ? (
              <p className="text-xs text-gray-400 py-3">No document request sent for this bundle yet.</p>
            ) : uploads.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">Requested — waiting for candidate to upload.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {uploads.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={16} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-800 truncate">{u.documentType?.name ?? u.customLabel ?? u.fileName}</p>
                        <p className="text-[11px] text-gray-400">{new Date(u.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.status === "Approved" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200"><Check size={11} /> Approved</span>}
                      {u.status === "Rejected" && (
                        <>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200" title={u.rejectionReason ?? ""}><X size={11} /> Rejected</span>
                          <button onClick={() => toast.promise(reopenMut.mutateAsync(b.key), { loading: "Sending re-request…", success: "Re-request sent", error: "Couldn't send re-request" })} disabled={reopenMut.isPending}
                            title="Ask the candidate to re-upload this document"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed">
                            <RotateCcw size={11} /> {reopenMut.isPending ? "Sending…" : "Re-request"}
                          </button>
                        </>
                      )}
                      {u.status === "Pending" && (
                        <>
                          <button onClick={() => { setComment(""); setReview({ upload: u, action: "approve" }); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100">
                            <Check size={11} /> Approve
                          </button>
                          <button onClick={() => { setComment(""); setReview({ upload: u, action: "reject" }); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                            <X size={11} /> Reject
                          </button>
                        </>
                      )}
                      <a href={u.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded" title="Open document">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.action === "reject" ? "Reject document" : "Approve document"} size="md">
        {review && (
          <form onSubmit={(e) => { e.preventDefault(); if (review.action === "reject" && !comment.trim()) { toast.error("Reason required"); return; } reviewMut.mutate({ uploadId: review.upload.id, action: review.action, reason: comment.trim() }); }} className="space-y-4">
            <div>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs bg-gray-50 text-gray-800">
                {review.upload.documentType?.name ?? review.upload.customLabel ?? review.upload.fileName}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comment {review.action === "reject" && <span className="text-red-500">*</span>}
              </label>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder={review.action === "reject" ? "Reason for rejection…" : "Optional note…"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReview(null)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={reviewMut.isPending}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50",
                  review.action === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700")}>
                {review.action === "reject" ? <X size={13} /> : <Check size={13} />}
                {reviewMut.isPending ? "Saving…" : review.action === "reject" ? "Reject" : "Approve"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ─── Mail ────────────────────────────────────────────────
// No dedicated mail-log model exists; we surface the candidate's
// communication events (invites, document requests, offers, reminders)
// from the activity timeline as a sent-mail log.

const MAIL_KINDS = new Set([
  "InterviewScheduled", "InterviewRescheduled", "InterviewCancelled",
  "OfferCreated", "OfferSent", "DocumentRequested", "DocumentReminder",
  "FeedbackRequested",
]);

function MailTab({ candidateId, email }: { candidateId: string; email: string }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["candidate-timeline", candidateId],
    queryFn: () => api.get<TimelineResponse>(`/api/v1/hrms/recruit/candidates/${candidateId}/timeline`),
  });
  const mails = (data?.data?.entries ?? []).filter((e) => MAIL_KINDS.has(e.kind));

  if (isLoading) return <CardSkeleton />;
  if (mails.length === 0) return <EmptyState icon={<Inbox size={28} />} title="No mail sent" sub="Interview invites, document requests and offer emails will appear here." />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {mails.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50">
            <span className="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Mail size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{m.title}</p>
              <p className="text-[11px] text-gray-400 truncate">to {email}{m.description ? ` · ${m.description}` : ""}</p>
            </div>
            <span className="text-[11px] text-gray-400 shrink-0">{new Date(m.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────

interface TimelineResponse {
  entries: Array<{ id: string; kind: string; title: string; description?: string | null; actor?: { name: string; jobTitle?: string | null } | null; at: string }>;
}

const KIND_META: Record<string, { dot: string; icon: React.ReactNode }> = {
  CandidateCreated:   { dot: "bg-[#22c55e]", icon: <User size={11} /> },
  CandidateUpdated:   { dot: "bg-slate-500", icon: <User size={11} /> },
  ApplicationCreated: { dot: "bg-[#22c55e]", icon: <FileText size={11} /> },
  StageChanged:       { dot: "bg-green-500", icon: <ChevronDown size={11} /> },
  InterviewScheduled: { dot: "bg-amber-500", icon: <Briefcase size={11} /> },
  InterviewCompleted: { dot: "bg-sky-500", icon: <Check size={11} /> },
  FeedbackSubmitted:  { dot: "bg-emerald-500", icon: <Check size={11} /> },
  OfferCreated:       { dot: "bg-purple-500", icon: <FileText size={11} /> },
  OfferSent:          { dot: "bg-violet-500", icon: <Mail size={11} /> },
  ApplicationRejected:{ dot: "bg-red-500", icon: <ShieldX size={11} /> },
  ApplicationHired:   { dot: "bg-green-500", icon: <Rocket size={11} /> },
  DocumentsRequested: { dot: "bg-indigo-500", icon: <FileText size={11} /> },
  DocumentUploaded:   { dot: "bg-sky-500", icon: <FileText size={11} /> },
  DocumentApproved:   { dot: "bg-emerald-500", icon: <Check size={11} /> },
  DocumentRejected:   { dot: "bg-red-500", icon: <X size={11} /> },
  Blacklisted:        { dot: "bg-red-600", icon: <Ban size={11} /> },
  Unblacklisted:      { dot: "bg-emerald-500", icon: <RotateCcw size={11} /> },
  Archived:           { dot: "bg-slate-500", icon: <Archive size={11} /> },
  Unarchived:         { dot: "bg-slate-500", icon: <ArchiveRestore size={11} /> },
};

function ActivityTab({ candidateId }: { candidateId: string }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["candidate-timeline", candidateId],
    queryFn: () => api.get<TimelineResponse>(`/api/v1/hrms/recruit/candidates/${candidateId}/timeline`),
  });
  const entries = data?.data?.entries ?? [];

  if (isLoading) return <CardSkeleton />;
  if (entries.length === 0) return <EmptyState icon={<Clock size={28} />} title="No activity yet" sub="Candidate activity will appear here." />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="relative">
        <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-gray-100" />
        <ul className="space-y-3">
          {entries.map((e) => {
            const meta = KIND_META[e.kind] ?? KIND_META.CandidateUpdated;
            return (
              <li key={e.id} className="relative pl-9">
                <span className={clsx("absolute left-0 top-1 w-7 h-7 rounded-full ring-4 ring-white flex items-center justify-center text-white shadow-sm", meta.dot)}>
                  {meta.icon}
                </span>
                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-gray-900">{e.title}</p>
                    <span className="text-[11px] text-gray-400">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {e.description && <p className="text-xs text-gray-600 mt-1">{e.description}</p>}
                  {e.actor && <p className="text-[11px] text-gray-400 mt-1.5">by <span className="font-medium text-gray-700">{e.actor.name}</span>{e.actor.jobTitle ? ` · ${e.actor.jobTitle}` : ""}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-12 text-center">
      <div className="mx-auto text-gray-300 mb-2 flex justify-center">{icon}</div>
      <p className="text-[13px] font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2"><SkeletonLine w="40%" h={12} /><SkeletonLine w="80%" h={10} /></div>
      ))}
    </div>
  );
}
