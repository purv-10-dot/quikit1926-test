"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { FileText, Save, Upload, FileIcon, X, Loader2, Paperclip, AlertTriangle } from "lucide-react";

// Each uploaded supporting file. URL points at the proxy returned by
// POST /api/v1/hrms/uploads. label is optional free text e.g. "Rent
// Agreement", "80C — LIC premium receipt", "Boarding pass Apr 26".
interface Doc {
  url: string;
  name: string;
  size: number;
  type: string;
  label?: string | null;
  uploadedAt: string;
}

type DocSection = "hra" | "lta" | "homeLoan" | "chapterVIA";

interface Documents {
  hra?: Doc[];
  lta?: Doc[];
  homeLoan?: Doc[];
  chapterVIA?: Doc[];
}

interface Decl {
  id: string;
  financialYear: string;
  hraClaimed: boolean;
  rentPaid: string;
  landlordName: string | null;
  landlordPan: string | null;
  landlordAddress: string | null;
  ltaClaimed: boolean;
  ltaAmount: string;
  ltaDetails: string | null;
  homeLoanInterest: string;
  lenderName: string | null;
  lenderPan: string | null;
  lenderAddress: string | null;
  lenderType: "FinancialInstitution" | "Employer" | "Other" | null;
  section80C: string;
  section80CCC: string;
  section80CCD1: string;
  section80D: string;
  section80E: string;
  section80G: string;
  section80TTA: string;
  nps80CCD1B: string;
  otherDeductions: Record<string, number> | null;
  verificationPlace: string | null;
  verificationDate: string | null;
  verificationName: string | null;
  verificationDesignation: string | null;
  signedFileUrl: string | null;
  documents: Documents | null;
  status: "Submitted" | "Verified" | "Rejected";
}

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

// Mirror of the server superRefine in lib/validations/payroll.ts. Keep
// the rules in sync — the server is authoritative, this just saves a
// round-trip and lets us highlight fields. Returns dotted-path → message.
const HRA_PAN_RENT_THRESHOLD = 100000;

interface ValidationContext {
  hraClaimed: boolean;
  rentPaid: number;
  landlordName: string;
  landlordPan: string;
  landlordAddress: string;
  ltaClaimed: boolean;
  ltaAmount: number;
  homeLoanInterest: number;
  lenderName: string;
  lenderAddress: string;
  lenderPan: string;
  lenderType: string;
  chapterVIATotal: number;
  verificationName: string;
  verificationDesignation: string;
  verificationPlace: string;
  verificationDate: string;
  signedFileUrl: string;
  docs: Documents;
}

function validateForm12BB(c: ValidationContext): Record<string, string> {
  const errors: Record<string, string> = {};

  // Verification block + signed declaration — always required
  if (!c.verificationName.trim())        errors.verificationName = "Full name is required to verify the declaration";
  if (!c.verificationDesignation.trim()) errors.verificationDesignation = "Designation is required";
  if (!c.verificationPlace.trim())       errors.verificationPlace = "Place is required";
  if (!c.verificationDate.trim())        errors.verificationDate = "Date is required";
  if (!c.signedFileUrl.trim())           errors.signedFileUrl = "Upload a signed, scanned Form 12BB before submitting";

  // HRA — only when claimed
  if (c.hraClaimed) {
    if (!(c.rentPaid > 0))         errors.rentPaid        = "Annual rent paid is required when claiming HRA";
    if (!c.landlordName.trim())    errors.landlordName    = "Landlord name is required";
    if (!c.landlordAddress.trim()) errors.landlordAddress = "Landlord address is required";
    if (c.rentPaid > HRA_PAN_RENT_THRESHOLD && !c.landlordPan.trim()) {
      errors.landlordPan = `Landlord PAN is mandatory when annual rent exceeds ₹${HRA_PAN_RENT_THRESHOLD.toLocaleString("en-IN")}`;
    }
    if (!c.docs.hra || c.docs.hra.length === 0) {
      errors["documents.hra"] = "Attach at least one supporting document (rent agreement or receipt)";
    }
  }

  // LTA — only when claimed
  if (c.ltaClaimed) {
    if (!(c.ltaAmount > 0)) errors.ltaAmount = "LTA amount is required when claiming LTA";
    if (!c.docs.lta || c.docs.lta.length === 0) {
      errors["documents.lta"] = "Attach at least one travel proof (ticket or boarding pass)";
    }
  }

  // Home loan — only when amount > 0
  if (c.homeLoanInterest > 0) {
    if (!c.lenderName.trim())    errors.lenderName    = "Lender name is required when claiming home loan interest";
    if (!c.lenderAddress.trim()) errors.lenderAddress = "Lender address is required";
    if (!c.lenderType)           errors.lenderType    = "Lender type is required";
    if (c.lenderType === "FinancialInstitution" && !c.lenderPan.trim()) {
      errors.lenderPan = "Lender PAN is mandatory for financial institutions";
    }
    if (!c.docs.homeLoan || c.docs.homeLoan.length === 0) {
      errors["documents.homeLoan"] = "Attach the lender's provisional interest certificate";
    }
  }

  // Chapter VI-A — any sub-section claimed requires a proof
  if (c.chapterVIATotal > 0) {
    if (!c.docs.chapterVIA || c.docs.chapterVIA.length === 0) {
      errors["documents.chapterVIA"] = "Attach at least one investment proof for the Chapter VI-A deductions claimed";
    }
  }

  return errors;
}

