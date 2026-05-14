"use client";

import { useEffect, useState } from "react";
import { Loader2, Building2 } from "lucide-react";
import { ROLE_HIERARCHY } from "@/lib/constants";

const MIN_ADMIN_LEVEL = ROLE_HIERARCHY["admin"];

interface OrgOption {
  orgId: string;
  name: string;
  slug: string;
  role: string;
}

export default function SelectOrgPage() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/org/memberships", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setOrgs(d.data ?? []))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function selectOrg(org: OrgOption) {
    setSelecting(org.orgId);
    try {
      const res = await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.orgId }),
      });
      const json = await res.json();
      if (json.success) {
        const roleLevel = ROLE_HIERARCHY[org.role as keyof typeof ROLE_HIERARCHY] ?? -1;
        window.location.href = roleLevel >= MIN_ADMIN_LEVEL ? "/launcher" : "/member/apps";
      }
    } finally {
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-secondary)]" />
      </div>
    );
  }

  const hasMultiple = orgs.length > 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
        </div>

        <h1 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
          {hasMultiple ? "Select Organisation" : "Welcome back"}
        </h1>
        <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
          {hasMultiple
            ? "You're a member of multiple organisations. Choose one to continue."
            : "Continue to your organisation."}
        </p>

        <div className="flex flex-col gap-3">
          {orgs.map((org) => {
            const roleLevel = ROLE_HIERARCHY[org.role as keyof typeof ROLE_HIERARCHY] ?? -1;
            const isAdmin = roleLevel >= MIN_ADMIN_LEVEL;

            return (
              <button
                key={org.orgId}
                onClick={() => selectOrg(org)}
                disabled={!!selecting}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3.5 text-left hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors disabled:opacity-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary-light)]">
                  <Building2 className="h-5 w-5 text-[var(--color-secondary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--color-text-primary)] truncate">{org.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] capitalize">
                    {org.role}
                    {isAdmin ? " · Admin Portal" : " · Member"}
                  </p>
                </div>
                {selecting === org.orgId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-secondary)] shrink-0" />
                ) : (
                  <span className="text-[var(--color-text-tertiary)] shrink-0">→</span>
                )}
              </button>
            );
          })}

          {orgs.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
              No active memberships found. Contact your administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
