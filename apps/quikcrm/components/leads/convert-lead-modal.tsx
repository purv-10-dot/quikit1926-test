"use client";

import { useEffect, useState } from "react";
import { NumberInput, DateInput, Checkbox, Field } from "@quikit/ui";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";

interface AccountOption {
  id: string;
  name: string;
}

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

  // Optional "Use Existing Account" selection. When set, it is sent to the
  // convert API and used as the conversion's account; when null, the API keeps
  // its existing company-name-based account resolution unchanged.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountHits, setAccountHits] = useState<AccountOption[]>([]);
  const [accountListOpen, setAccountListOpen] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const debouncedAccountQuery = useDebouncedValue(accountQuery, 300);

  useEffect(() => {
    if (!open) return;
    setCreateOpp(false);
    setTitle(leadCompany ? `${leadCompany} Deal` : "");
    setAmount(null);
    setCloseDate(defaultCloseDate());
    setTitleError("");
    setError(null);
    setSubmitting(false);
    setAccountId(null);
    setAccountQuery("");
    setAccountHits([]);
    setAccountListOpen(false);
    setAccountLoading(false);
  }, [open, leadCompany]);

  // Search existing accounts as the user types. Uses the shared, ACL-scoped
  // account picker endpoint (same source the settings/contacts pickers use).
  useEffect(() => {
    if (!open || !accountListOpen) return;
    let cancel = false;
    setAccountLoading(true);
    // Empty query returns the top accounts (endpoint default limit) so the user
    // can open the dropdown and pick from the list without typing anything.
    const url = debouncedAccountQuery
      ? `/api/accounts/picker?q=${encodeURIComponent(debouncedAccountQuery)}`
      : "/api/accounts/picker";
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const items: AccountOption[] = Array.isArray(j?.data?.items)
          ? j.data.items.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
          : [];
        setAccountHits(items);
      })
      .catch(() => {
        if (!cancel) setAccountHits([]);
      })
      .finally(() => {
        if (!cancel) setAccountLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, accountListOpen, debouncedAccountQuery]);

  function pickAccount(opt: AccountOption) {
    setAccountId(opt.id);
    setAccountQuery(opt.name);
    setAccountListOpen(false);
  }

  function clearAccount() {
    setAccountId(null);
    setAccountQuery("");
    setAccountHits([]);
    setAccountListOpen(false);
  }

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
    // Only send accountId when the user picked an existing account; omitting it
    // preserves the API's default company-name account resolution.
    if (accountId) body.accountId = accountId;
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

        <Field
          label="Use Existing Account"
          hint="Search and pick an account, or leave blank to use the default"
        >
          <div
            className="relative"
            // Close the list when focus leaves the whole control (outside click
            // or tab-away), but not when it moves between the input and the
            // dropdown options inside it.
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setAccountListOpen(false);
              }
            }}
          >
            <Input
              value={accountQuery}
              placeholder="Search or select an account…"
              onChange={(e) => {
                setAccountQuery(e.target.value);
                setAccountListOpen(true);
                // Typing after a selection clears it — the conversion only uses
                // an explicitly picked account.
                if (accountId) setAccountId(null);
              }}
              onFocus={() => setAccountListOpen(true)}
              onClick={() => setAccountListOpen(true)}
              aria-label="Use Existing Account"
              className="!pr-16"
            />
            {accountId ? (
              <button
                type="button"
                onClick={clearAccount}
                className="absolute inset-y-0 right-2 my-auto h-6 rounded px-2 text-xs text-crm-muted hover:bg-crm-panel"
              >
                Clear
              </button>
            ) : (
              // Chevron toggle — lets the user open the full list and pick an
              // account without having to type a name they don't remember.
              <button
                type="button"
                aria-label={accountListOpen ? "Hide accounts" : "Show accounts"}
                onClick={() => setAccountListOpen((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded text-crm-muted hover:bg-crm-panel"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${accountListOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            {accountListOpen && (
              <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-crm-border bg-white shadow-lg">
                {accountLoading && accountHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-crm-muted">Loading…</li>
                ) : accountHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-crm-muted">No accounts match.</li>
                ) : (
                  accountHits.map((opt) => (
                  <li key={opt.id} className="border-b border-crm-border last:border-0">
                    <button
                      type="button"
                      onClick={() => pickAccount(opt)}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-crm-panel"
                    >
                      {opt.name}
                    </button>
                  </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </Field>

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
