"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { EmptyState } from "@/components/hrms/empty-state";
import { Skeleton, SkeletonSwap } from "@/components/hrms/skeleton";
import {
  FileText, Plus, Upload, ShieldCheck, AlertTriangle, Pencil, Trash2,
  RefreshCw, CheckCircle2, Clock, Archive, Loader2, Sparkles,
} from "lucide-react";
import { clsx } from "clsx";

function PolicyListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y fade-in-content">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4">
          <Skeleton className="w-10 h-10" rounded="lg" variant="brand" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-40 h-3.5" rounded="sm" />
              <Skeleton className="w-8 h-3" rounded="sm" />
              <Skeleton className="w-20 h-4" rounded="md" />
            </div>
            <Skeleton className="w-72 h-2.5" rounded="sm" />
          </div>
          <Skeleton className="w-20 h-7" rounded="md" />
          <Skeleton className="w-7 h-7" rounded="md" />
        </div>
      ))}
    </div>
  );
}

interface LeavePolicyDoc {
  id: string;
  name: string;
  version: number;
  status: "Draft" | "PendingReview" | "Active" | "Archived";
  description: string | null;
  sourceFileName: string | null;
  sourceFileType: string | null;
  sourceFileUrl: string | null;
  extractedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FullPolicy extends LeavePolicyDoc {
  extractedRules: unknown;
  approvedRules: unknown;
  extractionLog: unknown;
}

const STATUS_STYLE: Record<LeavePolicyDoc["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  Draft: { label: "Draft", cls: "bg-gray-100 text-gray-700", icon: <Clock size={12} /> },
  PendingReview: { label: "Pending Review", cls: "bg-amber-100 text-amber-700 badge-pulse-amber", icon: <AlertTriangle size={12} /> },
  Active: { label: "Active", cls: "bg-emerald-100 text-emerald-700 badge-pulse-emerald", icon: <CheckCircle2 size={12} /> },
  Archived: { label: "Archived", cls: "bg-gray-100 text-gray-500", icon: <Archive size={12} /> },
};

export default function LeavePolicyDocumentsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();

