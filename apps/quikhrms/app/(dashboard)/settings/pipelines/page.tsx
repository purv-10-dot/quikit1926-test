"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { Plus, Trash2, Pencil, Star, GripVertical, X, AlertTriangle, ChevronRight, Mail } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

type MailTemplate = "interview" | "offer-branded" | "offer-default" | "welcome" | "joining-letter" | null;

interface StageConfig {
  name: string;
  sendMail: boolean;
  mailTemplate: MailTemplate;
}

interface Pipeline {
  id: string;
  name: string;
  stages: StageConfig[];
  isDefault: boolean;
  requisitionCount?: number;
}

interface BrandingSettings {
  letterheadKey: string | null;
  signatureKey: string | null;
  sealKey: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
}

const STAGE_CATALOG: { value: string; label: string; description?: string }[] = [
  { value: "TechnicalInterview", label: "Technical Interview", description: "Engineering / skills evaluation" },
  { value: "TechnicalInterviewL1", label: "Technical Interview - L1", description: "First-level technical round" },
  { value: "TechnicalInterviewL2", label: "Technical Interview - L2", description: "Second-level technical round" },
  { value: "ManagerInterview", label: "Manager Interview", description: "Hiring manager round" },
  { value: "HODInterview", label: "HOD Interview", description: "Head of Department round" },
  { value: "HRInterview", label: "HR Interview", description: "HR / culture fit round" },
  { value: "PanelInterview", label: "Panel Interview", description: "Multi-interviewer panel" },
  { value: "Assessment", label: "Assessment", description: "Written / take-home test" },
  { value: "CaseStudy", label: "Case Study", description: "Case / problem-solving round" },
  { value: "GroupDiscussion", label: "Group Discussion", description: "Group / cohort round" },
  { value: "FinalRound", label: "Final Round", description: "Leadership / final approval" },
  { value: "ReferenceCheck", label: "Reference Check", description: "Verify references" },
  { value: "BackgroundCheck", label: "Background Check", description: "BGV verification" },
  { value: "JoiningLetter", label: "Joining Letter", description: "Issue appointment / joining letter" },
];

const REQUIRED_STAGES = ["Screening", "PhoneScreen", "HRInterview", "Offer", "Hired"] as const;
const isRequiredStage = (name: string) => REQUIRED_STAGES.some((r) => r.toLowerCase() === name.toLowerCase());

// "Screening" is the stage's internal name (required, stored as-is in
// existing pipelines) — only the displayed label reads "Source".
function stageLabel(name: string): string {
  if (name === "HRInterview") return "HR Interview";
  if (name === "Screening") return "Source";
  if (name === "Offer") return "Offered";
  return name.replace(/([A-Z])/g, " $1").trim();
}

function inferTemplate(name: string): MailTemplate {
  if (/interview|phonescreen|assessment|finalround/i.test(name)) return "interview";
  if (/offer/i.test(name)) return "offer-branded";
  if (/hired/i.test(name)) return "welcome";
  return null;
}

