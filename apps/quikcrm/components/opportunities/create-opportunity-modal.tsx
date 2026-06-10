"use client";

import { useEffect, useState } from "react";
import { NumberInput, DateInput, Select, Field } from "@quikit/ui";
import type { CrmOpportunityStage } from "@quikit/database";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/lib/services/opportunities/stage-labels";

export interface CreateOpportunityResult {
  opportunityId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactFullName: string;
  accountId: string;
  accountName: string;
  onSuccess: (result: CreateOpportunityResult) => void;
}

function defaultCloseDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function CreateOpportunityModal({
  open,
  onClose,
  contactId,
  contactFullName,
  accountId: _accountId,
  accountName,
  onSuccess,
}: Props) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [closeDate, setCloseDate] = useState("");
  const [stage, setStage] = useState<CrmOpportunityStage>("Prospecting");
  const [titleError, setTitleError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(accountName ? `${accountName} Deal` : "");
    setAmount(null);
    setCloseDate(defaultCloseDate());
    setStage("Prospecting");
    setTitleError("");
    setError(null);
    setSubmitting(false);
  }, [open, accountName]);

  async function handleSubmit() {
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      title: title.trim(),
      stage,
    };
    if (typeof amount === "number") body.amount = amount;
    if (closeDate) body.closeDate = new Date(closeDate).toISOString();

    try {
      const res = await fetch(`/api/contacts/${contactId}/opportunities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create opportunity");
      }
      onSuccess({ opportunityId: json.data.opportunityId });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create opportunity");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Create opportunity"
      width="max-w-lg"
    >
      <p className="-mt-1 mb-4 text-sm text-crm-muted">
        New opportunity for <strong className="text-crm-text">{contactFullName}</strong> at{" "}
        <strong className="text-crm-text">{accountName}</strong>.
      </p>

      <div className="space-y-3">
        <Field label="Opportunity title" required error={titleError || undefined}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            aria-label="Opportunity title"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Estimated amount" hint="Leave blank if unknown">
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500"
              >
                ₹
              </span>
              <NumberInput
                min={0}
                value={amount}
                onChange={(v) => setAmount(typeof v === "number" ? v : null)}
                className="!pl-7"
              />
            </div>
          </Field>
          <Field label="Estimated close date">
            <DateInput value={closeDate} onChange={(v) => setCloseDate(v ?? "")} />
          </Field>
        </div>

        <Field label="Stage">
          <Select
            value={stage}
            onChange={(e) =>
              setStage((e.target as HTMLSelectElement).value as CrmOpportunityStage)
            }
            options={STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating…" : "Create opportunity"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
