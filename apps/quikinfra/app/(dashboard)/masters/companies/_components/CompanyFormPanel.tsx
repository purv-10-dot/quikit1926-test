"use client";

import { useEffect, useState } from "react";
import {
  SlidePanel,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  FormRow,
  FormSection,
} from "@quikit/ui";
import { InactiveStatusNotice } from "@/components/FormDrawer";
import type { CompanyCreateInput } from "@/lib/schemas/masters";

export interface CompanyInitial extends Partial<CompanyCreateInput> {
  id?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: CompanyInitial;
  onSaved: () => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/**
 * Create + Edit slide-in panel for CnCompany. Decides mode by `initial?.id`.
 */
export function CompanyFormPanel({ open, onClose, initial, onSaved }: Props) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<CompanyCreateInput>(() => ({
    name: "",
    legalName: "",
    gstin: "",
    pan: "",
    cin: null,
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: null,
    email: null,
    website: null,
    status: "active",
    ...initial,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset when opening/switching records
  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        legalName: "",
        gstin: "",
        pan: "",
        cin: null,
        address: "",
        city: "",
        state: "",
        pincode: "",
        phone: null,
        email: null,
        website: null,
        status: "active",
        ...initial,
      });
      setErr(null);
    }
  }, [open, initial]);

  const update = <K extends keyof CompanyCreateInput>(k: K, v: CompanyCreateInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const url = isEdit
        ? `/api/masters/companies/${initial!.id}`
        : "/api/masters/companies";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Save failed");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Company" : "Add Company"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form.name || !form.gstin || !form.pan}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {err}
          </div>
        )}

        <FormSection title="Identity">
          <FormRow cols={2}>
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <Field label="Legal Name" required>
              <Input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} />
            </Field>
          </FormRow>
          <FormRow cols={3}>
            <Field label="GSTIN" required hint="15 characters">
              <Input
                value={form.gstin}
                maxLength={15}
                onChange={(e) => update("gstin", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="PAN" required hint="10 characters">
              <Input
                value={form.pan}
                maxLength={10}
                onChange={(e) => update("pan", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="CIN" hint="Optional">
              <Input
                value={form.cin ?? ""}
                onChange={(e) => update("cin", e.target.value || null)}
              />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Address">
          <Field label="Address" required>
            <Textarea
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              rows={2}
            />
          </Field>
          <FormRow cols={3}>
            <Field label="City" required>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Field>
            <Field label="State" required>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </Field>
            <Field label="Pincode" required>
              <Input value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Contact">
          <FormRow cols={2}>
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => update("phone", e.target.value || null)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => update("email", e.target.value || null)}
              />
            </Field>
          </FormRow>
          <Field label="Website">
            <Input
              type="url"
              placeholder="https://"
              value={form.website ?? ""}
              onChange={(e) => update("website", e.target.value || null)}
            />
          </Field>
        </FormSection>

        <FormSection title="Status">
          <Field label="Status">
            <Select
              value={form.status ?? "active"}
              onChange={(e) => update("status", e.target.value as "active" | "inactive")}
              options={STATUS_OPTIONS}
            />
            {(form.status ?? "active") === "inactive" && <InactiveStatusNotice entityName="Company" />}
          </Field>
        </FormSection>
      </div>
    </SlidePanel>
  );
}
