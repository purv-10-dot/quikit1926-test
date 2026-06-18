"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/number-input";
import { clsx } from "clsx";
import { FileCheck, IndianRupee, Calendar, Briefcase, User, Gift, Send, Check, X, AlertTriangle, Pencil, FileCheck2, FileText, Mail, BellRing, Star, MessageSquare } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface AppOption {
  id: string;
  currentStage: string | null;
  candidate: { firstName: string; lastName: string; email: string; expectedCTC?: string | null };
  requisition: { title: string; requisitionNumber: string };
}

interface DeptOption { id: string; name: string; }
interface EmpOption { id: string; firstName: string; lastName: string; employeeCode: string; jobTitle: string | null }

interface OfferItem {
  id: string;
  applicationId: string;
  designation: string;
  offeredCTC: string;
  joiningDate: string;
  status: string;
  sentAt: string | null;
  respondedAt: string | null;
  application: {
    id: string;
    candidate: { id: string; firstName: string; lastName: string; email: string };
    requisition: { id: string; title: string; requisitionNumber: string };
  };
  docRequest: {
    applicationId: string;
    status: "Pending" | "Completed" | "Cancelled";
    lastReminderAt: string | null;
    reminderCount: number | null;
  } | null;
}

const REMINDER_COOLDOWN_HOURS = 24;
const DOC_PHASE_STATUSES = ["OfferSent", "OfferAccepted"];

function reminderCooldownRemaining(lastReminderAt: string | null): number {
  if (!lastReminderAt) return 0;
  const elapsedMs = Date.now() - new Date(lastReminderAt).getTime();
  const cooldownMs = REMINDER_COOLDOWN_HOURS * 3600 * 1000;
  return Math.max(0, cooldownMs - elapsedMs);
}

const statusColors: Record<string, string> = {
  OfferDraft: "bg-gray-100 text-gray-600",
  OfferPendingApproval: "bg-yellow-100 text-yellow-700",
  OfferApproved: "bg-[#dbeafe] text-[#2563eb]",
  OfferSent: "bg-purple-100 text-purple-700",
  OfferAccepted: "bg-green-100 text-green-700",
  OfferDeclined: "bg-red-100 text-red-700",
  OfferNegotiating: "bg-orange-100 text-orange-700",
  OfferRevoked: "bg-gray-100 text-gray-400",
  OfferExpired: "bg-gray-100 text-gray-400",
};

function formatCurrency(v: string | number) { return `₹${Number(v).toLocaleString("en-IN")}`; }
function formatDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

