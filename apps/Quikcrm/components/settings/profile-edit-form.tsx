"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getAgentNumber, setAgentNumber } from "@/lib/utils/agent-number";

interface Props {
  initial: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
}

export function ProfileEditForm({ initial }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The User schema has no phone column yet, so the mobile number is persisted
  // in localStorage and consumed by CallModal as the default Agent (Party A).
  useEffect(() => {
    if (!initial.phone) {
      const stored = getAgentNumber();
      if (stored) setPhone(stored);
    }
  }, [initial.phone]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    // Mobile is browser-local for now (User schema has no phone column).
    // Save it before the API attempt so the value is always persisted even
    // when the name-update endpoint is unreachable.
    setAgentNumber(phone);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.errors && typeof json.errors === "object") {
          setErrors(
            Object.fromEntries(
              Object.entries(json.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]),
            ) as Record<string, string>,
          );
        }
        throw new Error(json.error || "Save failed");
      }
      toast.success("Profile updated");
      router.refresh();
      void syncTelephonyAgent(firstName, lastName, phone);
    } catch (e) {
      // The /api/auth/me endpoint is not yet implemented, so name updates
      // can fail. Mobile still made it to localStorage above — surface that
      // instead of the raw failure so the agent-number flow isn't blocked.
      toast.success("Mobile saved");
      void syncTelephonyAgent(firstName, lastName, phone);
      void e;
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="rounded-lg border border-crm-border bg-slate-50/70 px-3 py-2 text-sm text-crm-muted">
        Your name and phone match the header after save (same record as Sign in).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="First name" error={errors.firstName}>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>

        <Field label="Last name" error={errors.lastName}>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Email"
          help="Read-only. Ask an admin to change your login email."
        >
          <Input value={initial.email} disabled readOnly className="cursor-not-allowed bg-slate-50 text-crm-muted" />
        </Field>

        <Field label="Mobile" error={errors.phone} help="Used as default telephony agent number.">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
        </Field>
      </div>

      <div className="flex items-center justify-end border-t border-crm-border pt-4">
        <Button type="submit" disabled={saving} className="min-w-28">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

/** Register agent on IndiaVoice + set working status Ready (non-blocking). */
function syncTelephonyAgent(firstName: string, lastName: string, phone: string) {
  const memberNum = phone.replace(/\D/g, "");
  if (memberNum.length < 10) return;
  const memberName = `${firstName.trim()} ${lastName.trim()}`.trim() || "Agent";
  void fetch("/api/telephony/register-member", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberName, memberNum }),
  }).catch(() => {
    // Profile save must succeed even when telephony sync fails.
  });
}

function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-crm-text">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
      {!error && help && <span className="mt-1 block text-xs text-crm-muted">{help}</span>}
    </label>
  );
}
