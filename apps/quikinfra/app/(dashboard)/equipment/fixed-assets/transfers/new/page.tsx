"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useAssets, useProjects } from "@/hooks/use-masters";
import { useCreateFixedAssetTransfer } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

export default function NewAssetTransferPage() {
  const router = useRouter();
  const createMutation = useCreateFixedAssetTransfer();
  const { data: assetsData } = useAssets();
  const { data: projectsData } = useProjects();

  const [form, setForm] = useState({
    assetId: "",
    destinationProjectId: "",
    destinationLocation: "",
    quantity: "1",
    transferDate: new Date().toISOString().slice(0, 10),
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];
  const projects = projectsData?.data ?? [];

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Asset is required";
    if (!form.destinationProjectId) next.destinationProjectId = "Destination is required";
    if (!form.transferDate) next.transferDate = "Transfer date is required";
    if (!form.quantity || Number(form.quantity) <= 0) next.quantity = "Quantity is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        assetId: form.assetId,
        destinationProjectId: form.destinationProjectId,
        destinationLocation: form.destinationLocation || null,
        quantity: Number(form.quantity),
        transferDate: form.transferDate,
        reason: form.reason || null,
      });
      router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to dispatch transfer") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New Asset Transfer"
        subtitle="Generates a gate pass; destination acknowledges to relocate the asset"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && <p className="mb-4 text-sm text-red-600">{errors.form}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Asset" required error={errors.assetId} className="md:col-span-2">
              <select value={form.assetId} onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Destination Project" required error={errors.destinationProjectId}>
              <select value={form.destinationProjectId} onChange={(e) => setForm((p) => ({ ...p, destinationProjectId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Destination Location">
              <input value={form.destinationLocation} onChange={(e) => setForm((p) => ({ ...p, destinationLocation: e.target.value }))} placeholder="Store / yard" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="Quantity" required error={errors.quantity}>
              <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="Transfer Date" required error={errors.transferDate}>
              <input type="date" value={form.transferDate} onChange={(e) => setForm((p) => ({ ...p, transferDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="Reason" className="md:col-span-2">
              <textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => router.push("/equipment/fixed-assets")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <Truck className="h-4 w-4" />
              Dispatch
            </PrimaryButton>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({ label, required, error, children, className }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
