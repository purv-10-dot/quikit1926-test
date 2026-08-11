"use client";

import { useEffect, useState } from "react";
import { NumberInput, DateInput, Checkbox, Field } from "@quikit/ui";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConvertResult {
  contactId: string | null;
  opportunityId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  onSuccess: (result: ConvertResult) => void;
}

function defaultCloseDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function ConvertLeadModal({
  open,
  onClose,
  leadId,
  leadName,
  leadCompany,
  onSuccess,
}: Props) {
  const [createOpp, setCreateOpp] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [closeDate, setCloseDate] = useState("");
  const [titleError, setTitleError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreateOpp(false);
    setTitle(leadCompany ? `${leadCompany} Deal` : "");
    setAmount(null);
    setCloseDate(defaultCloseDate());
    setTitleError("");
    setError(null);
    setSubmitting(false);
  }, [open, leadCompany]);

  async function handleSubmit() {
    if (createOpp && !title.trim()) {
      setTitleError("Title is required when creating an opportunity");
      return;
    }
    setTitleError("");
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      createContact: true,
      createOpportunity: createOpp,
    };
    if (createOpp) {
      body.opportunityTitle = title.trim();
      if (typeof amount === "number") body.opportunityAmount = amount;
      if (closeDate) body.opportunityCloseDate = new Date(closeDate).toISOString();
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Convert failed");
      onSuccess({
        contactId: json.contactId ?? null,
        opportunityId: json.opportunityId ?? null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Convert lead"
      width="max-w-lg"
    >
      <p className="-mt-1 mb-4 text-sm text-crm-muted">
        <strong className="text-crm-text">{leadName}</strong> will be converted. The
        original lead is preserved.
      </p>

      <div className="space-y-3">
        <Checkbox
          checked
          disabled
          label="Create Contact"
          description="Required — the person we're selling to"
        />
        <Checkbox
          checked={createOpp}
          onChange={(e) => setCreateOpp(e.target.checked)}
          label="Also create Opportunity"
          description="Track this as an active deal"
        />

        {createOpp && (
          <div className="ml-6 space-y-3 border-l-2 border-accent-100 pl-4">
            <Field
              label="Opportunity title"
              required
              error={titleError || undefined}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
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
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Converting…" : "Convert"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