export default function PipelinesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState<{ open: boolean; item: Pipeline | null }>({ open: false, item: null });
  const [form, setForm] = useState<{ name: string; stages: StageConfig[]; isDefault: boolean }>({ name: "", stages: [], isDefault: false });
  const [newStage, setNewStage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Pipeline | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<Pipeline[]>("/api/v1/hrms/recruit/pipelines"),
  });

  const { data: brandingData } = useQuery({
    queryKey: ["branding-settings"],
    queryFn: () => api.get<BrandingSettings>("/api/v1/hrms/settings/branding"),
  });
  const branding = brandingData?.data;
  const hasBranding = !!(branding?.letterheadKey || branding?.signatureKey || branding?.sealKey || branding?.signatoryName);

  const createMut = useMutation({
    mutationFn: (body: { name: string; stages: StageConfig[]; isDefault: boolean }) =>
      api.post("/api/v1/hrms/recruit/pipelines", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipelines"] }); setModal({ open: false, item: null }); toast.success("Pipeline created"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pipeline> }) =>
      api.patch(`/api/v1/hrms/recruit/pipelines/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipelines"] }); setModal({ open: false, item: null }); toast.success("Pipeline updated"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/recruit/pipelines/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipelines"] }); setDeleteTarget(null); toast.success("Pipeline deleted"); },
    onError: () => { setDeleteTarget(null); },
  });

  const pipelines = data?.data ?? [];

  const openCreate = () => {
    const seed: StageConfig[] = [
      { name: "Screening", sendMail: false, mailTemplate: null },
      { name: "PhoneScreen", sendMail: false, mailTemplate: "interview" },
      { name: "HRInterview", sendMail: false, mailTemplate: "interview" },
      { name: "Offer", sendMail: false, mailTemplate: "offer-branded" },
      { name: "Hired", sendMail: false, mailTemplate: "welcome" },
    ];
    setForm({ name: "", stages: seed, isDefault: pipelines.length === 0 });
    setNewStage("");
    setModal({ open: true, item: null });
  };

  const openEdit = (p: Pipeline) => {
    const stages = p.stages.map((s) => ({ ...s }));
    for (const req of REQUIRED_STAGES) {
      if (stages.some((s) => s.name.toLowerCase() === req.toLowerCase())) continue;
      const cfg = { name: req, sendMail: false, mailTemplate: inferTemplate(req) };
      if (req === "Screening") stages.unshift(cfg);
      else if (req === "PhoneScreen") {
        // Phone Screen sits right after Source (Screening), before any other round.
        const screeningIdx = stages.findIndex((s) => s.name.toLowerCase() === "screening");
        if (screeningIdx >= 0) stages.splice(screeningIdx + 1, 0, cfg); else stages.unshift(cfg);
      } else if (req === "HRInterview") {
        const offerIdx = stages.findIndex((s) => /^(offer|hired)$/i.test(s.name));
        if (offerIdx >= 0) stages.splice(offerIdx, 0, cfg); else stages.push(cfg);
      } else stages.push(cfg);
    }
    setForm({ name: p.name, stages, isDefault: p.isDefault });
    setNewStage("");
    setModal({ open: true, item: p });
  };

  const addStage = (name: string) => {
    const s = name.trim();
    if (!s) return;
    if (form.stages.some((x) => x.name.toLowerCase() === s.toLowerCase())) {
      toast.warning("Stage already exists");
      return;
    }
    // Insert before Offer (or at end if Offer missing) — keep Screening first, Offer/Hired last.
    const offerIdx = form.stages.findIndex((x) => x.name.toLowerCase() === "offer");
    const insertAt = offerIdx >= 0 ? offerIdx : form.stages.length;
    const next = [...form.stages];
    next.splice(insertAt, 0, { name: s, sendMail: false, mailTemplate: inferTemplate(s) });
    setForm({ ...form, stages: next });
    setNewStage("");
  };

  const removeStage = (idx: number) => {
    const s = form.stages[idx];
    if (!s || isRequiredStage(s.name)) {
      toast.warning("Required stage", `${s?.name} is required and cannot be removed.`);
      return;
    }
    setForm({ ...form, stages: form.stages.filter((_, i) => i !== idx) });
  };

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...form.stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setForm({ ...form, stages: next });
  };

  const updateStage = (idx: number, patch: Partial<StageConfig>) => {
    const next = [...form.stages];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, stages: next });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name required");
    if (form.stages.length < 2) return toast.error("At least 2 stages required");

    const missing = REQUIRED_STAGES.filter((r) => !form.stages.some((s) => s.name.toLowerCase() === r.toLowerCase()));
    if (missing.length) return toast.error("Required stages missing", missing.join(", "));

    const usesBranded = form.stages.some((s) => s.sendMail && s.mailTemplate === "offer-branded");
    if (usesBranded && !hasBranding) {
      return toast.error(
        "Branding template not set",
        "Set up letterhead / signature in Settings → Branding before enabling 'My Branded PDF'.",
      );
    }

    const body = { name: form.name.trim(), stages: form.stages, isDefault: form.isDefault };
    if (modal.item) updateMut.mutate({ id: modal.item.id, body });
    else createMut.mutate(body);
  };

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Hiring Pipelines</h1>
          <p className="text-xs text-gray-500 mt-1">Define stages. Toggle auto-mail per stage. Mark one as default.</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
          <Plus size={13} /> New Pipeline
        </button>
      </div>

      {isLoading ? (
        <SkeletonCards count={4} />
      ) : pipelines.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">No pipelines. Click New Pipeline to create one.</div>
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-gray-900">{p.name}</h3>
                  {p.isDefault && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      <Star size={10} className="fill-current" /> Default
                    </span>
                  )}
                  <span className="text-xs text-gray-400">· {p.stages.length} stages</span>
                </div>
                <div className="flex items-center gap-2">
                  {!p.isDefault && (
                    <button onClick={() => updateMut.mutate({ id: p.id, body: { isDefault: true } })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 shadow-sm">
                      <Star size={11} /> Set Default
                    </button>
                  )}
                  <button onClick={() => openEdit(p)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#bbf7d0] hover:bg-[#dcfce7] shadow-sm">
                    <Pencil size={11} /> Edit
                  </button>
                  {(() => {
                    const inUseCount = p.requisitionCount ?? 0;
                    const blocked = p.isDefault || inUseCount > 0;
                    const blockTitle = p.isDefault
                      ? "Default pipeline — cannot be deleted"
                      : inUseCount > 0
                        ? `${inUseCount} active requisition${inUseCount === 1 ? "" : "s"} use this pipeline. Reassign first.`
                        : undefined;
                    return (
                      <button onClick={() => setDeleteTarget(p)} disabled={blocked}
                        title={blockTitle}
                        className={clsx("inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-sm",
                          blocked
                            ? "bg-slate-50 text-slate-400 ring-1 ring-slate-200 cursor-not-allowed"
                            : "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100")}>
                        <Trash2 size={11} /> Delete
                        {inUseCount > 0 && !p.isDefault && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">{inUseCount} in use</span>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-4">
                {p.stages.map((s, i) => (
                  <span key={`${p.id}-${i}`} className="inline-flex items-center gap-1.5">
                    <span className={clsx(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ring-1",
                      s.sendMail
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-300"
                        : "bg-[#dcfce7] text-[#16a34a] ring-[#22c55e]")}>
                      <span className={clsx("w-4 h-4 rounded-full bg-white text-[10px] font-bold inline-flex items-center justify-center ring-1",
                        s.sendMail ? "ring-emerald-400 text-emerald-700" : "ring-[#22c55e] text-[#22c55e]")}>{i + 1}</span>
                      {stageLabel(s.name)}
                      {s.sendMail && <Mail size={10} className="ml-0.5" />}
                    </span>
                    {i < p.stages.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Pipeline" : "New Pipeline"} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pipeline Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Engineering Hiring Pipeline"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Stages <span className="text-red-500">*</span></label>
              <span className="text-[11px] text-gray-400">{form.stages.length} stage{form.stages.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2 mb-3">
              {form.stages.map((s, i) => {
                return (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} className="text-slate-400" />
                      <span className="w-6 h-6 rounded-full bg-[#dcfce7] text-[#16a34a] text-[11px] font-medium inline-flex items-center justify-center">{i + 1}</span>
                      <span className="flex-1 text-[13px] text-gray-800 font-semibold">{stageLabel(s.name)}</span>

                      <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0}
                        className="p-1 hover:bg-slate-200 rounded disabled:opacity-30">▲</button>
                      <button type="button" onClick={() => moveStage(i, 1)} disabled={i === form.stages.length - 1}
                        className="p-1 hover:bg-slate-200 rounded disabled:opacity-30">▼</button>
                      {isRequiredStage(s.name) ? (
                        <span className="p-1 text-slate-300 cursor-not-allowed" title="Required stage — cannot be removed">
                          <X size={12} />
                        </span>
                      ) : (
                        <button type="button" onClick={() => removeStage(i)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={12} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              {form.stages.length === 0 && (
                <div className="text-xs text-gray-400 italic px-2">No stages yet. Add one below.</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={newStage}
                  onChange={(v) => {
                    if (v) { addStage(v); }
                  }}
                  placeholder="+ Add a stage from catalog..."
                  searchable
                  options={STAGE_CATALOG
                    .filter((o) => !form.stages.some((x) => x.name.toLowerCase() === o.value.toLowerCase()))
                    .map((o) => ({ value: o.value, label: o.label, description: o.description }))}
                />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Pick from catalog — custom stage names are disabled. Source, Phone Screen, HR Interview, Offer and Hired are required and always present.</p>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <input type="checkbox" id="isDefault" checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="rounded border-amber-300" />
            <label htmlFor="isDefault" className="text-xs text-amber-800 cursor-pointer">
              Set as default pipeline <span className="text-[11px] text-amber-600">(used for new requisitions)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
              {modal.item ? (updateMut.isPending ? "Saving..." : "Save Changes") : (createMut.isPending ? "Creating..." : "Create Pipeline")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !deleteMut.isPending && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Delete Pipeline?</h3>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Delete <span className="font-semibold text-slate-700">&quot;{deleteTarget.name}&quot;</span>? This cannot be undone.
                  </p>
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Pipelines with active requisitions or candidates in them are blocked from deletion on the server. Reassign those requisitions first.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Keep</button>
              <button type="button" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                {deleteMut.isPending ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
