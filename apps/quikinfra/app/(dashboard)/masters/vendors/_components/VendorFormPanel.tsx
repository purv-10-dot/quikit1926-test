"use client";

import { useEffect, useState } from "react";
import {
  SlidePanel,
  Button,
  Input,
  Select,
  NumberInput,
  Textarea,
  Field,
  FormRow,
  FormSection,
} from "@quikit/ui";
import { InactiveStatusNotice } from "@/components/FormDrawer";
import type { VendorCreateInput } from "@/lib/schemas/masters";

export interface VendorInitial extends Partial<VendorCreateInput> {
  id?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: VendorInitial;
  onSaved: () => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "blacklisted", label: "Blacklisted" },
];

const DEFAULT: VendorCreateInput = {
  code: "",
  name: "",
  legalName: null,
  gstin: null,
  pan: null,
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  state: null,
  pincode: null,
  bankName: null,
  bankAccountNo: null,
  bankIfsc: null,
  paymentTermsDays: null,
  rating: null,
  status: "active",
};

export function VendorFormPanel({ open, onClose, initial, onSaved }: Props) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<VendorCreateInput>({ ...DEFAULT, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT, ...initial });
      setErr(null);
    }
  }, [open, initial]);

  const update = <K extends keyof VendorCreateInput>(k: K, v: VendorCreateInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const url = isEdit ? `/api/masters/vendors/${initial!.id}` : "/api/masters/vendors";
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
      title={isEdit ? "Edit Vendor" : "Add Vendor"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form.code || !form.name}>
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
            <Field label="Code" required hint="Unique within tenant">
              <Input
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                maxLength={50}
              />
            </Field>
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
          </FormRow>
          <FormRow cols={3}>
            <Field label="Legal Name">
              <Input
                value={form.legalName ?? ""}
                onChange={(e) => update("legalName", e.target.value || null)}
              />
            </Field>
            <Field label="GSTIN">
              <Input
                value={form.gstin ?? ""}
                maxLength={15}
                onChange={(e) => update("gstin", (e.target.value || null) && e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="PAN">
              <Input
                value={form.pan ?? ""}
                maxLength={10}
                onChange={(e) => update("pan", (e.target.value || null) && e.target.value.toUpperCase())}
              />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Contact">
          <FormRow cols={2}>
            <Field label="Contact Person">
              <Input
                value={form.contactPerson ?? ""}
                onChange={(e) => update("contactPerson", e.target.value || null)}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => update("phone", e.target.value || null)}
              />
            </Field>
          </FormRow>
          <Field label="Email">
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value || null)}
            />
          </Field>
        </FormSection>

        <FormSection title="Address">
          <Field label="Address">
            <Textarea
              rows={2}
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value || null)}
            />
          </Field>
          <FormRow cols={3}>
            <Field label="City">
              <Input
                value={form.city ?? ""}
                onChange={(e) => update("city", e.target.value || null)}
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state ?? ""}
                onChange={(e) => update("state", e.target.value || null)}
              />
            </Field>
            <Field label="Pincode">
              <Input
                value={form.pincode ?? ""}
                onChange={(e) => update("pincode", e.target.value || null)}
              />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Banking">
          <FormRow cols={2}>
            <Field label="Bank Name">
              <Input
                value={form.bankName ?? ""}
                onChange={(e) => update("bankName", e.target.value || null)}
              />
            </Field>
            <Field label="Account Number">
              <Input
                value={form.bankAccountNo ?? ""}
                onChange={(e) => update("bankAccountNo", e.target.value || null)}
              />
            </Field>
          </FormRow>
          <Field label="IFSC">
            <Input
              value={form.bankIfsc ?? ""}
              onChange={(e) => update("bankIfsc", (e.target.value || null) && e.target.value.toUpperCase())}
            />
          </Field>
        </FormSection>

        <FormSection title="Commercial">
          <FormRow cols={3}>
            <Field label="Payment Terms (days)" hint="0-365">
              <NumberInput
                integerOnly
                min={0}
                max={365}
                value={form.paymentTermsDays ?? null}
                onChange={(v) => update("paymentTermsDays", v)}
              />
            </Field>
            <Field label="Rating" hint="1-5">
              <NumberInput
                integerOnly
                min={1}
                max={5}
                value={form.rating ?? null}
                onChange={(v) => update("rating", v)}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status ?? "active"}
                onChange={(e) => update("status", e.target.value as "active" | "inactive" | "blacklisted")}
                options={STATUS_OPTIONS}
              />
              {(form.status ?? "active") === "inactive" && <InactiveStatusNotice entityName="Vendor" />}
            </Field>
          </FormRow>
        </FormSection>
      </div>
    </SlidePanel>
  );
}
