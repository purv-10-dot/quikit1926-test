"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useMachinery, useVendors } from "@/hooks/use-masters";
import { useCreateHireInVerification } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const BASIS_OPTIONS = [
  { value: "hour", label: "Per Hour" },
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
];

const emptyForm = {
  equipmentId: "",
  vendorId: "",
  periodFrom: "",
  periodTo: "",
  rate: "",
  rateBasis: "hour",
  vendorClaimedQty: "",
  minGuaranteedQty: "",
  gstPercent: "18",
};

export default function NewHireInVerificationPage() {
  const router = useRouter();
  const createMutation = useCreateHireInVerification();
  const { data: machineryData } = useMachinery();
  const { data: vendorsData } = useVendors();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const machinery = machineryData?.data ?? [];
  const vendors = vendorsData?.data ?? [];

  const hiredMachines = useMemo(
    () => machinery.filter((m) => m.status !== "disposed"),
    [machinery],
  );

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.equipmentId) next.equipmentId = "Machine is required";
    if (!form.periodFrom) next.periodFrom = "Period From is required";
    if (!form.periodTo) next.periodTo = "Period To is required";
    if (!form.rate || Number(form.rate) <= 0) next.rate = "Rate is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        vendorId: form.vendorId || null,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        rate: Number(form.rate),
        rateBasis: form.rateBasis,
        vendorClaimedQty:
          form.vendorClaimedQty !== "" ? Number(form.vendorClaimedQty) : null,
        minGuaranteedQty:
          form.minGuaranteedQty !== "" ? Number(form.minGuaranteedQty) : null,
        gstPercent: Number(form.gstPercent) || 18,
        compute: true,
      });
      router.push("/equipment/hire-rent");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to compute verification") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Hire-In Verification"
        subtitle="Logged qty (approved logs) vs vendor-claimed → variance → payable"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && (
            <p className="mb-4 text-sm text-red-600">{errors.form}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Hired-In Machine" required error={errors.equipmentId}>
              <select
                value={form.equipmentId}
                onChange={(e) => set("equipmentId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select machine</option>
                {hiredMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner Vendor">
              <select
                value={form.vendorId}
                onChange={(e) => set("vendorId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Period From" required error={errors.periodFrom}>
              <input
                type="date"
                value={form.periodFrom}
                onChange={(e) => set("periodFrom", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Period To" required error={errors.periodTo}>
              <input
                type="date"
                value={form.periodTo}
                onChange={(e) => set("periodTo", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Rate Basis">
              <select
                value={form.rateBasis}
                onChange={(e) => set("rateBasis", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {BASIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rate ₹" required error={errors.rate}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) => set("rate", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Vendor Claimed Qty">
              <input
                type="number"
                min="0"
                value={form.vendorClaimedQty}
                onChange={(e) => set("vendorClaimedQty", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Min Guaranteed Qty">
              <input
                type="number"
                min="0"
                value={form.minGuaranteedQty}
                onChange={(e) => set("minGuaranteedQty", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="GST %">
              <input
                type="number"
                value={form.gstPercent}
                onChange={(e) => set("gstPercent", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Billable qty = max(logged from approved logs, min guaranteed). Variance =
            claimed − logged.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/equipment/hire-rent")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <TrendingUp className="h-4 w-4" />
              Compute
            </PrimaryButton>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
