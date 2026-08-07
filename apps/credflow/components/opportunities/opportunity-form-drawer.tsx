"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SlidePanel,
  Button,
  Input,
  NumberInput,
  Select,
  DateInput,
  UserPicker,
  type PickerUser,
} from "@quikit/ui";
import {
  STAGE_DEFAULT_PROBABILITY,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/lib/services/opportunities/stage-labels";
import type { QcfOpportunityStage } from "@quikit/database";

type AccountOption = { id: string; name: string };

async function fetchAccounts(): Promise<AccountOption[]> {
  // pageSize must be one of ALLOWED_PAGE_SIZES ([10,25,50,100]). Using 200
  // previously returned 400 and the silent error path left the New
  // Opportunity drawer's account dropdown empty. 100 is the validator max.
  const r = await fetch("/api/accounts?pageSize=100");
  const j = await r.json();
  // Accounts route returns { data: AccountRow[], total, page, pageSize } —
  // not the {success, data} envelope used by the opportunities module.
  // Tolerate both shapes so the picker keeps working if the response gets
  // standardised later.
  if (Array.isArray(j?.data)) return j.data as AccountOption[];
  if (j?.success && Array.isArray(j?.data?.items)) return j.data.items;
  if (Array.isArray(j?.items)) return j.items;
  return [];
}

type PickerItem = { id: string; name: string; email: string; role?: string };

async function fetchUsers(): Promise<PickerUser[]> {
  const r = await fetch("/api/users/picker", { credentials: "include" });
  const j = (await r.json()) as { items?: PickerItem[] };
  // /api/users/picker returns { items: [{id, name, email, role}] }. Split the
  // pre-concatenated `name` back into firstName/lastName for UserPicker —
  // best-effort on the first space; PickerUser doesn't care about exactness.
  return (j.items ?? []).map((u) => {
    const [firstName = u.email, ...rest] = (u.name ?? "").trim().split(/\s+/);
    return {
      id: u.id,
      firstName,
      lastName: rest.join(" "),
      email: u.email,
    };
  });
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label} {required && <span className="text-red-500">*</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function OpportunityFormDrawer({
  open,
  onClose,
  initialAccountId,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-fill account when opened from Account 360. */
  initialAccountId?: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [stage, setStage] = useState<QcfOpportunityStage>("Prospecting");
  const [probability, setProbability] = useState<number>(STAGE_DEFAULT_PROBABILITY.Prospecting);
  const [probabilityTouched, setProbabilityTouched] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [closeDate, setCloseDate] = useState<string>("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Drawer state survives close → next open by default. Reset to defaults
  // on every closed → open transition so "New opportunity" never inherits
  // values from the last create.
  useEffect(() => {
    if (!open) return;
    setName("");
    setAccountId(initialAccountId ?? "");
    setStage("Prospecting");
    setProbability(STAGE_DEFAULT_PROBABILITY.Prospecting);
    setProbabilityTouched(false);
    setAmount(null);
    setCurrency("INR");
    setCloseDate("");
    setOwnerId("");
    setError(null);
  }, [open, initialAccountId]);

  const accountsQ = useQuery({ queryKey: ["accounts", "for-opp"], queryFn: fetchAccounts });
  const usersQ = useQuery({ queryKey: ["users", "picker"], queryFn: fetchUsers });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        accountId,
        stage,
        probability,
        amount,
        currency,
        closeDate: closeDate ? new Date(closeDate).toISOString() : null,
        // Empty string → omit (server defaults to creator). Picked id → send.
        ...(ownerId ? { ownerId } : {}),
      };
      const r = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed"),
  });

  const suggested = STAGE_DEFAULT_PROBABILITY[stage];
  const showSuggestion = !probabilityTouched && probability !== suggested;

  return (
    <SlidePanel open={open} onClose={onClose} title="New opportunity" size="default">
      <div className="space-y-4 p-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={300}
          />
        </Field>
        <Field label="Account" required>
          <Select
            value={accountId}
            onChange={(e) => setAccountId((e.target as HTMLSelectElement).value)}
            options={[
              { value: "", label: "Select an account" },
              ...(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </Field>
        <Field label="Stage">
          <Select
            value={stage}
            onChange={(e) => {
              const next = (e.target as HTMLSelectElement).value as QcfOpportunityStage;
              setStage(next);
              if (!probabilityTouched) setProbability(STAGE_DEFAULT_PROBABILITY[next]);
            }}
            options={STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
          />
        </Field>
        <Field label="Probability (%)">
          <div className="flex items-center gap-2">
            <NumberInput
              min={0}
              max={100}
              value={probability}
              onChange={(v) => {
                setProbability(typeof v === "number" ? v : 0);
                setProbabilityTouched(true);
              }}
            />
            {showSuggestion && (
              <button
                type="button"
                onClick={() => {
                  setProbability(suggested);
                  setProbabilityTouched(false);
                }}
                className="rounded-full bg-accent-50 px-2 py-1 text-xs text-accent-700 hover:bg-accent-100"
                title={`Stage default for ${STAGE_LABEL[stage]}`}
              >
                Suggested {suggested}%
              </button>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <NumberInput
              min={0}
              value={amount}
              onChange={(v) => setAmount(typeof v === "number" ? v : null)}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={currency}
              onChange={(e) => setCurrency((e.target as HTMLSelectElement).value)}
              options={[
                { value: "INR", label: "INR ₹" },
                { value: "USD", label: "USD $" },
                { value: "EUR", label: "EUR €" },
                { value: "GBP", label: "GBP £" },
              ]}
            />
          </Field>
        </div>
        <Field label="Owner">
          <UserPicker
            value={ownerId}
            onChange={setOwnerId}
            users={usersQ.data ?? []}
            placeholder="Defaults to you (creator)"
          />
        </Field>
        <Field label="Close date">
          <DateInput
            value={closeDate}
            onChange={(v) => setCloseDate(v ?? "")}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="border-t border-crm-border p-4">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              createMutation.mutate();
            }}
            disabled={!name || !accountId || createMutation.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </SlidePanel>
  );
}
