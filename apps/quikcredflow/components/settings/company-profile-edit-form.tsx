"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { CompanyProfileDto } from "@/lib/services/company-profile";

interface Props {
  initial: CompanyProfileDto;
  canEdit: boolean;
}

export function CompanyProfileEditForm({ initial, canEdit }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [employees, setEmployees] = useState(initial.employees ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;

    const errs: Record<string, string> = {};
    if (!companyName.trim()) errs.companyName = "Company name is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setErrors({});
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          industry: industry.trim() || null,
          website: website.trim() || null,
          phone: phone.trim() || null,
          employees: employees.trim() || null,
          logoUrl: logoUrl.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        errors?: Record<string, string[]>;
      };
      if (!res.ok || !json.success) {
        if (json.errors && typeof json.errors === "object") {
          setErrors(
            Object.fromEntries(
              Object.entries(json.errors).map(([k, v]) => [
                k,
                Array.isArray(v) ? v[0] : String(v),
              ]),
            ),
          );
        }
        throw new Error(json.error || "Save failed");
      }
      toast.success("Company profile updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {!canEdit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can view organization details. Ask an administrator to update the company profile.
        </p>
      )}

      <p className="rounded-lg border border-crm-border bg-slate-50/70 px-3 py-2 text-sm text-crm-muted">
        Used on quote PDFs, documents, and team-facing branding.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company name" error={errors.companyName} required>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={!canEdit}
            required
          />
        </Field>
        <Field label="Industry" error={errors.industry}>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. Software"
          />
        </Field>
        <Field label="Website" error={errors.website} help="https://example.com">
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={!canEdit}
            placeholder="https://"
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canEdit}
            placeholder="+91 …"
          />
        </Field>
        <Field label="Employees" error={errors.employees} help="e.g. 50–100 or 250">
          <Input
            value={employees}
            onChange={(e) => setEmployees(e.target.value)}
            disabled={!canEdit}
            placeholder="Headcount band"
          />
        </Field>
        <Field label="Logo URL" error={errors.logoUrl} help="Public image URL for PDFs">
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            disabled={!canEdit}
            placeholder="https://"
          />
        </Field>
      </div>

      {canEdit && (
        <div className="flex items-center justify-end border-t border-crm-border pt-4">
          <Button type="submit" disabled={saving} className="min-w-28">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  help,
  error,
  required,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-crm-text">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
      {!error && help && <span className="mt-1 block text-xs text-crm-muted">{help}</span>}
    </label>
  );
}
