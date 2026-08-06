"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { X, Building2, IndianRupee, CalendarDays, FileText, Check, UploadCloud, Send, ArrowRight, ArrowLeft, Loader2, Eye } from "lucide-react";

// Minimal shape the wizard needs — structurally compatible with the pipeline's
// ApplicationItem. The offer's id is the application id (1:1).
export interface SendOfferApp {
  id: string;
  candidate: { firstName: string; lastName: string; email: string; expectedCTC?: string | null };
  requisition: { title: string };
  latestOffer: { id: string; status: string; designation: string; offeredCTC: string; joiningDate: string } | null;
}

type AmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";

interface TemplateComponent {
  amountType: AmountType;
  amountValue: string | number | null;
  component: { id: string; name: string; code: string; type: string; category: string };
}
interface SalaryTemplate {
  id: string;
  name: string;
  isDefault: boolean;
  components: TemplateComponent[];
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const money = (n: number) => `₹${INR.format(Math.round(n))}`;

const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Internship", "Temporary"];
const COMPENSATION_TYPES = ["Paid", "Stipend", "Unpaid"];
const PROBATION_OPTIONS = ["None", "1 month", "2 months", "3 months", "6 months"];
const WORK_MODES = ["Onsite", "Remote", "Hybrid"];

function calcMonthly(amountType: AmountType, amountValue: number, monthlyCTC: number, basicMonthly: number): number {
  switch (amountType) {
    case "Fixed": return amountValue;
    case "PercentOfCTC": return (monthlyCTC * amountValue) / 100;
    case "PercentOfBasic": return (basicMonthly * amountValue) / 100;
    case "PercentOfGross": return (monthlyCTC * amountValue) / 100;
    default: return 0;
  }
}

/** Split an annual CTC across a template's earning components (annual amounts).
 *  Non-Basic/known earnings are computed; the leftover lands on the FixedAllowance
 *  (or a synthetic "Special Allowance") so the rows always sum to the CTC. */
function splitCTC(template: SalaryTemplate | undefined, annualCTC: number): { name: string; annual: number }[] {
  if (!template || annualCTC <= 0) {
    if (!template) return [];
    return template.components
      .filter((c) => c.component.type === "Earning")
      .map((c) => ({ name: c.component.name, annual: 0 }));
  }
  const monthlyCTC = annualCTC / 12;
  const earnings = template.components.filter((c) => c.component.type === "Earning");
  const basic = earnings.find((c) => c.component.category === "Basic");
  const basicMonthly = basic ? calcMonthly(basic.amountType, Number(basic.amountValue ?? 0), monthlyCTC, 0) : 0;

  const rows: { name: string; annual: number }[] = [];
  let knownMonthly = 0;
  const fixedAllowance = earnings.find((c) => c.component.category === "FixedAllowance");
  for (const c of earnings) {
    if (c.component.category === "FixedAllowance") continue; // residual, handled below
    const m = calcMonthly(c.amountType, Number(c.amountValue ?? 0), monthlyCTC, basicMonthly);
    knownMonthly += m;
    rows.push({ name: c.component.name, annual: Math.round(m * 12) });
  }
  const residualMonthly = Math.max(0, monthlyCTC - knownMonthly);
  rows.push({ name: fixedAllowance?.component.name ?? "Special Allowance", annual: Math.round(residualMonthly * 12) });
  return rows;
}

const STEPS = [
  { key: "employment", label: "Employment", icon: Building2 },
  { key: "compensation", label: "Compensation", icon: IndianRupee },
  { key: "settings", label: "Settings & Dates", icon: CalendarDays },
  { key: "documents", label: "Documents", icon: FileText },
] as const;

export function SendOfferWizard({ app, onClose, onSent }: { app: SendOfferApp; onClose: () => void; onSent: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const isEdit = !!app.latestOffer;

  // Form state
  const [employmentType, setEmploymentType] = useState("Full Time");
  const [compensationType, setCompensationType] = useState("Paid");
  const [salaryStructureId, setSalaryStructureId] = useState("");
  const [annualCTC, setAnnualCTC] = useState<number>(
    app.latestOffer ? Number(app.latestOffer.offeredCTC) || 0 : app.candidate.expectedCTC ? Number(app.candidate.expectedCTC) : 0,
  );
  const [joiningBonus, setJoiningBonus] = useState(0);
  const [relocationBonus, setRelocationBonus] = useState(0);
  const [probationPeriod, setProbationPeriod] = useState("None");
  const [workMode, setWorkMode] = useState("Onsite");
  const [workLocation, setWorkLocation] = useState("");
  const [joiningDate, setJoiningDate] = useState(app.latestOffer ? new Date(app.latestOffer.joiningDate).toISOString().slice(0, 10) : "");
  const [expiresAt, setExpiresAt] = useState("");
  const [supportingDocs, setSupportingDocs] = useState<{ key: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ccInput, setCcInput] = useState("");
  const MAX_DOCS = 10;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ccEmails = ccInput.split(",").map((s) => s.trim()).filter(Boolean);
  const ccInvalid = ccEmails.filter((e) => !EMAIL_RE.test(e));

  const designation = app.latestOffer?.designation || app.requisition.title;

  const { data: templatesRes } = useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<SalaryTemplate[]>("/api/v1/hrms/payroll/salary-templates"),
  });
  const templates = templatesRes?.data ?? [];
  const selectedTemplate = templates.find((t) => t.id === salaryStructureId);

