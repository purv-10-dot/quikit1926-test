"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useAssets } from "@/hooks/use-masters";
import { useCreateFixedAssetRepair } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

export default function OpenRepairPage() {
  const router = useRouter();
  const createMutation = useCreateFixedAssetRepair();
  const { data: assetsData } = useAssets();

  const [form, setForm] = useState({
    assetId: "",
    quantity: "1",
    repairCost: "0",
    problem: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Asset is required";
    if (!form.quantity || Number(form.quantity) <= 0) next.quantity = "Quantity is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        assetId: form.assetId,
        quantity: Number(form.quantity),
        repairCost: Number(form.repairCost) || 0,
        problem: form.problem || null,
      });
      router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to open repair") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Open Repair"
        subtitle="Moves quantity into Under-Repair until closed"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer>
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && <p className="mb-4 text-sm text-red-600">{errors.form}</p>}
          <div className="grid gap-4">
            <Field label="Asset" required error={errors.assetId}>
              <select value={form.assetId} onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Quantity" required error={errors.quantity}>
                <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Repair Cost">
                <input type="number" min="0" value={form.repairCost} onChange={(e) => setForm((p) => ({ ...p, repairCost: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Problem">
              <input value={form.problem} onChange={(e) => setForm((p) => ({ ...p, problem: e.target.value }))} placeholder="e.g. bent frame" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => router.push("/equipment/fixed-assets")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <Wrench className="h-4 w-4" />
              Open
            </PrimaryButton>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