// Friendly labels for the summary banner.
const FIELD_LABELS: Record<string, string> = {
  verificationName: "Verification — Full Name",
  verificationDesignation: "Verification — Designation",
  verificationPlace: "Verification — Place",
  verificationDate: "Verification — Date",
  signedFileUrl: "Signed Declaration",
  rentPaid: "HRA — Annual Rent",
  landlordName: "HRA — Landlord Name",
  landlordAddress: "HRA — Landlord Address",
  landlordPan: "HRA — Landlord PAN",
  "documents.hra": "HRA — Supporting Documents",
  ltaAmount: "LTA — Amount",
  "documents.lta": "LTA — Travel Proofs",
  lenderName: "Home Loan — Lender Name",
  lenderAddress: "Home Loan — Lender Address",
  lenderType: "Home Loan — Lender Type",
  lenderPan: "Home Loan — Lender PAN",
  "documents.homeLoan": "Home Loan — Interest Certificate",
  "documents.chapterVIA": "Chapter VI-A — Investment Proofs",
};

export default function Form12BBPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [fy, setFy] = useState(currentFY());

  const { data } = useQuery({
    queryKey: ["payroll", "form12bb", fy],
    queryFn: () => api.get<Decl[]>(`/api/v1/hrms/payroll/form12bb?fy=${fy}`),
  });
  const existing = data?.data?.[0] ?? null;

  const [form, setForm] = useState<Partial<Decl>>({});
  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      setForm({ financialYear: fy, documents: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, fy]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveMut = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post<Decl>("/api/v1/hrms/payroll/form12bb", b),
    onSuccess: () => {
      toast.success("Saved");
      setErrors({});
      qc.invalidateQueries({ queryKey: ["payroll", "form12bb"] });
    },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const num = (k: keyof Decl) => Number((form as Record<string, unknown>)[k] ?? 0);
  const str = (k: keyof Decl) => String((form as Record<string, unknown>)[k] ?? "");
  const numOrNull = (k: keyof Decl) => {
    const raw = (form as Record<string, unknown>)[k];
    if (raw === "" || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const setField = <K extends keyof Decl>(k: K, v: Decl[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setNumField = (k: keyof Decl, v: number | null) => setForm((p) => ({ ...p, [k]: v == null ? "" : String(v) }));

  // Bucket-scoped helpers for the documents column. The widget edits the
  // local form state — the actual file lives on S3 the moment it's uploaded;
  // saving the form just persists the metadata pointer.
  const docs = (form.documents ?? {}) as Documents;
  const setDocsBucket = (bucket: DocSection, next: Doc[]) =>
    setForm((p) => ({ ...p, documents: { ...((p.documents as Documents) ?? {}), [bucket]: next } }));

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]";

  const submit = () => {
    // Drop empty buckets so we send a clean object (or null when there's
    // nothing at all attached yet).
    const trimmedDocs = Object.fromEntries(
      Object.entries(docs).filter(([, v]) => Array.isArray(v) && v.length > 0),
    );
    const documentsPayload = Object.keys(trimmedDocs).length > 0 ? trimmedDocs : null;

    // Mandatory-evidence check before round-trip. Server enforces the same
    // rules via superRefine in upsertForm12BBSchema.
    const chapterVIATotal =
      num("section80C") + num("section80CCC") + num("section80CCD1") +
      num("section80D") + num("section80E") + num("section80G") +
      num("section80TTA") + num("nps80CCD1B");

    const found = validateForm12BB({
      hraClaimed: !!form.hraClaimed,
      rentPaid: num("rentPaid"),
      landlordName: str("landlordName"),
      landlordPan: str("landlordPan"),
      landlordAddress: str("landlordAddress"),
      ltaClaimed: !!form.ltaClaimed,
      ltaAmount: num("ltaAmount"),
      homeLoanInterest: num("homeLoanInterest"),
      lenderName: str("lenderName"),
      lenderAddress: str("lenderAddress"),
      lenderPan: str("lenderPan"),
      lenderType: str("lenderType"),
      chapterVIATotal,
      verificationName: str("verificationName"),
      verificationDesignation: str("verificationDesignation"),
      verificationPlace: str("verificationPlace"),
      verificationDate: str("verificationDate"),
      signedFileUrl: str("signedFileUrl"),
      docs,
    });

    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("Cannot submit yet", `${Object.keys(found).length} required field${Object.keys(found).length > 1 ? "s" : ""} missing`);
      // Scroll the summary banner into view.
      requestAnimationFrame(() => {
        document.getElementById("form12bb-errors")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setErrors({});

    saveMut.mutate({
      financialYear: fy,

      hraClaimed: !!form.hraClaimed,
      rentPaid: num("rentPaid"),
      landlordName: form.landlordName ?? null,
      landlordPan: form.landlordPan ?? null,
      landlordAddress: form.landlordAddress ?? null,

      ltaClaimed: !!form.ltaClaimed,
      ltaAmount: num("ltaAmount"),
      ltaDetails: form.ltaDetails ?? null,

      homeLoanInterest: num("homeLoanInterest"),
      lenderName: form.lenderName ?? null,
      lenderPan: form.lenderPan ?? null,
      lenderAddress: form.lenderAddress ?? null,
      lenderType: form.lenderType ?? null,

      section80C: num("section80C"),
      section80CCC: num("section80CCC"),
      section80CCD1: num("section80CCD1"),
      section80D: num("section80D"),
      section80E: num("section80E"),
      section80G: num("section80G"),
      section80TTA: num("section80TTA"),
      nps80CCD1B: num("nps80CCD1B"),
      otherDeductions: form.otherDeductions ?? null,

      verificationPlace: form.verificationPlace ?? null,
      verificationDate: form.verificationDate ?? null,
      verificationName: form.verificationName ?? null,
      verificationDesignation: form.verificationDesignation ?? null,

      signedFileUrl: form.signedFileUrl ?? null,
      documents: documentsPayload,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="text-[#16243A]" />
          <div>
            <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Form 12BB declaration</h1>
            <p className="text-sm text-gray-500">Declare investments + HRA + LTA + home loan interest for TDS computation. Attach supporting documents per Form 12BB.</p>
          </div>
        </div>
        <Select
          value={fy}
          onChange={setFy}
          options={Array.from({ length: 4 }, (_, i) => {
            const y = new Date().getFullYear() - i + 1;
            const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
            return { value: label, label: `FY ${label}` };
          })}
          className="w-40"
        />
      </div>

      <Section title="1. House Rent Allowance (HRA) Exemption">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.hraClaimed} onChange={(e) => setField("hraClaimed", e.target.checked)} />
          Claiming HRA exemption
        </label>
        {form.hraClaimed && (
          <>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Field label="Annual Rent Paid" required error={errors.rentPaid}>
                <NumberInput value={numOrNull("rentPaid")} onChange={(v) => setNumField("rentPaid", v)} className={inputCls} />
              </Field>
              <Field label="Landlord Name" required error={errors.landlordName}>
                <input value={str("landlordName")} onChange={(e) => setField("landlordName", e.target.value as never)} className={inputCls} />
              </Field>
              <Field label="Landlord PAN (required if rent > ₹1L)" error={errors.landlordPan}>
                <input value={str("landlordPan")} onChange={(e) => setField("landlordPan", e.target.value.toUpperCase() as never)} maxLength={10} className={inputCls + " font-mono"} />
              </Field>
              <Field label="Landlord Address" required error={errors.landlordAddress}>
                <input value={str("landlordAddress")} onChange={(e) => setField("landlordAddress", e.target.value as never)} className={inputCls} />
              </Field>
            </div>
            <DocList
              title="Supporting documents"
              hint="Rent agreement, monthly rent receipts, landlord PAN declaration (mandatory when annual rent > ₹1,00,000)."
              items={docs.hra ?? []}
              onChange={(next) => setDocsBucket("hra", next)}
              suggestedLabels={["Rent Agreement", "Rent Receipt", "Landlord PAN Declaration"]}
              required
              error={errors["documents.hra"]}
            />
          </>
        )}
      </Section>

      <Section title="2. Leave Travel Allowance (LTA)">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.ltaClaimed} onChange={(e) => setField("ltaClaimed", e.target.checked)} />
          Claiming LTA
        </label>
        {form.ltaClaimed && (
          <>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Field label="LTA Amount" required error={errors.ltaAmount}>
                <NumberInput value={numOrNull("ltaAmount")} onChange={(v) => setNumField("ltaAmount", v)} className={inputCls} />
              </Field>
              <Field label="Travel Details">
                <input value={str("ltaDetails")} onChange={(e) => setField("ltaDetails", e.target.value as never)} className={inputCls} />
              </Field>
            </div>
            <DocList
              title="Travel proofs"
              hint="Tickets, boarding passes, e-ticket PDFs for journeys in the block year."
              items={docs.lta ?? []}
              onChange={(next) => setDocsBucket("lta", next)}
              suggestedLabels={["Air Ticket", "Train Ticket", "Boarding Pass"]}
              required
              error={errors["documents.lta"]}
            />
          </>
        )}
      </Section>

      <Section title="3. Interest on Home Loan u/s 24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Interest Paid">
            <NumberInput value={numOrNull("homeLoanInterest")} onChange={(v) => setNumField("homeLoanInterest", v)} className={inputCls} />
          </Field>
          <Field label="Lender Name" required={num("homeLoanInterest") > 0} error={errors.lenderName}>
            <input value={str("lenderName")} onChange={(e) => setField("lenderName", e.target.value as never)} className={inputCls} />
          </Field>
          <Field label="Lender Type" required={num("homeLoanInterest") > 0} error={errors.lenderType}>
            <Select
              value={str("lenderType") || ""}
              onChange={(v) => setField("lenderType", (v || null) as never)}
              options={[
                { value: "", label: "— select —" },
                { value: "FinancialInstitution", label: "Financial Institution" },
                { value: "Employer", label: "Employer" },
                { value: "Other", label: "Other" },
              ]}
            />
          </Field>
          <Field label="Lender PAN" required={str("lenderType") === "FinancialInstitution"} error={errors.lenderPan}>
            <input value={str("lenderPan")} onChange={(e) => setField("lenderPan", e.target.value.toUpperCase() as never)} maxLength={10} className={inputCls + " font-mono"} />
          </Field>
          <Field label="Lender Address" wide required={num("homeLoanInterest") > 0} error={errors.lenderAddress}>
            <input value={str("lenderAddress")} onChange={(e) => setField("lenderAddress", e.target.value as never)} className={inputCls} placeholder="Required by Form 12BB row 3" />
          </Field>
        </div>
        <DocList
          title="Lender certificate"
          hint={`Provisional interest certificate from the bank / financial institution for FY ${fy}.`}
          items={docs.homeLoan ?? []}
          onChange={(next) => setDocsBucket("homeLoan", next)}
          suggestedLabels={["Interest Certificate", "Loan Sanction Letter", "Possession Letter"]}
          required={num("homeLoanInterest") > 0}
          error={errors["documents.homeLoan"]}
        />
      </Section>

      <Section title="4. Deductions under Chapter VI-A">
        <p className="text-[11px] text-gray-500 mb-2">
          (A) Sections 80C, 80CCC and 80CCD — combined cap ₹1.5 lakh
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="80C (LIC, PPF, ELSS, etc)">
            <NumberInput value={numOrNull("section80C")} onChange={(v) => setNumField("section80C", v)} className={inputCls} />
          </Field>
          <Field label="80CCC (Pension fund)">
            <NumberInput value={numOrNull("section80CCC")} onChange={(v) => setNumField("section80CCC", v)} className={inputCls} />
          </Field>
          <Field label="80CCD(1) (NPS — employee share within ₹1.5L)">
            <NumberInput value={numOrNull("section80CCD1")} onChange={(v) => setNumField("section80CCD1", v)} className={inputCls} />
          </Field>
        </div>

        <p className="text-[11px] text-gray-500 mt-4 mb-2">
          (B) Other sections under Chapter VI-A
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="80D (Health Insurance) — max ₹50K">
            <NumberInput value={numOrNull("section80D")} onChange={(v) => setNumField("section80D", v)} className={inputCls} />
          </Field>
          <Field label="80E (Education Loan)">
            <NumberInput value={numOrNull("section80E")} onChange={(v) => setNumField("section80E", v)} className={inputCls} />
          </Field>
          <Field label="80G (Donations)">
            <NumberInput value={numOrNull("section80G")} onChange={(v) => setNumField("section80G", v)} className={inputCls} />
          </Field>
          <Field label="80TTA (Savings Interest) — max ₹10K">
            <NumberInput value={numOrNull("section80TTA")} onChange={(v) => setNumField("section80TTA", v)} className={inputCls} />
          </Field>
          <Field label="80CCD(1B) (NPS extra) — max ₹50K">
            <NumberInput value={numOrNull("nps80CCD1B")} onChange={(v) => setNumField("nps80CCD1B", v)} className={inputCls} />
          </Field>
        </div>
        <DocList
          title="Investment proofs"
          hint="Receipts / statements for every section claimed above. Tag each file with the section it supports (e.g. '80C — LIC premium')."
          items={docs.chapterVIA ?? []}
          onChange={(next) => setDocsBucket("chapterVIA", next)}
          suggestedLabels={["80C — LIC", "80C — PPF", "80C — ELSS", "80D — Health Insurance", "80E — Education Loan", "80G — Donation", "80CCD(1B) — NPS"]}
          required={
            num("section80C") + num("section80CCC") + num("section80CCD1") +
            num("section80D") + num("section80E") + num("section80G") +
            num("section80TTA") + num("nps80CCD1B") > 0
          }
          error={errors["documents.chapterVIA"]}
        />
      </Section>

      <Section title="5. Verification (required)">
        <p className="text-[11px] text-gray-500 mb-2">
          I do hereby certify that the information given above is complete and correct.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Full Name" required error={errors.verificationName}>
            <input value={str("verificationName")} onChange={(e) => setField("verificationName", e.target.value as never)} className={inputCls} placeholder="As per PAN" />
          </Field>
          <Field label="Designation" required error={errors.verificationDesignation}>
            <input value={str("verificationDesignation")} onChange={(e) => setField("verificationDesignation", e.target.value as never)} className={inputCls} placeholder="e.g. Software Engineer" />
          </Field>
          <Field label="Place" required error={errors.verificationPlace}>
            <input value={str("verificationPlace")} onChange={(e) => setField("verificationPlace", e.target.value as never)} className={inputCls} placeholder="e.g. Indore" />
          </Field>
          <Field label="Date" required error={errors.verificationDate}>
            <input type="date" value={(str("verificationDate") || "").slice(0, 10)} onChange={(e) => setField("verificationDate", e.target.value as never)} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="6. Signed Declaration">
        <p className="text-[11px] text-gray-500 mb-2">
          Upload the scanned, signed Form 12BB. Single PDF/image. <span className="text-red-500">*</span>
        </p>
        <SingleDocUploader
          currentUrl={form.signedFileUrl ?? null}
          onChange={(url) => setField("signedFileUrl", url as never)}
          accept="application/pdf,image/*"
        />
        {errors.signedFileUrl && (
          <p className="mt-2 text-[11px] text-red-600 flex items-center gap-1">
            <AlertTriangle size={11} />{errors.signedFileUrl}
          </p>
        )}
      </Section>

      {Object.keys(errors).length > 0 && (
        <div id="form12bb-errors" className="rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">
                {Object.keys(errors).length} required item{Object.keys(errors).length > 1 ? "s" : ""} missing before submit
              </p>
              <p className="text-[11px] text-red-700 mt-0.5">
                Form 12BB is a sworn statutory declaration — every claim needs the corresponding evidence.
              </p>
            </div>
          </div>
          <ul className="text-xs text-red-700 list-disc pl-7 space-y-0.5">
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>
                <span className="font-semibold">{FIELD_LABELS[key] ?? key}:</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={submit} disabled={saveMut.isPending} className="btn btn-primary">
          <Save size={14} /> {saveMut.isPending ? "Saving…" : existing ? "Update Declaration" : "Submit Declaration"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, children, wide, error, required,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className={error ? "[&_input]:!border-red-400 [&_input]:focus:!ring-red-400" : ""}>
        {children}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1"><AlertTriangle size={11} />{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-file uploader with optional per-file label. Files hit S3 immediately
// (via /api/v1/hrms/uploads) so we hold real URLs in state; the declaration
// save only persists the metadata pointer.
// ---------------------------------------------------------------------------

function DocList({
  title, hint, items, onChange, suggestedLabels, required, error,
}: {
  title: string;
  hint?: string;
  items: Doc[];
  onChange: (next: Doc[]) => void;
  suggestedLabels?: string[];
  required?: boolean;
  error?: string;
}) {
  const api = useApiClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [labelForNext, setLabelForNext] = useState("");

  const handleSelect = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    setUploading(true);
    try {
      const additions: Doc[] = [];
      for (const file of Array.from(filesList)) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await api.upload<{ url: string; fileName: string; fileType: string; fileSize: number }>(
            "/api/v1/hrms/uploads",
            fd,
          );
          additions.push({
            url: res.data.url,
            name: res.data.fileName,
            size: res.data.fileSize,
            type: res.data.fileType,
            label: labelForNext.trim() || null,
            uploadedAt: new Date().toISOString(),
          });
        } catch (e) {
          toast.error(`Upload failed: ${file.name}`, (e as Error).message);
        }
      }
      if (additions.length > 0) {
        onChange([...items, ...additions]);
        setLabelForNext("");
        toast.success(`${additions.length} file${additions.length > 1 ? "s" : ""} uploaded`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className={`mt-4 rounded-md border border-dashed p-3 ${error ? "border-red-400 bg-red-50/40" : "border-gray-300 bg-gray-50/60"}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Paperclip size={12} /> {title}{required && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
          {error && (
            <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1 font-medium">
              <AlertTriangle size={11} />{error}
            </p>
          )}
        </div>
        <span className="text-[10px] text-gray-500">{items.length} file{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Existing files */}
      {items.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {items.map((doc, i) => (
            <li key={`${doc.url}-${i}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs">
              <FileIcon size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-gray-900 hover:text-blue-600 hover:underline truncate block"
                  title={doc.name}
                >
                  {doc.name}
                </a>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  {doc.label && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{doc.label}</span>}
                  <span>{formatSize(doc.size)}</span>
                  <span>·</span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="text-gray-400 hover:text-red-600 p-1"
                title="Remove"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add files */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="text"
          value={labelForNext}
          onChange={(e) => setLabelForNext(e.target.value)}
          placeholder="Tag for next upload (optional)"
          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A] bg-white"
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => handleSelect(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md font-semibold"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "Uploading…" : "Upload document"}
        </button>
      </div>

      {suggestedLabels && suggestedLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-gray-500 mr-1">Suggested tags:</span>
          {suggestedLabels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLabelForNext(l)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700"
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SingleDocUploader({
  currentUrl, onChange, accept,
}: {
  currentUrl: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
}) {
  const api = useApiClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleSelect = async (filesList: FileList | null) => {
    const file = filesList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ url: string; fileName: string }>("/api/v1/hrms/uploads", fd);
      onChange(res.data.url);
      setFileName(res.data.fileName);
      toast.success("Signed declaration uploaded");
    } catch (e) {
      toast.error("Upload failed", (e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {currentUrl ? (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2.5 py-2 text-xs">
          <FileIcon size={14} className="text-gray-400 shrink-0" />
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1 font-medium text-gray-900 hover:text-blue-600 hover:underline truncate"
          >
            {fileName ?? "Signed Form 12BB"}
          </a>
          <button
            type="button"
            onClick={() => { onChange(null); setFileName(null); }}
            className="text-gray-400 hover:text-red-600 p-1"
            title="Remove"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            onChange={(e) => handleSelect(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md font-semibold"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload signed PDF"}
          </button>
        </>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