  // Prefill any saved wizard meta when editing an existing offer.
  const { data: existingOfferRes } = useQuery({
    queryKey: ["offer-detail", app.id],
    queryFn: () => api.get<{
      offeredComponents?: Record<string, unknown> | null;
      joiningBonus?: string | number | null;
      relocationBonus?: string | number | null;
      expiresAt?: string | null;
    }>(`/api/v1/hrms/recruit/offers/${app.id}`),
    enabled: isEdit,
  });
  useEffect(() => {
    const offer = existingOfferRes?.data;
    if (!offer) return;
    // Seed the top-level offer columns so editing shows the saved values.
    if (offer.joiningBonus != null) setJoiningBonus(Number(offer.joiningBonus) || 0);
    if (offer.relocationBonus != null) setRelocationBonus(Number(offer.relocationBonus) || 0);
    if (offer.expiresAt) setExpiresAt(new Date(offer.expiresAt).toISOString().slice(0, 10));

    const meta = offer.offeredComponents as Record<string, unknown> | null | undefined;
    if (!meta) return;
    if (typeof meta.employmentType === "string") setEmploymentType(meta.employmentType);
    if (typeof meta.compensationType === "string") setCompensationType(meta.compensationType);
    if (typeof meta.salaryStructureId === "string") setSalaryStructureId(meta.salaryStructureId);
    if (typeof meta.probationPeriod === "string") setProbationPeriod(meta.probationPeriod);
    if (typeof meta.workMode === "string") setWorkMode(meta.workMode);
    if (typeof meta.workLocation === "string") setWorkLocation(meta.workLocation);
    // Prefill supporting docs — array (current) or legacy single-doc.
    const docsMeta = Array.isArray(meta.supportingDocs)
      ? (meta.supportingDocs as { key: string; name?: string }[])
      : meta.supportingDoc && typeof meta.supportingDoc === "object"
        ? [meta.supportingDoc as { key: string; name?: string }]
        : [];
    if (docsMeta.length) setSupportingDocs(docsMeta.filter((d) => d?.key).map((d) => ({ key: d.key, name: d.name ?? d.key.split("/").pop() ?? "attachment" })));
  }, [existingOfferRes]);

