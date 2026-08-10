"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const NAME_REGEX = /^[\p{L}\s.\-'’]{1,60}$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d()\-\s]{0,40}$/;

export interface ContactFormValue {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  accountId: string;
  ownerId: string;
  leadId: string;
  city: string;
  contactStage: string;
  source: string;
}

export const EMPTY_CONTACT_FORM: ContactFormValue = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  title: "",
  accountId: "",
  ownerId: "",
  leadId: "",
  city: "",
  contactStage: "",
  source: "",
};

interface PickerOption {
  id: string;
  label: string;
}

export interface ContactFormServerError {
  formError?: string | null;
  fieldErrors?: Record<string, string> | null;
  existingId?: string | null;
}

interface Props {
  mode: "create" | "edit";
  initial?: Partial<ContactFormValue>;
  readOnly?: boolean;
  saving?: boolean;
  serverError?: ContactFormServerError;
  /** Show the Lead picker (only meaningful in edit mode). */
  showLeadPicker?: boolean;
  accountOptions: PickerOption[];
  ownerOptions: PickerOption[];
  leadOptions?: PickerOption[];
  pickersLoading?: boolean;
  onSubmit: (value: ContactFormValue) => void;
  onCancel: () => void;
}

const STAGE_OPTIONS = [
  "",
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal",
  "Won",
  "Lost",
];

const SOURCE_OPTIONS = ["", "Web", "Referral", "Campaign", "Manual"];

export function ContactForm({
  mode,
  initial,
  readOnly = false,
  saving = false,
  serverError,
  showLeadPicker = mode === "edit",
  accountOptions,
  ownerOptions,
  leadOptions = [],
  pickersLoading = false,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState<ContactFormValue>(() => ({
    ...EMPTY_CONTACT_FORM,
    ...(initial ?? {}),
  }));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setValue({ ...EMPTY_CONTACT_FORM, ...(initial ?? {}) });
    setClientErrors({});
  }, [initial]);

  const fieldErrors = useMemo<Record<string, string>>(() => {
    return { ...clientErrors, ...(serverError?.fieldErrors ?? {}) };
  }, [clientErrors, serverError]);

  const setField = useCallback(<K extends keyof ContactFormValue>(k: K, v: ContactFormValue[K]) => {
    setValue((prev) => ({ ...prev, [k]: v }));
    setClientErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  }, []);

  function validateClient(v: ContactFormValue): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!v.firstName.trim()) errs.firstName = "First name is required";
    else if (!NAME_REGEX.test(v.firstName.trim()))
      errs.firstName = "Letters, spaces, dots, hyphens and apostrophes only";
    if (!v.lastName.trim()) errs.lastName = "Last name is required";
    else if (!NAME_REGEX.test(v.lastName.trim()))
      errs.lastName = "Letters, spaces, dots, hyphens and apostrophes only";
    if (v.email.trim() && !EMAIL_REGEX.test(v.email.trim()))
      errs.email = "Invalid email address";
    if (v.phone.trim() && !PHONE_REGEX.test(v.phone.trim()))
      errs.phone = "Phone may contain digits, +, (, ), -, spaces only";
    return errs;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || saving) return;
    const errs = validateClient(value);
    setClientErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit({
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim(),
      phone: value.phone.trim(),
      title: value.title.trim(),
      accountId: value.accountId,
      ownerId: value.ownerId,
      leadId: value.leadId,
      city: value.city.trim(),
      contactStage: value.contactStage,
      source: value.source,
    });
  }

  const inputDisabled = readOnly || saving;
  const submitLabel = mode === "create" ? "Add contact" : "Save changes";
  const showMoreFields =
    moreOpen ||
    !!(value.city || value.contactStage || value.source) ||
    !!(fieldErrors.city || fieldErrors.contactStage || fieldErrors.source);

  return (
    <form onSubmit={handleSubmit} noValidate>
      {readOnly && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You don&apos;t have permission to {mode === "create" ? "create" : "edit"} contacts. Form is read-only.
        </div>
      )}

      {serverError?.formError && !serverError.fieldErrors && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {serverError.formError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" required error={fieldErrors.firstName}>
          <Input
            value={value.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            disabled={inputDisabled}
            autoFocus={mode === "create"}
            aria-invalid={!!fieldErrors.firstName}
            data-testid="contact-form-first-name"
          />
        </Field>
        <Field label="Last name" required error={fieldErrors.lastName}>
          <Input
            value={value.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            disabled={inputDisabled}
            aria-invalid={!!fieldErrors.lastName}
            data-testid="contact-form-last-name"
          />
        </Field>

        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            value={value.email}
            onChange={(e) => setField("email", e.target.value)}
            disabled={inputDisabled}
            aria-invalid={!!fieldErrors.email}
            data-testid="contact-form-email"
          />
          {serverError?.existingId && fieldErrors.email && (
            <div className="mt-1 text-xs text-amber-700">
              <Link
                href={`/contacts/${serverError.existingId}`}
                className="crm-link underline"
              >
                Open existing contact?
              </Link>
            </div>
          )}
        </Field>
        <Field label="Phone" error={fieldErrors.phone}>
          <Input
            type="tel"
            value={value.phone}
            onChange={(e) => setField("phone", e.target.value)}
            disabled={inputDisabled}
            aria-invalid={!!fieldErrors.phone}
            placeholder="+91 98765 43210"
            data-testid="contact-form-phone"
          />
        </Field>

        <Field label="Title" error={fieldErrors.title}>
          <Input
            value={value.title}
            onChange={(e) => setField("title", e.target.value)}
            disabled={inputDisabled}
          />
        </Field>

        <Field label="Account" error={fieldErrors.accountId}>
          <Select
            value={value.accountId}
            onChange={(e) => setField("accountId", e.target.value)}
            disabled={inputDisabled || pickersLoading}
          >
            <option value="">{pickersLoading ? "Loading…" : "—"}</option>
            {accountOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Owner" error={fieldErrors.ownerId}>
          <Select
            value={value.ownerId}
            onChange={(e) => setField("ownerId", e.target.value)}
            disabled={inputDisabled || pickersLoading}
          >
            <option value="">{pickersLoading ? "Loading…" : "—"}</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {showLeadPicker && (
          <Field label="Lead" error={fieldErrors.leadId}>
            <Select
              value={value.leadId}
              onChange={(e) => setField("leadId", e.target.value)}
              disabled={inputDisabled || pickersLoading}
            >
              <option value="">—</option>
              {leadOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <details
        className="mt-4 rounded-md border border-crm-border bg-crm-panel"
        open={showMoreFields}
        onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-crm-text">
          More fields
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-crm-border bg-white p-3 sm:grid-cols-2">
          <Field label="City" error={fieldErrors.city}>
            <Input
              value={value.city}
              onChange={(e) => setField("city", e.target.value)}
              disabled={inputDisabled}
            />
          </Field>
          <Field label="Stage" error={fieldErrors.contactStage}>
            <Select
              value={value.contactStage}
              onChange={(e) => setField("contactStage", e.target.value)}
              disabled={inputDisabled}
            >
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s || "—"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" error={fieldErrors.source}>
            <Select
              value={value.source}
              onChange={(e) => setField("source", e.target.value)}
              disabled={inputDisabled}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s || "—"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </details>

      {!readOnly && (
        <div className="mt-5 flex flex-row-reverse items-center justify-start gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-crm-text">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
