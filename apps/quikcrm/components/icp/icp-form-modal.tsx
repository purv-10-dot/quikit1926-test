"use client";

/**
 * ICP create/edit modal — follows components/quotes/product-form-modal.tsx:
 * `{ open, onClose, onSaved, profile }` with `profile: null` meaning create,
 * hydrate-on-open, POST vs PATCH, server `fieldErrors` mapped onto inputs, and
 * the local Section/Field helpers for layout.
 */

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EntityMultiSelect, type EntityOption } from "@/components/icp/entity-multi-select";
import type { IcpRow } from "@/components/icp/icp-list-client";

interface OptionsPayload {
  industries: Array<{ id: string; name: string; code: string | null }>;
  verticals: Array<{ id: string; name: string; code: string | null }>;
  technologies: Array<{ id: string; name: string; code: string | null }>;
  products: Array<{ id: string; name: string; sku: string }>;
  services: Array<{ id: string; name: string; sku: string }>;
}

const EMPTY_OPTIONS: OptionsPayload = {
  industries: [],
  verticals: [],
  technologies: [],
  products: [],
  services: [],
};

function toOptions(
  rows: Array<{ id: string; name: string; code?: string | null; sku?: string }>,
): EntityOption[] {
  return rows.map((r) => ({ id: r.id, label: r.name, hint: r.sku ?? r.code ?? null }));
}

