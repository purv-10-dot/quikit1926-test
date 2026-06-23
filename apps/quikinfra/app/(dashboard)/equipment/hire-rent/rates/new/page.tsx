"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useMachinery, useVendors, useCustomers } from "@/hooks/use-masters";
import { useCreateHireRate } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const DIRECTIONS = [
  { value: "hire_in", label: "Hire-In (vendor → Quik)" },
  { value: "rent_out", label: "Rent-Out (Quik → customer)" },
];

const BASIS_OPTIONS = [
  { value: "hour", label: "Per Hour" },
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
];

const emptyForm = {
  direction: "rent_out",
  rateBasis: "hour",
  equipmentId: "",
  equipmentType: "",
  vendorId: "",
  customerId: "",
  rate: "",
  sacCode: "995463",
  gstPercent: "18",
  minGuaranteedQty: "",
  effectiveFrom: "",
};

export default function NewHireRatePage() {
  const router = useRouter();
  const createMutation = useCreateHireRate();
  const { data: machineryData } = useMachinery();
  const { data: vendorsData } = useVendors();
  const { data: customersData } = useCustomers();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const machinery = machineryData?.data ?? [];
  const vendors = vendorsData?.data ?? [];
  const customers = customersData?.data ?? [];

  const selectedMachine = useMemo(
    () => machinery.find((m) => m.id === form.equipmentId),
    [machinery, form.equipmentId],
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
    if (!form.rate || Number(form.rate) <= 0) next.rate = "Rate is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        direction: form.direction,
        rateBasis: form.rateBasis,
        equipmentId: form.equipmentId || null,
        equipmentType: form.equipmentType || selectedMachine?.type || null,
        vendorId: form.direction === "hire_in" ? form.vendorId || null : null,
        customerId: form.direction === "rent_out" ? form.customerId || null : null,
        rate: Number(form.rate),
        sacCode: form.sacCode || "995463",
        gstPercent: Number(form.gstPercent) || 18,
        minGuaranteedQty:
          form.minGuaranteedQty !== "" ? Number(form.minGuaranteedQty) : null,
        effectiveFrom: form.effectiveFrom || null,
      });
      router.push("/equipment/hire-rent");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save hire rate") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Add Hire Rate"
        subtitle="Hire-In (vendor) or Rent-Out (customer) rate card"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && (
            <p className="mb-4 text-sm text-red-600">{errors.form}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Direction" required error={errors.direction}>
              <select
                value={form.direction}
                onChange={(e) => set("direction", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {DIRECTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
            <Field label="Equipment (optional)">
              <select
                value={form.equipmentId}
                onChange={(e) => set("equipmentId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Specific machine</option>
                {machinery.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipment Type (optional)">
              <input
                value={form.equipmentType || selectedMachine?.type || ""}
                onChange={(e) => set("equipmentType", e.target.value)}
                placeholder="e.g. Excavator"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            {form.direction === "hire_in" ? (
              <Field label="Vendor">
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
            ) : (
              <Field label="Customer">
                <select
                  value={form.customerId}
                  onChange={(e) => set("customerId", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
            <Field label="SAC Code">
              <input
                value={form.sacCode}
                onChange={(e) => set("sacCode", e.target.value)}
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
            <Field label="Min Guaranteed Qty">
              <input
                type="number"
                min="0"
                value={form.minGuaranteedQty}
                onChange={(e) => set("minGuaranteedQty", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Effective From">
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => set("effectiveFrom", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/equipment/hire-rent")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              Save Rate
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
