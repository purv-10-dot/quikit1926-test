"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormActions, FormField, FormFullRow, FormGrid } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from "@/lib/validators/campaign";

function formatInr(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CampaignCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(CAMPAIGN_TYPES[0]);
  const [status, setStatus] = useState<string>("Draft");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const budgetNum = budget.trim() === "" ? null : Number(budget);
  const budgetPreview =
    budgetNum != null && Number.isFinite(budgetNum) && budgetNum > 0
      ? formatInr(budgetNum)
      : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (budget.trim() !== "" && (Number.isNaN(budgetNum) || (budgetNum ?? 0) < 0)) {
      errs.budget = "Enter a valid budget amount";
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      errs.endDate = "End date must be on or after start date";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: type || null,
          status: status || "Draft",
          startDate: startDate || null,
          endDate: endDate || null,
          budget: budget.trim() === "" ? null : budgetNum,
          description: description.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not create campaign");
      }
      toast.success("Campaign created");
      const id = typeof json.id === "string" ? json.id : null;
      router.push(id ? `/marketing/campaigns/${id}` : "/marketing/campaigns");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create campaign";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="crm-card p-4 sm:p-6">
      <Link
        href="/marketing/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm text-crm-muted hover:text-crm-text"
      >
        <ArrowLeft size={14} />
        Back to campaigns
      </Link>

      <FormGrid cols={2}>
        <FormField label="Name" required error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali Offer"
            autoFocus
          />
        </FormField>

        <FormField label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Budget"
          error={errors.budget}
          help={budgetPreview ? `Preview: ${budgetPreview}` : "Amount in INR (e.g. 50000 for ₹50,000)"}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-crm-muted">
              ₹
            </span>
            <Input
              type="number"
              min={0}
              step={1}
              className="pl-7"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="50000"
            />
          </div>
        </FormField>

        <FormField label="Start date">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>

        <FormField label="End date" error={errors.endDate}>
          <Input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </FormField>

        <FormFullRow>
          <FormField label="Description">
            <textarea
              className="crm-input min-h-28 w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Campaign goals, audience, offer details…"
            />
          </FormField>
        </FormFullRow>
      </FormGrid>

      <FormActions className="mt-6" error={formError}>
        <Link href="/marketing/campaigns" className="crm-btn-secondary text-center">
          Cancel
        </Link>
        <Button type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create campaign"}
        </Button>
      </FormActions>
    </form>
  );
}
