"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { FileCheck2, Clock, CheckCircle2, XCircle, Inbox, Paperclip, Filter as FilterIcon, ChevronRight, ChevronDown, User } from "lucide-react";
import { clsx } from "clsx";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";

const DOC_EXPORT_COLUMNS = [
  { header: "Candidate", key: "candidate", width: 22 },
  { header: "Email", key: "email", width: 26 },
  { header: "Role", key: "role", width: 22 },
  { header: "Stage", key: "stage", width: 16 },
  { header: "Document", key: "document", width: 24 },
  { header: "File", key: "fileName", width: 26 },
  { header: "Bundle", key: "bundle", width: 14 },
  { header: "Status", key: "status", width: 12 },
  { header: "Uploaded", key: "uploaded", width: 14 },
];

type Bundle = "PreOffer" | "PostOffer";

interface PendingUpload {
  id: string;
  documentTypeId: string | null;
  customLabel: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  status: "Pending" | "Approved" | "Rejected";
  uploadedAt: string;
  documentType: { id: string; name: string; code: string; isRequired: boolean } | null;
  request: {
    id: string;
    bundle: Bundle;
    status: string;
    application: {
      id: string;
      candidate: { firstName: string; lastName: string; email: string };
      requisition: { title: string };
      currentStage: string | null;
    };
  };
}