  // Default to the org's default salary template once loaded.
  useEffect(() => {
    if (!salaryStructureId && templates.length) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSalaryStructureId(def.id);
    }
  }, [templates, salaryStructureId]);

  const breakdown = useMemo(() => splitCTC(selectedTemplate, annualCTC), [selectedTemplate, annualCTC]);

  async function handleUpload(files: FileList) {
    const list = Array.from(files);
    if (!list.length) return;
    if (supportingDocs.length + list.length > MAX_DOCS) {
      toast.error("Too many files", `You can attach up to ${MAX_DOCS} documents.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.upload<{ key: string; fileName: string }>("/api/v1/hrms/uploads", fd);
        setSupportingDocs((prev) => [...prev, { key: res.data.key, name: res.data.fileName }]);
      }
      toast.success(list.length > 1 ? `${list.length} files attached` : "Attached", list.map((f) => f.name).join(", "));
    } catch (e) {
      toast.error("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setUploading(false);
    }
  }

  const buildPayload = () => ({
    designation,
    offeredCTC: annualCTC,
    joiningDate,
    joiningBonus: joiningBonus || undefined,
    relocationBonus: relocationBonus || undefined,
    expiresAt: expiresAt || undefined,
    employmentType,
    compensationType,
    salaryStructureId: salaryStructureId || undefined,
    salaryTemplateName: selectedTemplate?.name,
    components: breakdown,
    probationPeriod,
    workMode,
    workLocation: workLocation || undefined,
    supportingDocs,
  });

  // Save the offer as a draft (idempotent): create it, or update if one already
  // exists — e.g. a draft left behind by a previous "Preview" click.
  const ensureSaved = async () => {
    const payload = buildPayload();
    if (isEdit) {
      await api.patch(`/api/v1/hrms/recruit/offers/${app.id}`, payload);
      return;
    }
    try {
      await api.post("/api/v1/hrms/recruit/offers", { ...payload, applicationId: app.id });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await api.patch(`/api/v1/hrms/recruit/offers/${app.id}`, payload);
      } else {
        throw e;
      }
    }
  };

  const sendMut = useMutation({
    mutationFn: async () => {
      await ensureSaved();
      // Email the letter (→ OfferSent).
      await api.post("/api/v1/hrms/mail/offer", { offerId: app.id, cc: ccEmails.length ? ccEmails : undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-apps"] });
      qc.invalidateQueries({ queryKey: ["offers"] });
      onSent();
    },
  });

  // Preview the exact letter that will be sent — saves the draft, then renders
  // the PDF with this candidate's data WITHOUT emailing them.
  const previewMut = useMutation({
    mutationFn: async () => {
      await ensureSaved();
      await api.downloadPost(
        "/api/v1/hrms/mail/offer",
        { offerId: app.id, preview: true },
        `Offer-Preview-${app.candidate.firstName ?? "candidate"}.pdf`,
      );
    },
  });

  const canNext = (() => {
    if (step === 0) return !!employmentType && !!compensationType;
    if (step === 1) return !!salaryStructureId && annualCTC > 0;
    if (step === 2) return !!joiningDate;
    return true;
  })();

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const initials = `${app.candidate.firstName?.[0] ?? ""}${app.candidate.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !sendMut.isPending && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-2xl mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Send Offer</h2>
          <button onClick={onClose} disabled={sendMut.isPending} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Candidate banner */}
          <div className="flex items-center gap-3 bg-slate-50 ring-1 ring-slate-100 rounded-xl px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 uppercase">{initials}</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900 truncate">{app.candidate.firstName} {app.candidate.lastName}</div>
              <div className="text-xs text-slate-500 truncate">{app.requisition.title} · {app.candidate.email}</div>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={s.key} className={clsx("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx("w-8 h-8 rounded-full flex items-center justify-center transition",
                      done ? "bg-emerald-500 text-white" : active ? "bg-emerald-500 text-white ring-4 ring-emerald-100" : "bg-slate-100 text-slate-400")}>
                      {done ? <Check size={15} /> : <Icon size={15} />}
                    </span>
                    <span className={clsx("text-xs font-semibold whitespace-nowrap", active || done ? "text-slate-800" : "text-slate-400")}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={clsx("h-0.5 flex-1 mx-2 rounded", done ? "bg-emerald-400" : "bg-slate-200")} />}
                </div>
              );
            })}
          </div>

          {/* Step body */}
          {step === 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><Building2 size={12} /> Employment Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                  <Select value={employmentType} onChange={setEmploymentType} options={EMPLOYMENT_TYPES.map((v) => ({ value: v, label: v }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Compensation Type</label>
                  <Select value={compensationType} onChange={setCompensationType} options={COMPENSATION_TYPES.map((v) => ({ value: v, label: v }))} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><IndianRupee size={12} /> Compensation</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Salary Template <span className="text-red-500">*</span></label>
                <Select value={salaryStructureId} onChange={setSalaryStructureId} placeholder="Select a template…" searchable
                  options={templates.map((t) => ({ value: t.id, label: t.name }))} />
                {templates.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No salary templates found. Create one in Payroll → Setup → Salary Templates.</p>}
              </div>

              {salaryStructureId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Annual CTC <span className="text-red-500">*</span></label>
                    <NumberInput value={annualCTC || null} onChange={(v) => setAnnualCTC(v ?? 0)}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="0" />
                    <p className="text-[11px] text-slate-400 mt-1">Enter the CTC — the template splits it into the components below.</p>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between bg-[#eef2ff] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Component</span><span>Annual Amount</span>
                    </div>
                    {breakdown.map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs">
                        <span className="text-slate-700">{row.name}</span>
                        <span className="text-slate-800 tabular-nums">{money(row.annual)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-xs font-semibold">
                      <span className="text-slate-900">Annual CTC</span>
                      <span className="text-slate-900 tabular-nums">{money(annualCTC)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Joining Bonus (optional)</label>
                      <NumberInput value={joiningBonus || null} onChange={(v) => setJoiningBonus(v ?? 0)}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Relocation Bonus (optional)</label>
                      <NumberInput value={relocationBonus || null} onChange={(v) => setRelocationBonus(v ?? 0)}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="0" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Building2 size={12} /> Employment Settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Probation Period</label>
                  <Select value={probationPeriod} onChange={setProbationPeriod} options={PROBATION_OPTIONS.map((v) => ({ value: v, label: v }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Work Mode</label>
                  <Select value={workMode} onChange={setWorkMode} options={WORK_MODES.map((v) => ({ value: v, label: v }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Work Location</label>
                  <input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} placeholder="e.g. Bangalore"
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pt-1"><CalendarDays size={12} /> Dates</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date <span className="text-red-500">*</span></label>
                  <input type="date" value={joiningDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Offer Valid Until</label>
                  <input type="date" value={expiresAt} min={joiningDate || new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><FileText size={12} /> Supporting Documents</p>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Attach documents (sent with the offer email) — up to {MAX_DOCS}</p>

                {supportingDocs.length > 0 && (
                  <ul className="space-y-1.5 mb-2">
                    {supportingDocs.map((doc, i) => (
                      <li key={`${doc.key}-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-100 px-3 py-2">
                        <FileText size={14} className="text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-700 truncate flex-1">{doc.name}</span>
                        <button type="button" onClick={() => setSupportingDocs((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-red-500 shrink-0" title="Remove">
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {supportingDocs.length < MAX_DOCS && (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl px-4 py-4 text-xs text-slate-500 cursor-pointer hover:border-emerald-400 hover:text-emerald-600 transition">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                    {uploading ? "Uploading…" : supportingDocs.length ? "Add another document" : "Upload PDF / image / DOCX"}
                    <input type="file" multiple accept=".pdf,.doc,.docx,image/*" className="hidden" disabled={uploading}
                      onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CC (optional)</label>
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  placeholder="hr@company.com, manager@company.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">Comma-separated emails to CC on the offer letter.</p>
                {ccInvalid.length > 0 && (
                  <p className="text-[11px] text-red-500 mt-1">Invalid email{ccInvalid.length > 1 ? "s" : ""}: {ccInvalid.join(", ")}</p>
                )}
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pt-1"><Check size={12} /> Review</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 bg-slate-50 ring-1 ring-slate-100 rounded-xl px-4 py-3.5 text-xs">
                <Review label="Employment" value={employmentType} />
                <Review label="Compensation" value={compensationType} />
                <Review label="Annual CTC" value={money(annualCTC)} />
                <Review label="Probation" value={probationPeriod} />
                <Review label="Work Mode" value={workLocation ? `${workMode} · ${workLocation}` : workMode} />
                <Review label="Joining Date" value={joiningDate ? new Date(joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          {step === 0 ? (
            <button onClick={onClose} disabled={sendMut.isPending}
              className="px-3 py-1.5 border border-slate-300 bg-white rounded-full text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          ) : (
            <button onClick={back} disabled={sendMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white rounded-full text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <ArrowLeft size={13} /> Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={!canNext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Next <ArrowRight size={13} /></button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => toast.promise(previewMut.mutateAsync(), { loading: "Generating preview…", success: "Preview ready", error: "Couldn't generate preview" })}
                disabled={previewMut.isPending || sendMut.isPending || !joiningDate || annualCTC <= 0 || !salaryStructureId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed">
                {previewMut.isPending ? <><Loader2 size={13} className="animate-spin" /> Preview…</> : <><Eye size={13} /> Preview letter</>}</button>
              <button onClick={() => toast.promise(sendMut.mutateAsync(), { loading: "Sending offer…", success: "Offer sent", error: "Couldn't send offer" })} disabled={sendMut.isPending || previewMut.isPending || !joiningDate || annualCTC <= 0 || !salaryStructureId || ccInvalid.length > 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {sendMut.isPending ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send</>}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xs font-semibold text-slate-800 truncate">{value || "—"}</div>
    </div>
  );
}