  const [showCreate, setShowCreate] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leave-policies"],
    queryFn: () => api.get<LeavePolicyDoc[]>("/api/v1/hrms/leaves/policies?limit=100"),
  });

  const policies: LeavePolicyDoc[] = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/leaves/policies/${id}`),
    onSuccess: () => {
      toast.success("Policy archived");
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#16243A]">Leave Policy Documents</h1>
          <p className="text-sm text-gray-500">Upload company leave policy. AI extracts rules. HR reviews and activates.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16243A] text-white px-4 py-2 text-sm font-medium hover:bg-[#0e1a2e]"
        >
          <Plus size={16} /> New Policy
        </button>
      </div>

      <SkeletonSwap loading={isLoading} skeleton={<PolicyListSkeleton rows={5} />}>
      {policies.length === 0 ? (
        <EmptyState
          variant="folder"
          title="No policy documents yet"
          description="Upload your company leave policy PDF/DOCX and let AI extract the rules. HR can then review and activate."
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16243A] text-white px-4 py-2 text-sm font-medium hover:bg-[#0e1a2e]"
            >
              <Plus size={16} /> Create Policy
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y">
          {policies.map((p, i) => {
            const style = STATUS_STYLE[p.status];
            return (
              <div
                key={p.id}
                className="row-stagger p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                style={{ ["--i" as never]: Math.min(i, 10) }}
              >
                <div className="w-10 h-10 rounded-lg bg-[#16243A]/10 text-[#16243A] flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{p.name}</span>
                    <span className="text-xs text-gray-500">v{p.version}</span>
                    <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", style.cls)}>
                      {style.icon}{style.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {p.sourceFileName ? <>File: {p.sourceFileName} · </> : null}
                    {p.extractedAt ? <>Extracted {new Date(p.extractedAt).toLocaleDateString()} · </> : null}
                    {p.effectiveFrom ? <>Effective {new Date(p.effectiveFrom).toLocaleDateString()}</> : <>No effective date</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReviewId(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={12} /> Review
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Archive policy?",
                        description: `"${p.name}" will be archived and the rule engine will stop reading it.`,
                        confirmLabel: "Archive",
                        variant: "danger",
                      });
                      if (ok) deleteMutation.mutate(p.id);
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </SkeletonSwap>

      {showCreate && (
        <CreatePolicyModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setReviewId(id);
            qc.invalidateQueries({ queryKey: ["leave-policies"] });
          }}
        />
      )}

      {reviewId && (
        <ReviewPolicyModal
          policyId={reviewId}
          onClose={() => setReviewId(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["leave-policies"] })}
        />
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────

function CreatePolicyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const api = useApiClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/v1/hrms/leaves/policies", {
        name, description: description || undefined,
      }),
    onSuccess: (res) => {
      toast.success("Policy created. Upload the document to start extraction.");
      onCreated(res.data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title="New Leave Policy" headerIcon={<FileText size={18} />} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. India Leave Policy FY26"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16243A]/20"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16243A]/20"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16243A] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="animate-spin" size={14} />} Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Review / extract / approve modal ─────────────────────

function ReviewPolicyModal({ policyId, onClose, onSaved }: { policyId: string; onClose: () => void; onSaved: () => void }) {
  const api = useApiClient();
  const toast = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["leave-policy", policyId],
    queryFn: () => api.get<FullPolicy>(`/api/v1/hrms/leaves/policies/${policyId}`),
  });

  const policy = data?.data;
  const [rulesText, setRulesText] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");
  const [activeRules, setActiveRules] = useState<unknown>(null);

  // Hydrate textarea + effectiveFrom when policy loads
  const policyKey = policy?.id;
  const policyUpdatedAt = policy?.updatedAt;
  useMemo(() => {
    if (!policy) return;
    const rules = policy.approvedRules ?? policy.extractedRules ?? { schemaVersion: 1, leaveTypes: [] };
    setRulesText(JSON.stringify(rules, null, 2));
    setActiveRules(rules);
    setEffectiveFrom(policy.effectiveFrom ? policy.effectiveFrom.slice(0, 10) : "");
  }, [policyKey, policyUpdatedAt]);

  const extract = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.upload<{ policy: FullPolicy }>(
        `/api/v1/hrms/leaves/policies/${policyId}/extract`,
        fd,
      );
    },
    onSuccess: () => {
      toast.success("Extraction complete. Review the parsed rules.");
      refetch();
      onSaved();
    },
    onError: (e: Error) => toast.error(`Extraction failed: ${e.message}`),
  });

  const approve = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try { parsed = JSON.parse(rulesText); } catch { throw new Error("Rules JSON is invalid"); }
      return api.post(`/api/v1/hrms/leaves/policies/${policyId}/approve`, {
        approvedRules: parsed,
        effectiveFrom: effectiveFrom || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Policy activated. New leave requests will be validated against these rules.");
      onSaved(); // refresh the parent list
      onClose(); // dismiss the review modal — approve is the terminal action
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try { parsed = JSON.parse(rulesText); } catch { throw new Error("Rules JSON is invalid"); }
      return api.patch(`/api/v1/hrms/leaves/policies/${policyId}`, {
        approvedRules: parsed,
        status: policy?.status === "Active" ? undefined : "PendingReview",
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      refetch();
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={policy?.name ?? "Loading…"} headerIcon={<ShieldCheck size={18} />} size="3xl">
      <SkeletonSwap
        loading={isLoading || !policy}
        skeleton={
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="w-24 h-5" rounded="md" />
              <Skeleton className="w-8 h-3" rounded="sm" />
              <Skeleton className="w-40 h-3" rounded="sm" />
            </div>
            <Skeleton className="w-full h-14" rounded="lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="w-full h-64" rounded="lg" />
              <Skeleton className="w-full h-64" rounded="lg" />
            </div>
          </div>
        }
      >
      {!policy ? null : (
        <div className="space-y-4">
          {/* Status + meta */}
          <div className="flex items-center gap-3 text-xs">
            <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium", STATUS_STYLE[policy.status].cls)}>
              {STATUS_STYLE[policy.status].icon}{STATUS_STYLE[policy.status].label}
            </span>
            <span className="text-gray-500">v{policy.version}</span>
            {policy.approvedAt && <span className="text-gray-500">Approved {new Date(policy.approvedAt).toLocaleString()}</span>}
          </div>

          {/* Upload */}
          <UploadBox
            uploading={extract.isPending}
            currentFile={policy.sourceFileName}
            onPick={(file) => extract.mutate(file)}
          />

          {/* Side-by-side: source preview placeholder + editable rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                <FileText size={12} /> Source document
              </div>
              {policy.sourceFileUrl ? (
                <a href={policy.sourceFileUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline break-all">
                  {policy.sourceFileName ?? "Open document"}
                </a>
              ) : (
                <div className="text-xs text-gray-500">Upload a document above to extract rules.</div>
              )}
              {Boolean(policy.extractionLog) && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-600 cursor-pointer">Extraction log</summary>
                  <pre className="text-[10px] text-gray-600 mt-1 whitespace-pre-wrap">
                    {JSON.stringify(policy.extractionLog, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                <Sparkles size={12} /> Parsed rules (editable JSON)
              </div>
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full font-mono text-[11px] rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#16243A]/20"
              />
            </div>
          </div>

          <div className="flex items-end gap-3 pt-2 border-t border-gray-100">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Effective from</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                onClick={() => saveDraft.mutate()}
                disabled={saveDraft.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saveDraft.isPending && <Loader2 className="animate-spin" size={14} />} Save Draft
              </button>
              <button
                onClick={() => approve.mutate()}
                disabled={approve.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {approve.isPending ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                Approve & Activate
              </button>
            </div>
          </div>
        </div>
      )}
      </SkeletonSwap>
    </Modal>
  );
}

function UploadBox({ onPick, uploading, currentFile }: { onPick: (f: File) => void; uploading: boolean; currentFile: string | null }) {
  return (
    <label className={clsx(
      "flex items-center justify-between gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition",
      uploading ? "border-gray-200 bg-gray-50" : "border-gray-300 hover:border-[#16243A] hover:bg-gray-50",
    )}>
      <div className="flex items-center gap-3">
        {uploading ? (
          <Loader2 className="animate-spin text-gray-500" size={20} />
        ) : (
          <Upload className="text-gray-500" size={20} />
        )}
        <div>
          <div className="text-sm font-medium text-gray-800">
            {uploading ? "Extracting rules with AI…" : currentFile ? "Re-upload to re-extract" : "Upload leave policy document"}
          </div>
          <div className="text-xs text-gray-500">PDF, DOCX, or image. Max 15 MB.</div>
        </div>
      </div>
      <span className="text-xs text-gray-500">{currentFile ?? "No file uploaded yet"}</span>
      <input
        type="file"
        className="hidden"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg,image/webp,text/plain"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