export default function DocumentReviewQueue() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [bundleFilter, setBundleFilter] = useState<"all" | Bundle>("all");
  const [decision, setDecision] = useState<{ kind: "approve" | "reject"; row: PendingUpload } | null>(null);
  const [reason, setReason] = useState("");
  // Track which candidate rows are expanded. Auto-expand first candidate on load.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (appId: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(appId) ? next.delete(appId) : next.add(appId);
      return next;
    });

  const { data, isLoading } = useQuery({
    queryKey: ["doc-reviews", "pending"],
    queryFn: () => api.get<PendingUpload[]>("/api/v1/hrms/recruit/document-reviews/pending"),
  });
  const items = data?.data ?? [];
  const filtered = bundleFilter === "all" ? items : items.filter((i) => i.request.bundle === bundleFilter);

  // Flat row-per-document export of the currently filtered documents.
  const docExportRows = filtered.map((i) => ({
    candidate: `${i.request.application.candidate.firstName} ${i.request.application.candidate.lastName}`.trim(),
    email: i.request.application.candidate.email,
    role: i.request.application.requisition.title,
    stage: i.request.application.currentStage ?? "",
    document: i.documentType?.name ?? i.customLabel ?? "Other",
    fileName: i.fileName,
    bundle: i.request.bundle === "PreOffer" ? "Before Offer" : "After Offer",
    status: i.status,
    uploaded: new Date(i.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  }));

  // Group documents by candidate (applicationId).
  interface CandidateGroup {
    appId: string;
    name: string;
    email: string;
    role: string;
    stage: string | null;
    docs: PendingUpload[];
    pre: number;
    post: number;
  }
  const groups: CandidateGroup[] = (() => {
    const map = new Map<string, CandidateGroup>();
    for (const i of filtered) {
      const appId = i.request.application.id;
      const g = map.get(appId);
      if (g) {
        g.docs.push(i);
      } else {
        map.set(appId, {
          appId,
          name: `${i.request.application.candidate.firstName} ${i.request.application.candidate.lastName}`.trim(),
          email: i.request.application.candidate.email,
          role: i.request.application.requisition.title,
          stage: i.request.application.currentStage,
          docs: [i],
          pre: 0,
          post: 0,
        });
      }
    }
    for (const g of map.values()) {
      g.pre = g.docs.filter((d) => d.request.bundle === "PreOffer").length;
      g.post = g.docs.filter((d) => d.request.bundle === "PostOffer").length;
    }
    // Sort: most pending first
    return Array.from(map.values()).sort((a, b) => b.docs.length - a.docs.length);
  })();

  const decideMut = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "approve" | "reject" }) =>
      api.post(`/api/v1/hrms/recruit/document-reviews/${id}`, { action: kind, reason: reason || undefined }),
    onSuccess: (_r, vars) => {
      toast.success(vars.kind === "approve" ? "Approved" : "Rejected");
      qc.invalidateQueries({ queryKey: ["doc-reviews"] });
      setDecision(null); setReason("");
    },
    onError: (e: unknown) => toast.error("Action failed", e instanceof Error ? e.message : undefined),
  });

  const stats = {
    total: items.length,
    pre:  items.filter((i) => i.request.bundle === "PreOffer").length,
    post: items.filter((i) => i.request.bundle === "PostOffer").length,
  };

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <FileCheck2 size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Candidate document reviews</h1>
            <p className="text-xs text-gray-500 mt-1">Approve or reject documents uploaded by candidates.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="candidate-documents" sheetName="Documents" columns={DOC_EXPORT_COLUMNS} rows={docExportRows} />
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[11px] font-semibold">
            <Inbox size={12} /> {stats.total} pending
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Pending" value={stats.total} icon={<Clock size={18} />} color="amber" />
        <StatCard label="Pre-offer" value={stats.pre} icon={<FileCheck2 size={18} />} color="blue" />
        <StatCard label="Post-offer" value={stats.post} icon={<FileCheck2 size={18} />} color="emerald" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <FilterIcon size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">Bundle</span>
          {(["all", "PreOffer", "PostOffer"] as const).map((b) => (
            <button key={b}
              onClick={() => setBundleFilter(b)}
              className={clsx("px-2.5 py-1 rounded-full text-[13px] font-semibold ring-1 transition",
                bundleFilter === b ? "bg-green-600 text-white ring-[#22c55e] shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
              {b === "all" ? "All" : b === "PreOffer" ? "Before Offer" : "After Offer"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-300" />
            <p className="text-[13px] font-semibold">No documents pending review</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => {
              const isOpen = expanded.has(g.appId);
              return (
                <li key={g.appId}>
                  {/* Candidate row — click to expand */}
                  <button
                    type="button"
                    onClick={() => toggle(g.appId)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition"
                  >
                    {isOpen
                      ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                      : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                      <User size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900">{g.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {g.email} · {g.role}{g.stage ? ` · ${g.stage}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {g.pre > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                          {g.pre} Before
                        </span>
                      )}
                      {g.post > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          {g.post} After
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        {g.docs.length} pending
                      </span>
                    </div>
                  </button>

                  {/* Documents — visible only when this candidate is expanded */}
                  {isOpen && (
                    <div className="bg-slate-50/40 border-t border-slate-100">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Document</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">File</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Bundle</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Uploaded</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.docs.map((i) => (
                            <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-white">
                              <td className="px-4 py-2.5 text-[13px]">
                                <p className="font-medium text-slate-800">{i.documentType?.name ?? i.customLabel ?? "Other"}</p>
                                {i.documentType?.isRequired && <span className="text-[10px] text-red-600 font-bold">Required</span>}
                                {!i.documentType && <span className="text-[10px] text-slate-400 italic">Candidate-added</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <a href={i.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline">
                                  <Paperclip size={12} /> {i.fileName}
                                </a>
                                {i.fileSize != null && <p className="text-[11px] text-slate-400">{Math.round(i.fileSize / 1024)} KB</p>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium ring-1",
                                  i.request.bundle === "PreOffer" ? "bg-green-50 text-green-700 ring-green-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200")}>
                                  {i.request.bundle === "PreOffer" ? "Before Offer" : "After Offer"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[11px] text-slate-500">
                                {new Date(i.uploadedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="inline-flex gap-1">
                                  <button
                                    onClick={() => { setReason(""); setDecision({ kind: "approve", row: i }); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                  ><CheckCircle2 size={12} /> Approve</button>
                                  <button
                                    onClick={() => { setReason(""); setDecision({ kind: "reject", row: i }); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                                  ><XCircle size={12} /> Reject</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!decision} onClose={() => !decideMut.isPending && setDecision(null)}
        title={decision?.kind === "approve" ? "Approve document" : "Reject document"} size="md">
        {decision && (
          <form onSubmit={(e) => { e.preventDefault(); decideMut.mutate({ id: decision.row.id, kind: decision.kind }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="font-semibold">{decision.row.request.application.candidate.firstName} {decision.row.request.application.candidate.lastName}</div>
              <div className="text-xs text-slate-500 mt-0.5">{decision.row.documentType?.name ?? decision.row.customLabel} · {decision.row.request.bundle === "PreOffer" ? "Before Offer" : "After Offer"}</div>
              <a href={decision.row.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#22c55e] hover:underline inline-flex items-center gap-1 mt-1"><Paperclip size={10} /> {decision.row.fileName}</a>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comment {decision.kind === "reject" && "(shown to candidate)"}</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={decision.kind === "approve" ? "Optional note…" : "Tell candidate what to fix…"}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDecision(null)} disabled={decideMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={decideMut.isPending}
                className={clsx("px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50",
                  decision.kind === "approve" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-500 to-rose-600")}>
                {decideMut.isPending ? "Saving…" : decision.kind === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: "blue" | "amber" | "emerald" }) {
  const cls = { blue: "bg-green-50 text-green-600", amber: "bg-amber-50 text-amber-600", emerald: "bg-emerald-50 text-emerald-600" }[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={clsx("w-11 h-11 rounded-lg flex items-center justify-center", cls)}>{icon}</div>
      <div>
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}
