"use client";

/**
 * Shared prospect create form.
 *
 * THE prospect form for the app — deliberately generic, not Upwork-specific.
 * The Upwork "Convert to Prospect" flow renders it with `initial` pre-filled
 * and an `upworkJobId`, but any future "New Prospect" entry point can render it
 * with no props at all and get the same fields, validation and submit path.
 *
 * Mirrors the conventions of components/leads/lead-form.tsx: `initial` for
 * prefill, `submitLabel`/`onSaved`/`onCancel` for host control, server-returned
 * `fieldErrors` surfaced inline, and a single POST to the shared endpoint
 * (/api/prospects) so validation lives server-side.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface ProspectFormInitial {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  shortSummary?: string | null;
  linkedinUrl?: string | null;
  icpId?: string | null;
}

interface IcpOption {
  id: string;
  name: string;
  isActive: boolean;
}

export function ProspectForm({
  initial,
  upworkJobId,
  prospectId,
  submitLabel = "Create prospect",
  onSaved,
  onCancel,
}: {
  /** Pre-filled values. Only fields with a genuine match should be passed. */
  initial?: ProspectFormInitial;
  /** Origin Upwork job. Sent as a reference; the job itself is never modified. */
  upworkJobId?: string;
  /**
   * Edit mode. When set, the form PATCHes this prospect instead of creating a
   * new one. `upworkJobId` is ignored while editing — the origin reference is
   * immutable, enforced again server-side.
   */
  prospectId?: string;
  submitLabel?: string;
  onSaved?: (prospect: { id: string; name: string }) => void;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(prospectId);
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [shortSummary, setShortSummary] = useState(initial?.shortSummary ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? "");
  const [icpId, setIcpId] = useState(initial?.icpId ?? "");

  const [icps, setIcps] = useState<IcpOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ICP is a reference to an existing profile, so the options come from the
  // same endpoint the ICP module uses rather than being typed free-hand.
  //
  // Create mode lists active ICPs only — you should not tag a new prospect with
  // a retired profile. Edit mode lists ALL of them, because a prospect may
  // already carry an ICP that has since been deactivated; filtering it out would
  // drop the current selection from the dropdown and silently clear the field on
  // save. Inactive entries are labelled so the choice is informed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // pageSize is an allow-listed value (see lib/validators/pagination.ts) —
        // 100 is the maximum the list endpoint accepts.
        const query = isEdit
          ? "page=1&pageSize=100"
          : "page=1&pageSize=100&isActive=true";
        const res = await fetch(`/api/icp?${query}`, { credentials: "include" });
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.success) return;
        const items = body.data?.items ?? [];
        const options: IcpOption[] = items.map(
          (i: { id: string; name: string; isActive?: boolean }) => ({
            id: i.id,
            name: i.name,
            isActive: i.isActive !== false,
          }),
        );

        // The list is capped at one page, so in an org with many ICPs the one
        // this prospect already uses may not be in it. Without this the current
        // value would have no matching <option>, the Select would render blank,
        // and saving would clear a field the user never touched — so fetch that
        // one profile by id and prepend it.
        const current = initial?.icpId;
        if (current && !options.some((o) => o.id === current)) {
          const one = await fetch(`/api/icp/${current}`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          const profile = one?.success ? one.data : null;
          if (profile?.id) {
            options.unshift({
              id: profile.id,
              name: profile.name,
              isActive: profile.isActive !== false,
            });
          }
        }

        if (cancelled) return;
        setIcps(options);
      } catch {
        // Non-fatal: the field simply stays empty and the prospect can be saved
        // without an ICP, which the schema allows.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, initial?.icpId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    // Shared field payload. Edit omits `upworkJobId` entirely — the origin
    // reference is immutable and the PATCH schema rejects it.
    const fields = {
      name,
      email: email || null,
      phone: phone || null,
      title: title || null,
      company: company || null,
      shortSummary: shortSummary || null,
      linkedinUrl: linkedinUrl || null,
      icpId: icpId || null,
    };
    const failMessage = isEdit
      ? "Could not update the prospect"
      : "Could not create the prospect";

    try {
      const res = await fetch(
        isEdit ? `/api/settings/prospects/${prospectId}` : "/api/prospects",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit ? fields : { ...fields, upworkJobId: upworkJobId ?? null },
          ),
        },
      );
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.success) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors);
        throw new Error(body?.error ?? failMessage);
      }

      onSaved?.(body.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : failMessage);
    } finally {
      setSaving(false);
    }
  }

  function fieldError(key: string) {
    return fieldErrors[key] ? (
      <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>
    ) : null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-name">
            Name <span className="text-red-600">*</span>
          </label>
          <Input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact name"
            required
          />
          {fieldError("name")}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-title">
            Title
          </label>
          <Input
            id="pf-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Job title"
          />
          {fieldError("title")}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-company">
            Company
          </label>
          <Input
            id="pf-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
          />
          {fieldError("company")}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-email">
            Email
          </label>
          <Input
            id="pf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
          {fieldError("email")}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-phone">
            Phone
          </label>
          <Input
            id="pf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
          />
          {fieldError("phone")}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-icp">
            ICP
          </label>
          <Select id="pf-icp" value={icpId} onChange={(e) => setIcpId(e.target.value)}>
            <option value="">— None —</option>
            {icps.map((i) => (
              <option key={i.id} value={i.id}>
                {i.isActive ? i.name : `${i.name} (inactive)`}
              </option>
            ))}
          </Select>
          {fieldError("icpId") ?? (
            <p className="mt-1 text-xs text-crm-muted">
              The ICP profile this prospect matches. Choose “None” to clear it.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-linkedin">
            LinkedIn URL
          </label>
          <Input
            id="pf-linkedin"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/…"
          />
          {fieldError("linkedinUrl")}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-crm-text" htmlFor="pf-summary">
            Short summary
          </label>
          <textarea
            id="pf-summary"
            className="crm-input min-h-[80px] w-full"
            value={shortSummary}
            onChange={(e) => setShortSummary(e.target.value)}
            placeholder="Brief summary"
          />
          {fieldError("shortSummary")}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