/** "" ⇄ null/undefined at the form boundary so empty inputs clear the column. */
function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function IcpFormModal({
  open,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: IcpRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!profile;

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [options, setOptions] = useState<OptionsPayload>(EMPTY_OPTIONS);
  const [accountOptions, setAccountOptions] = useState<EntityOption[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaNotes, setPersonaNotes] = useState("");
  const [segment, setSegment] = useState("");
  const [employeeMin, setEmployeeMin] = useState("");
  const [employeeMax, setEmployeeMax] = useState("");
  const [revenueMin, setRevenueMin] = useState("");
  const [revenueMax, setRevenueMax] = useState("");
  const [revenueCurrency, setRevenueCurrency] = useState("INR");
  const [countryCodes, setCountryCodes] = useState("");
  const [regions, setRegions] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [industryIds, setIndustryIds] = useState<string[]>([]);
  const [verticalIds, setVerticalIds] = useState<string[]>([]);
  const [technologyIds, setTechnologyIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);

  const resetCreate = useCallback(() => {
    setName("");
    setDescription("");
    setPersonaNotes("");
    setSegment("");
    setEmployeeMin("");
    setEmployeeMax("");
    setRevenueMin("");
    setRevenueMax("");
    setRevenueCurrency("INR");
    setCountryCodes("");
    setRegions("");
    setIsActive(true);
    setIndustryIds([]);
    setVerticalIds([]);
    setTechnologyIds([]);
    setProductIds([]);
    setServiceIds([]);
    setAccountIds([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setSubmitting(false);

    // Picker feeds. Companies come from the existing accounts picker so the
    // account-scope ACL is applied rather than re-implemented here.
    void Promise.all([
      fetch("/api/icp/options", { credentials: "include" })
        .then((r) => r.json())
        .then((j) => setOptions(j?.success && j.data ? (j.data as OptionsPayload) : EMPTY_OPTIONS))
        .catch(() => setOptions(EMPTY_OPTIONS)),
      fetch("/api/accounts/picker?limit=100", { credentials: "include" })
        .then((r) => r.json())
        .then((j) =>
          setAccountOptions(
            j?.success && Array.isArray(j.data?.items) ? toOptions(j.data.items) : [],
          ),
        )
        .catch(() => setAccountOptions([])),
    ]);

    if (profile?.id) {
      setLoading(true);
      void fetch(`/api/icp/${profile.id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.success || !j.data) return;
          const d = j.data;
          setName(d.name ?? "");
          setDescription(d.description ?? "");
          setPersonaNotes(d.personaNotes ?? "");
          setSegment(d.segment ?? "");
          setEmployeeMin(d.employeeCountMin != null ? String(d.employeeCountMin) : "");
          setEmployeeMax(d.employeeCountMax != null ? String(d.employeeCountMax) : "");
          setRevenueMin(d.annualRevenueMin != null ? String(d.annualRevenueMin) : "");
          setRevenueMax(d.annualRevenueMax != null ? String(d.annualRevenueMax) : "");
          setRevenueCurrency(d.revenueCurrency ?? "INR");
          setCountryCodes((d.countryCodes ?? []).join(", "));
          setRegions((d.regions ?? []).join(", "));
          setIsActive(!!d.isActive);

          // Split the single taxonomy link list back into its three pickers.
          const links: Array<{ taxonomyId: string; kind: string }> = d.taxonomyLinks ?? [];
          setIndustryIds(links.filter((l) => l.kind === "Industry").map((l) => l.taxonomyId));
          setVerticalIds(links.filter((l) => l.kind === "Vertical").map((l) => l.taxonomyId));
          setTechnologyIds(links.filter((l) => l.kind === "Technology").map((l) => l.taxonomyId));

          const linkedProducts: Array<{ productId: string; product?: { productType?: string } }> =
            d.productLinks ?? [];
          setProductIds(
            linkedProducts
              .filter((l) => l.product?.productType !== "Service")
              .map((l) => l.productId),
          );
          setServiceIds(
            linkedProducts
              .filter((l) => l.product?.productType === "Service")
              .map((l) => l.productId),
          );

          setAccountIds((d.accountLinks ?? []).map((l: { accountId: string }) => l.accountId));
        })
        .finally(() => setLoading(false));
    } else {
      resetCreate();
      setLoading(false);
    }
  }, [open, profile, resetCreate]);

  /** Comma/newline separated free text → trimmed, de-duplicated array. */
  function splitList(raw: string): string[] {
    return [
      ...new Set(
        raw
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        personaNotes: personaNotes.trim() || null,
        segment: segment || null,
        employeeCountMin: numOrNull(employeeMin),
        employeeCountMax: numOrNull(employeeMax),
        annualRevenueMin: numOrNull(revenueMin),
        annualRevenueMax: numOrNull(revenueMax),
        revenueCurrency: revenueCurrency.trim().toUpperCase() || null,
        countryCodes: splitList(countryCodes).map((c) => c.toUpperCase()),
        regions: splitList(regions),
        isActive,
        // Both pickers write into the one product link set.
        taxonomyIds: [...industryIds, ...verticalIds, ...technologyIds],
        productIds: [...productIds, ...serviceIds],
        accountIds,
      };

      const url = isEdit ? `/api/icp/${profile!.id}` : "/api/icp";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        throw new Error(json.error ?? "Failed to save ICP profile");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save ICP profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit ICP profile" : "New ICP profile"}
      width="max-w-3xl"
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-crm-muted">Loading ICP profile…</p>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <Section title="Profile">
            <Field label="Name" required error={fieldErrors.name} hint="e.g. Mid-market manufacturers, India">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Name this profile"
              />
            </Field>
            <Field label="Description" error={fieldErrors.description}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={2}
                className="crm-input w-full"
                placeholder="Why this profile exists — the short version."
              />
            </Field>
            <Field
              label="Persona notes"
              error={fieldErrors.personaNotes}
              hint="Who you actually talk to: roles, pains, buying triggers."
            >
              <textarea
                value={personaNotes}
                onChange={(e) => setPersonaNotes(e.target.value)}
                maxLength={4000}
                rows={3}
                className="crm-input w-full"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-crm-text">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-accent-600"
              />
              Active
            </label>
          </Section>

          <Section title="Firmographics">
            <Field label="Segment" error={fieldErrors.segment}>
              <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
                <option value="">— Any —</option>
                <option value="Enterprise">Enterprise</option>
                <option value="MidMarket">Mid-Market</option>
                <option value="SMB">SMB</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employees (min)" error={fieldErrors.employeeCountMin}>
                <Input
                  type="number"
                  min={0}
                  value={employeeMin}
                  onChange={(e) => setEmployeeMin(e.target.value)}
                  placeholder="50"
                />
              </Field>
              <Field label="Employees (max)" error={fieldErrors.employeeCountMax}>
                <Input
                  type="number"
                  min={0}
                  value={employeeMax}
                  onChange={(e) => setEmployeeMax(e.target.value)}
                  placeholder="500"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Currency" error={fieldErrors.revenueCurrency}>
                <Input
                  value={revenueCurrency}
                  onChange={(e) => setRevenueCurrency(e.target.value)}
                  maxLength={3}
                  placeholder="INR"
                />
              </Field>
              <Field label="Revenue (min)" error={fieldErrors.annualRevenueMin}>
                <Input
                  type="number"
                  min={0}
                  value={revenueMin}
                  onChange={(e) => setRevenueMin(e.target.value)}
                  placeholder="10000000"
                />
              </Field>
              <Field label="Revenue (max)" error={fieldErrors.annualRevenueMax}>
                <Input
                  type="number"
                  min={0}
                  value={revenueMax}
                  onChange={(e) => setRevenueMax(e.target.value)}
                  placeholder="500000000"
                />
              </Field>
            </div>
            <Field
              label="Country codes"
              error={fieldErrors.countryCodes}
              hint="Two-letter ISO codes, comma separated — IN, AE, SG"
            >
              <Input
                value={countryCodes}
                onChange={(e) => setCountryCodes(e.target.value)}
                placeholder="IN, AE"
              />
            </Field>
            <Field
              label="Regions"
              error={fieldErrors.regions}
              hint="Free text, comma separated — APAC, EMEA, North India"
            >
              <Input
                value={regions}
                onChange={(e) => setRegions(e.target.value)}
                placeholder="APAC, North India"
              />
            </Field>
          </Section>

          <Section title="What you sell">
            <Field
              label="Products"
              error={fieldErrors.productIds}
              hint={options.products.length === 0 ? "No active products in this org yet." : undefined}
            >
              <EntityMultiSelect
                options={toOptions(options.products)}
                value={productIds}
                onChange={setProductIds}
                placeholder="Select products"
                emptyHint="No active products yet."
              />
            </Field>
            <Field
              label="Services"
              hint="A service is a product with type Service — managed on the Products page."
            >
              <EntityMultiSelect
                options={toOptions(options.services)}
                value={serviceIds}
                onChange={setServiceIds}
                placeholder="Select services"
                emptyHint="No active services yet."
              />
            </Field>
          </Section>

          <Section title="Who you sell to">
            <Field label="Industries" error={fieldErrors.taxonomyIds}>
              <EntityMultiSelect
                options={toOptions(options.industries)}
                value={industryIds}
                onChange={setIndustryIds}
                placeholder="Select industries"
                emptyHint="No industries yet — add them via Manage taxonomy."
              />
            </Field>
            <Field label="Verticals">
              <EntityMultiSelect
                options={toOptions(options.verticals)}
                value={verticalIds}
                onChange={setVerticalIds}
                placeholder="Select verticals"
                emptyHint="No verticals yet — add them via Manage taxonomy."
              />
            </Field>
            <Field label="Technologies">
              <EntityMultiSelect
                options={toOptions(options.technologies)}
                value={technologyIds}
                onChange={setTechnologyIds}
                placeholder="Select technologies"
                emptyHint="No technologies yet — add them via Manage taxonomy."
              />
            </Field>
            <Field
              label="Example companies"
              error={fieldErrors.accountIds}
              hint="Existing accounts that illustrate this profile. Reference only — nothing is scored or matched."
            >
              <EntityMultiSelect
                options={accountOptions}
                value={accountIds}
                onChange={setAccountIds}
                placeholder="Select companies"
                emptyHint="No accounts available."
              />
            </Field>
          </Section>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || loading || !name.trim()}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create ICP"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-crm-border p-4">
      <legend className="px-1 text-sm font-semibold text-crm-text">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-crm-text">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-crm-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