export default function OffersPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const emptyForm = {
    applicationId: "", designation: "",
    departmentId: "", reportingToId: "",
    offeredCTC: 0, joiningBonus: 0, relocationBonus: 0, equityGrant: "",
    joiningDate: "", expiresAt: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ offer: OfferItem; kind: "send" | "accept" | "decline" } | null>(null);

  // Stage Feedback modal for offer accept/decline — captures rating, recommendation,
  // strengths, concerns, comments. Same shape as the pipeline-side feedback.
  const [feedbackTarget, setFeedbackTarget] = useState<{ offer: OfferItem; kind: "accept" | "decline" } | null>(null);
  const emptyFeedback = { overallRating: 4, recommendation: "", strengths: "", concerns: "", overallComments: "" };
  const [feedback, setFeedback] = useState(emptyFeedback);

  const [docRequestOffer, setDocRequestOffer] = useState<OfferItem | null>(null);
  const [docRequestSelected, setDocRequestSelected] = useState<Set<string>>(new Set());

  const { data: postOfferDocTypes } = useQuery({
    queryKey: ["candidate-doc-types", "PostOffer"],
    queryFn: () => api.get<Array<{ id: string; code: string; name: string; isRequired: boolean; sortOrder: number; helpText: string | null }>>("/api/v1/hrms/recruit/candidate-document-types?bundle=PostOffer"),
    enabled: !!docRequestOffer,
  });
  const docTypesForBundle = postOfferDocTypes?.data ?? [];

  const docRequestMut = useMutation({
    mutationFn: () => {
      if (!docRequestOffer) throw new Error("No offer selected");
      return api.post(`/api/v1/hrms/recruit/applications/${docRequestOffer.applicationId}/documents/PostOffer`, {
        documentTypeIds: Array.from(docRequestSelected),
      });
    },
    onSuccess: () => {
      alert("Post-offer document request emailed to candidate.");
      setDocRequestOffer(null);
      setDocRequestSelected(new Set());
    },
    onError: (e: Error) => alert(`Request failed: ${e.message}`),
  });

  const remindMut = useMutation({
    mutationFn: ({ applicationId }: { applicationId: string }) =>
      api.post<{ reminderCount: number; mailed: boolean; pendingDocs: string[]; mailError?: string }>(
        `/api/v1/hrms/recruit/applications/${applicationId}/documents/PostOffer/remind`,
        {},
      ),
    onSuccess: (res) => {
      const r = res.data;
      const pending = r.pendingDocs.length;
      if (r.mailed) {
        alert(
          pending > 0
            ? `Reminder #${r.reminderCount} sent to candidate (${pending} document${pending === 1 ? "" : "s"} pending).`
            : `Reminder #${r.reminderCount} sent to candidate.`,
        );
      } else {
        alert(`Reminder logged but mail failed: ${r.mailError ?? "unknown"}`);
      }
    },
    onError: (e: Error) => alert(`Reminder failed: ${e.message}`),
  });

  useEffect(() => {
    if (!docRequestOffer) return;
    if (docTypesForBundle.length === 0) return;
    if (docRequestSelected.size > 0) return;
    const requiredIds = docTypesForBundle.filter((d) => d.isRequired).map((d) => d.id);
    setDocRequestSelected(new Set(requiredIds));
  }, [docRequestOffer, docTypesForBundle, docRequestSelected.size]);

  const { data, isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: () => api.get<OfferItem[]>("/api/v1/hrms/recruit/offers?limit=100"),
  });

  const { data: appsData } = useQuery({
    queryKey: ["apps-for-offer"],
    queryFn: () => api.get<AppOption[]>("/api/v1/hrms/recruit/applications?status=AppActive&limit=200"),
    enabled: showCreate,
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments-offer"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
    enabled: showCreate,
  });

  const { data: empData } = useQuery({
    queryKey: ["employees-offer"],
    queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=200"),
    enabled: showCreate,
  });

  const selectedApp = (appsData?.data ?? []).find((a) => a.id === form.applicationId);

  const buildBody = (body: typeof form) => ({
    applicationId: body.applicationId,
    designation: body.designation,
    departmentId: body.departmentId || undefined,
    reportingToId: body.reportingToId || undefined,
    offeredCTC: body.offeredCTC,
    joiningBonus: body.joiningBonus || undefined,
    relocationBonus: body.relocationBonus || undefined,
    equityGrant: body.equityGrant || undefined,
    joiningDate: body.joiningDate,
    expiresAt: body.expiresAt || undefined,
  });

  const invalidateRecruit = () => {
    qc.invalidateQueries({ queryKey: ["offers"] });
    qc.invalidateQueries({ queryKey: ["pipeline-apps"] });
    qc.invalidateQueries({ queryKey: ["interviews"] });
  };

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/recruit/offers", buildBody(body)),
    onSuccess: () => { invalidateRecruit(); setShowCreate(false); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      api.patch(`/api/v1/hrms/recruit/offers/${id}`, buildBody(body)),
    onSuccess: () => { invalidateRecruit(); setShowCreate(false); setEditId(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/hrms/recruit/offers/${id}`, { status }),
    onSuccess: () => {
      invalidateRecruit();
      setConfirmAction(null);
    },
  });

  // Saves stage feedback FIRST (so it's recorded on the candidate's application),
  // then flips the offer status. Same flow the pipeline uses on stage moves.
  const feedbackMut = useMutation({
    mutationFn: async ({
      applicationId,
      offerId,
      kind,
      body,
    }: {
      applicationId: string;
      offerId: string;
      kind: "accept" | "decline";
      body: typeof feedback;
    }) => {
      await api.post(`/api/v1/hrms/recruit/applications/${applicationId}/stage-feedback`, body);
      await api.patch(`/api/v1/hrms/recruit/offers/${offerId}`, {
        status: kind === "accept" ? "OfferAccepted" : "OfferDeclined",
      });
    },
    onSuccess: () => {
      invalidateRecruit();
      setFeedbackTarget(null);
      setFeedback(emptyFeedback);
    },
  });

  const sendOfferMailMut = useMutation({
    mutationFn: ({ offerId }: { offerId: string }) =>
      api.post("/api/v1/hrms/mail/offer", { offerId }),
    onSuccess: () => {
      invalidateRecruit();
      setConfirmAction(null);
    },
  });

  const offers = data?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Offers</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : offers.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><FileCheck size={32} className="mx-auto mb-2 text-gray-300" />No offers</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Position</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">CTC</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Joining</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o, i) => (
                <tr key={o.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{o.application.candidate.firstName} {o.application.candidate.lastName}</p>
                    <p className="text-xs text-gray-500">{o.application.candidate.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{o.application.requisition.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{o.designation}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(o.offeredCTC)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatDate(o.joiningDate)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[o.status])}>{o.status.replace("Offer", "")}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1.5 justify-end w-full">
                      {o.status === "OfferDraft" && (
                        <>
                          <button onClick={() => {
                            setForm({
                              applicationId: o.application.requisition ? "" : "",
                              designation: o.designation,
                              departmentId: "",
                              reportingToId: "",
                              offeredCTC: Number(o.offeredCTC) || 0,
                              joiningBonus: 0,
                              relocationBonus: 0,
                              equityGrant: "",
                              joiningDate: new Date(o.joiningDate).toISOString().slice(0, 10),
                              expiresAt: "",
                            });
                            setEditId(o.id);
                            setShowCreate(true);
                          }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 shadow-sm transition">
                            <Pencil size={11} /> Edit
                          </button>
                          <button onClick={() => setConfirmAction({ offer: o, kind: "send" })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#bfdbfe] hover:bg-[#dbeafe] shadow-sm transition">
                            <Send size={11} /> Send
                          </button>
                        </>
                      )}
                      {o.status === "OfferSent" && (
                        <>
                          <button
                            onClick={() => {
                              setFeedback({ ...emptyFeedback, recommendation: "Hire" });
                              setFeedbackTarget({ offer: o, kind: "accept" });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 shadow-sm transition"
                          >
                            <Check size={11} /> Accept
                          </button>
                          <button
                            onClick={() => {
                              setFeedback({ ...emptyFeedback, recommendation: "NoHire" });
                              setFeedbackTarget({ offer: o, kind: "decline" });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 shadow-sm transition"
                          >
                            <X size={11} /> Decline
                          </button>
                        </>
                      )}
                      {(() => {
                        // Request Docs is now available on EVERY row regardless of offer status —
                        // HR can request documents at any point in the offer lifecycle.
                        const dr = o.docRequest;
                        const docsCompleted = dr?.status === "Completed";
                        const docsPending = dr?.status === "Pending";
                        const cooldownMs = reminderCooldownRemaining(dr?.lastReminderAt ?? null);
                        const cooldownH = Math.ceil(cooldownMs / (3600 * 1000));

                        if (docsCompleted) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              <Check size={11} /> Docs received
                            </span>
                          );
                        }

                        if (!dr) {
                          return (
                            <button
                              onClick={() => { setDocRequestSelected(new Set()); setDocRequestOffer(o); }}
                              title="Request candidate documents"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 shadow-sm transition"
                            >
                              <FileCheck2 size={11} /> Request Docs
                            </button>
                          );
                        }

                        if (docsPending) {
                          const onCooldown = cooldownMs > 0;
                          return (
                            <button
                              onClick={() => remindMut.mutate({ applicationId: o.applicationId })}
                              disabled={remindMut.isPending || onCooldown}
                              title={onCooldown ? `Already reminded recently. Try again in ~${cooldownH}h.` : `Send reminder${dr.reminderCount ? ` (sent ${dr.reminderCount}x)` : ""}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <BellRing size={11} /> Send Reminder{dr.reminderCount ? ` (${dr.reminderCount})` : ""}
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }} title={editId ? "Edit Offer" : "Create Offer"} size="xl">
        <form onSubmit={(e) => { e.preventDefault(); editId ? editMut.mutate({ id: editId, body: form }) : createMut.mutate(form); }} className="space-y-5">
          {/* Candidate */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <User size={12} /> Candidate
            </h4>
            <Select
              value={form.applicationId}
              onChange={(v) => {
                const app = (appsData?.data ?? []).find((a) => a.id === v);
                setForm({
                  ...form,
                  applicationId: v,
                  designation: form.designation || app?.requisition.title || "",
                });
              }}
              placeholder="Select candidate application..."
              searchable
              options={(appsData?.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.candidate.firstName} ${a.candidate.lastName}`,
                description: `${a.requisition.requisitionNumber} · ${a.requisition.title}${a.currentStage ? ` · ${a.currentStage}` : ""}`,
              }))}
            />
            {selectedApp && (
              <div className="mt-2 bg-[#dbeafe] border border-[#dbeafe] rounded-lg px-3 py-2 text-xs text-[#1d4ed8]">
                <div className="font-semibold">{selectedApp.candidate.firstName} {selectedApp.candidate.lastName}</div>
                <div className="text-[#3b82f6]">{selectedApp.candidate.email}</div>
                {selectedApp.candidate.expectedCTC && (
                  <div className="mt-0.5 text-[11px]">Expected CTC: ₹{Number(selectedApp.candidate.expectedCTC).toLocaleString("en-IN")}</div>
                )}
              </div>
            )}
          </section>

          {/* Role */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <Briefcase size={12} /> Role
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Designation <span className="text-red-500">*</span></label>
                <input type="text" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <Select value={form.departmentId} onChange={(v) => setForm({ ...form, departmentId: v })}
                  placeholder="Select department" searchable clearable
                  options={(deptsData?.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Reporting Manager</label>
                <Select value={form.reportingToId} onChange={(v) => setForm({ ...form, reportingToId: v })}
                  placeholder="Select manager" searchable clearable
                  options={(empData?.data ?? []).map((e) => ({
                    value: e.id,
                    label: `${e.firstName} ${e.lastName}`,
                    description: `${e.employeeCode}${e.jobTitle ? ` · ${e.jobTitle}` : ""}`,
                  }))} />
              </div>
            </div>
          </section>

          {/* Compensation */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <IndianRupee size={12} /> Compensation
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1 whitespace-nowrap">
                  <IndianRupee size={11} /> Annual CTC <span className="text-red-500">*</span>
                </label>
                <NumberInput
                  min={0}
                  value={form.offeredCTC}
                  onChange={(v) => setForm({ ...form, offeredCTC: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Gift size={11} /> Joining Bonus</label>
                <NumberInput min={0} value={form.joiningBonus}
                  onChange={(v) => setForm({ ...form, joiningBonus: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Gift size={11} /> Relocation Bonus</label>
                <NumberInput min={0} value={form.relocationBonus}
                  onChange={(v) => setForm({ ...form, relocationBonus: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Equity Grant (optional)</label>
                <input type="text" value={form.equityGrant}
                  placeholder="e.g. 0.1% vested over 4 years"
                  onChange={(e) => setForm({ ...form, equityGrant: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
            </div>
          </section>

          {/* Dates */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <Calendar size={12} /> Dates
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.joiningDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offer Expires</label>
                <input type="date" value={form.expiresAt}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createMut.isPending || !form.applicationId || !form.designation || !form.offeredCTC || !form.joiningDate}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
              {editId
                ? (editMut.isPending ? "Saving..." : "Save Changes")
                : (createMut.isPending ? "Creating..." : "Create Offer")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stage Feedback modal — same flow as pipeline, opened on Accept/Decline. */}
      <Modal open={!!feedbackTarget} onClose={() => !feedbackMut.isPending && setFeedbackTarget(null)} title="Stage Feedback" size="lg">
        {feedbackTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!feedback.recommendation) return;
              feedbackMut.mutate({
                applicationId: feedbackTarget.offer.applicationId,
                offerId: feedbackTarget.offer.id,
                kind: feedbackTarget.kind,
                body: feedback,
              });
            }}
            className="space-y-4"
          >
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm">
              <div className="font-semibold text-slate-900">
                {feedbackTarget.offer.application.candidate.firstName} {feedbackTarget.offer.application.candidate.lastName}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{feedbackTarget.offer.application.requisition.title}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#3b82f6] font-semibold">
                  <MessageSquare size={10} />
                  Stage: Offer
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFeedback({ ...feedback, overallRating: n })}
                    className={clsx(
                      "w-10 h-10 rounded-lg border-2 flex items-center justify-center transition",
                      n <= feedback.overallRating
                        ? "border-amber-400 bg-amber-50 text-amber-600"
                        : "border-slate-200 text-slate-300 hover:border-slate-300",
                    )}
                  >
                    <Star size={18} className={n <= feedback.overallRating ? "fill-current" : ""} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-semibold text-slate-700">{feedback.overallRating}/5</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation</label>
              <Select
                value={feedback.recommendation}
                onChange={(v) => setFeedback({ ...feedback, recommendation: v })}
                options={[
                  { value: "", label: "Select recommendation…" },
                  { value: "Hire", label: "Approve — candidate accepted" },
                  { value: "MaybeHire", label: "On Hold — needs follow-up" },
                  { value: "NoHire", label: "Reject — candidate declined / withdrew" },
                ]}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Pre-filled based on your action — change if the situation differs.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                <textarea
                  rows={3}
                  value={feedback.strengths}
                  onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concerns</label>
                <textarea
                  rows={3}
                  value={feedback.concerns}
                  onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Comments</label>
              <textarea
                rows={3}
                value={feedback.overallComments}
                onChange={(e) => setFeedback({ ...feedback, overallComments: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setFeedbackTarget(null)}
                disabled={feedbackMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={feedbackMut.isPending || !feedback.recommendation}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-5 py-2 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 bg-gradient-to-r",
                  feedbackTarget.kind === "accept"
                    ? "from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                    : "from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700",
                )}
              >
                {feedbackMut.isPending
                  ? "Saving..."
                  : feedbackTarget.kind === "accept"
                    ? <><Check size={14} /> Save & Accept</>
                    : <><X size={14} /> Save & Decline</>}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {confirmAction && (() => {
        const { offer: o, kind } = confirmAction;
        const cfg = {
          send:    { title: "Send Offer Letter?", body: "The candidate will receive a branded offer letter PDF (with letterhead, seal and signature) attached to the email. Status will move to Sent.", cta: "Yes, Send Email", icon: <Send className="w-6 h-6 text-[#3b82f6]" />, ring: "bg-[#dbeafe] ring-[#dbeafe]/60", btn: "from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8]", nextStatus: "OfferSent" },
          accept:  { title: "Accept Offer?",  body: "Mark the candidate as having accepted the offer. Onboarding can begin next.",    cta: "Yes, Accept",  icon: <Check className="w-6 h-6 text-emerald-600" />,       ring: "bg-emerald-50 ring-emerald-50/60", btn: "from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700",  nextStatus: "OfferAccepted" },
          decline: { title: "Decline Offer?", body: "The offer will be marked as declined. The requisition stays open for other candidates.", cta: "Yes, Decline", icon: <AlertTriangle className="w-6 h-6 text-red-600" />, ring: "bg-red-50 ring-red-50/60",          btn: "from-red-600 to-blue-600 hover:from-red-700 hover:to-blue-700",           nextStatus: "OfferDeclined" },
        }[kind];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => !updateMut.isPending && setConfirmAction(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className={clsx("shrink-0 flex items-center justify-center w-12 h-12 rounded-full ring-4", cfg.ring)}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">{cfg.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{cfg.body}</p>
                    <div className="mt-3 text-xs bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2 text-slate-600">
                      <div className="font-semibold text-slate-800">{o.application.candidate.firstName} {o.application.candidate.lastName}</div>
                      <div className="text-[11px] text-slate-500">{o.application.requisition.title} · {o.designation}</div>
                      <div className="text-[11px] text-slate-500">CTC: {formatCurrency(o.offeredCTC)} · Joining: {formatDate(o.joiningDate)}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 pb-2">
                {kind === "send" && (
                  <div className="mt-1 text-[11px] bg-blue-50 border border-blue-100 rounded-md px-2.5 py-2 text-slate-600">
                    <div className="text-slate-800 font-medium mb-0.5">Email preview</div>
                    <div>To: <span className="font-medium">{o.application.candidate.email}</span></div>
                    <div>Subject: Offer from {`{company}`} — {o.application.requisition.title}</div>
                    <div>Attachment: Offer-{o.application.candidate.firstName}-{o.application.candidate.lastName}.pdf</div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <button type="button" onClick={() => setConfirmAction(null)} disabled={updateMut.isPending || sendOfferMailMut.isPending}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
                  Not Now
                </button>
                <button type="button"
                  onClick={() => kind === "send"
                    ? sendOfferMailMut.mutate({ offerId: o.id })
                    : updateMut.mutate({ id: o.id, status: cfg.nextStatus })}
                  disabled={updateMut.isPending || sendOfferMailMut.isPending}
                  className={clsx("inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 transition bg-gradient-to-r", cfg.btn)}>
                  {(kind === "send" ? sendOfferMailMut.isPending : updateMut.isPending) ? "Sending..." : cfg.cta}
                </button>
              </div>
              {sendOfferMailMut.isError && (
                <div className="px-6 pb-3 text-xs text-red-600">Mail send failed. Check SMTP / branding config.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Request Candidate Documents Modal (Post-offer) */}
      <Modal
        open={!!docRequestOffer}
        onClose={() => !docRequestMut.isPending && setDocRequestOffer(null)}
        title="Request Post-Offer Documents"
        size="lg"
      >
        {docRequestOffer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (docRequestSelected.size === 0) { alert("Select at least one document"); return; }
              docRequestMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-violet-700 text-xs font-semibold mb-1">
                <FileCheck2 size={12} /> After-Offer Bundle
              </div>
              <div className="font-semibold text-slate-900">{docRequestOffer.application.candidate.firstName} {docRequestOffer.application.candidate.lastName}</div>
              <div className="text-xs text-slate-600 mt-0.5 truncate">
                {docRequestOffer.application.requisition.title} · {docRequestOffer.application.candidate.email}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Select documents to request</p>
              <div className="flex items-center gap-2 text-xs">
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set(docTypesForBundle.map((d) => d.id)))}
                  className="text-[#3b82f6] hover:underline font-medium">All</button>
                <span className="text-slate-300">·</span>
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set(docTypesForBundle.filter((d) => d.isRequired).map((d) => d.id)))}
                  className="text-[#3b82f6] hover:underline font-medium">Required only</button>
                <span className="text-slate-300">·</span>
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set())}
                  className="text-slate-500 hover:text-slate-700 font-medium">None</button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg max-h-[46vh] overflow-y-auto">
              {docTypesForBundle.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">Loading doc list…</div>
              ) : (
                docTypesForBundle.map((d) => {
                  const on = docRequestSelected.has(d.id);
                  return (
                    <label key={d.id} className={clsx(
                      "flex items-start gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer transition",
                      on ? "bg-violet-50/60" : "hover:bg-slate-50")}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = new Set(docRequestSelected);
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                          setDocRequestSelected(next);
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileText size={12} className="text-slate-400" />
                          <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                          {d.isRequired
                            ? <span className="text-[9px] font-bold uppercase tracking-wide bg-red-50 text-red-700 ring-1 ring-red-200 px-1.5 py-0.5 rounded">Required</span>
                            : <span className="text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Optional</span>}
                        </div>
                        {d.helpText && <p className="text-[11px] text-slate-500 mt-0.5 ml-4">{d.helpText}</p>}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Candidate will receive a secure link valid for 7 days. Reminders auto-fire at 24h / 48h / 72h.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDocRequestOffer(null)} disabled={docRequestMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={docRequestMut.isPending || docRequestSelected.size === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                <Mail size={13} /> {docRequestMut.isPending ? "Sending…" : `Send Request (${docRequestSelected.size})`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
