"use client";

/**
 * AccountFormPanel — side-drawer create/edit form for an account.
 *
 * Phase 1 fields: name, segment (dropdown), ownerId (user picker),
 * annualRevenueAmount + currency, annualRevenueDisplay, status, industry,
 * website, city. Phase 2: countryCode, state, postalCode, parentAccountId,
 * healthScore, npsScore, contractStart/End, renewalDate.
 *
 * The form posts JSON. Server is the source of truth for ownerName,
 * industryKey, segment text, and revenue display when amount changed —
 * this panel just collects fields.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormActions } from "@/components/ui/form";
import { ISO_COUNTRIES, ISO_CURRENCIES } from "@/lib/utils/iso-countries";
import {
  ACCOUNT_STATUS,
  ACCOUNT_SEGMENT_ENUM,
} from "@/lib/validators/account";

export interface AccountFormInitial {
  id: string;
  name: string;
  segment: string;
  segmentEnum: string | null;
  ownerId: string | null;
  industry: string;
  website: string;
  city: string;
  status: string;
  annualRevenue: string;
  annualRevenueAmount: number | null;
  annualRevenueCurrency: string | null;
  countryCode: string | null;
  state: string | null;
  postalCode: string | null;
  parentAccountId: string | null;
  healthScore: number | null;
  npsScore: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  renewalDate: string | null;
}

interface UserPickerItem {
  id: string;
  name: string;
}

interface AccountPickerItem {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  initial: AccountFormInitial | null;
  onClose: () => void;
  onSaved: (saved: { id: string }) => void;
}

const FORM_ID = "account-form";

export function AccountFormPanel({ open, mode, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [segmentEnum, setSegmentEnum] = useState<string>("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<string>("Active");
  const [annualRevenueAmount, setAnnualRevenueAmount] = useState<string>("");
  const [annualRevenueCurrency, setAnnualRevenueCurrency] = useState<string>("INR");
  const [annualRevenueDisplay, setAnnualRevenueDisplay] = useState("");
  const [countryCode, setCountryCode] = useState<string>("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [parentAccountId, setParentAccountId] = useState<string>("");
  const [healthScore, setHealthScore] = useState<string>("");
  const [npsScore, setNpsScore] = useState<string>("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [renewalDate, setRenewalDate] = useState("");

  const [users, setUsers] = useState<UserPickerItem[]>([]);
  const [parentAccounts, setParentAccounts] = useState<AccountPickerItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset state when the drawer opens.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    if (mode === "create" || !initial) {
      setName("");
      setSegmentEnum("");
      setOwnerId("");
      setIndustry("");
      setWebsite("");
      setCity("");
      setStatus("Active");
      setAnnualRevenueAmount("");
      setAnnualRevenueCurrency("INR");
      setAnnualRevenueDisplay("");
      setCountryCode("");
      setState("");
      setPostalCode("");
      setParentAccountId("");
      setHealthScore("");
      setNpsScore("");
      setContractStart("");
      setContractEnd("");
      setRenewalDate("");
    } else {
      setName(initial.name);
      setSegmentEnum(initial.segmentEnum ?? "");
      setOwnerId(initial.ownerId ?? "");
      setIndustry(initial.industry);
      setWebsite(initial.website);
      setCity(initial.city);
      setStatus(initial.status || "Active");
      setAnnualRevenueAmount(
        initial.annualRevenueAmount != null ? String(initial.annualRevenueAmount) : "",
      );
      setAnnualRevenueCurrency(initial.annualRevenueCurrency ?? "INR");
      setAnnualRevenueDisplay(initial.annualRevenue);
      setCountryCode(initial.countryCode ?? "");
      setState(initial.state ?? "");
      setPostalCode(initial.postalCode ?? "");
      setParentAccountId(initial.parentAccountId ?? "");
      setHealthScore(initial.healthScore != null ? String(initial.healthScore) : "");
      setNpsScore(initial.npsScore != null ? String(initial.npsScore) : "");
      setContractStart(initial.contractStart?.slice(0, 10) ?? "");
      setContractEnd(initial.contractEnd?.slice(0, 10) ?? "");
      setRenewalDate(initial.renewalDate?.slice(0, 10) ?? "");
    }
  }, [open, mode, initial]);

  // Load users + parent-account candidates lazily.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const u = await fetch("/api/users/picker", { credentials: "include" }).then(
          (r) =>
            r.ok
              ? (r.json() as Promise<{ items?: UserPickerItem[]; data?: { items?: UserPickerItem[] } }>)
              : null,
        );
        if (u) setUsers(u.data?.items ?? u.items ?? []);
        // pageSize must be one of ALLOWED_PAGE_SIZES ([10,25,50,100]) per
        // lib/validators/pagination.ts. The previous `200` here returned
        // 400 silently and left parent-account picker empty. 100 is the
        // server-side max under the standard validator; if we ever need
        // more options we should add a dedicated /api/accounts/picker
        // endpoint with its own (looser) schema.
        const a = await fetch("/api/accounts?pageSize=100", {
          credentials: "include",
        }).then((r) =>
          r.ok
            ? (r.json() as Promise<{ data: { id: string; name: string }[] }>)
            : null,
        );
        if (a) setParentAccounts(a.data.filter((x) => x.id !== initial?.id));
      } catch {
        // Pickers are best-effort.
      }
    })();
  }, [open, initial?.id]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    if (!name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      segmentEnum: segmentEnum || null,
      ownerId: ownerId || null,
      industry: industry.trim() || null,
      website: website.trim() || null,
      city: city.trim() || null,
      status,
      annualRevenueAmount: annualRevenueAmount ? Number(annualRevenueAmount) : null,
      annualRevenueCurrency: annualRevenueCurrency || null,
      annualRevenueDisplay: annualRevenueDisplay.trim() || null,
      countryCode: countryCode || null,
      state: state.trim() || null,
      postalCode: postalCode.trim() || null,
      parentAccountId: parentAccountId || null,
      healthScore: healthScore ? Number(healthScore) : null,
      npsScore: npsScore ? Number(npsScore) : null,
      contractStart: contractStart || null,
      contractEnd: contractEnd || null,
      renewalDate: renewalDate || null,
    };

    setSubmitting(true);
    try {
      const url = mode === "create" ? "/api/accounts" : `/api/accounts/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        errors?: Record<string, string[] | string>;
      };
      if (!res.ok) {
        if (json.errors && typeof json.errors === "object") {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.errors)) {
            flat[k] = Array.isArray(v) ? v[0] : String(v);
          }
          setErrors(flat);
        }
        setServerError(json.error || "Save failed");
        return;
      }
      if (json.id) onSaved({ id: json.id });
      onClose();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={mode === "create" ? "New account" : "Edit account"}
      description={
        mode === "create"
          ? "Capture name, owner, segment, and revenue. The rest can be filled in later."
          : "Update segment, owner, contract dates, and any account metadata."
      }
      footer={
        <FormActions error={serverError}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create account" : "Save"}
          </Button>
        </FormActions>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5"
      >
        <Field label="Name *" error={errors.name} colSpan>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="Segment" error={errors.segmentEnum}>
          <Select value={segmentEnum} onChange={(e) => setSegmentEnum(e.target.value)}>
            <option value="">—</option>
            {ACCOUNT_SEGMENT_ENUM.map((v) => (
              <option key={v} value={v}>
                {v === "MidMarket" ? "Mid-market" : v}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Owner" error={errors.ownerId}>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" error={errors.status}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ACCOUNT_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Annual revenue (amount)" error={errors.annualRevenueAmount}>
          <Input
            type="number"
            min={0}
            step={1000}
            value={annualRevenueAmount}
            onChange={(e) => setAnnualRevenueAmount(e.target.value)}
            placeholder="e.g. 21000000"
          />
        </Field>

        <Field label="Currency" error={errors.annualRevenueCurrency}>
          <Select
            value={annualRevenueCurrency}
            onChange={(e) => setAnnualRevenueCurrency(e.target.value)}
          >
            {ISO_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Revenue label (auto)" error={errors.annualRevenueDisplay} colSpan>
          <Input
            value={annualRevenueDisplay}
            onChange={(e) => setAnnualRevenueDisplay(e.target.value)}
            placeholder="Auto-formatted on save (e.g. ₹2.1Cr ARR). Editable."
          />
        </Field>

        <Field label="Industry" error={errors.industry}>
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>

        <Field label="Website" error={errors.website}>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
        </Field>

        <Field label="City" error={errors.city}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>

        <Field label="State" error={errors.state}>
          <Input value={state} onChange={(e) => setState(e.target.value)} />
        </Field>

        <Field label="Country" error={errors.countryCode}>
          <Select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            <option value="">—</option>
            {ISO_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Postal code" error={errors.postalCode}>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </Field>

        <Field label="Parent account" error={errors.parentAccountId} colSpan>
          <Select
            value={parentAccountId}
            onChange={(e) => setParentAccountId(e.target.value)}
          >
            <option value="">—</option>
            {parentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Health score (0–100)" error={errors.healthScore}>
          <Input
            type="number"
            min={0}
            max={100}
            value={healthScore}
            onChange={(e) => setHealthScore(e.target.value)}
          />
        </Field>

        <Field label="NPS (-100…100)" error={errors.npsScore}>
          <Input
            type="number"
            min={-100}
            max={100}
            value={npsScore}
            onChange={(e) => setNpsScore(e.target.value)}
          />
        </Field>

        <Field label="Contract start" error={errors.contractStart}>
          <Input
            type="date"
            value={contractStart}
            onChange={(e) => setContractStart(e.target.value)}
          />
        </Field>

        <Field label="Contract end" error={errors.contractEnd}>
          <Input
            type="date"
            value={contractEnd}
            onChange={(e) => setContractEnd(e.target.value)}
          />
        </Field>

        <Field label="Renewal date" error={errors.renewalDate} colSpan>
          <Input
            type="date"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
          />
        </Field>
      </form>
    </Drawer>
  );
}

function Field({
  label,
  error,
  children,
  colSpan,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  colSpan?: boolean;
}) {
  return (
    <label className={`block ${colSpan ? "md:col-span-full" : ""}`}>
      <span className="mb-1 block truncate text-sm font-medium text-crm-text">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
    </label>
  );
}
