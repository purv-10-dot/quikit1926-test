"use client";

/**
 * Select Org — /select-org
 *
 * Loads user's memberships, auto-selects if only one,
 * shows a picker if multiple. Updates the session with
 * the chosen tenantId + role, then navigates to /dashboard.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Building2, CheckCircle2 } from "lucide-react";

interface OrgInfo {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}

export default function SelectOrgPage() {
  const { update } = useSession();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then(async (j) => {
        if (j.success) {
          const active = j.data.filter((o: { status: string }) => o.status === "active");
          setOrgs(active);
          // Auto-select if only one org
          if (active.length === 1) {
            await selectOrg(active[0]);
          }
        }
      })
      .catch((err) => {
        console.error("[select-org] Failed to load memberships:", err);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectOrg(org: OrgInfo) {
    setSelecting(true);
    try {
      await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: org.tenantId }),
      });
      await update({ tenantId: org.tenantId, membershipRole: org.role });
      window.location.href = "/dashboard";
    } catch {
      setSelecting(false);
    }
  }

  if (loading || selecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">
            {selecting ? "Setting up your workspace..." : "Loading organizations..."}
          </p>
        </div>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Organizations</h2>
          <p className="text-sm text-gray-500">
            You don&apos;t have any active organization memberships. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900">Select Organization</h1>
          <p className="text-sm text-gray-500 mt-1">Choose which organization to work in</p>
        </div>
        <div className="space-y-3">
          {orgs.map((org) => (
            <button
              key={org.tenantId}
              onClick={() => selectOrg(org)}
              className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all text-left"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{org.name}</p>
                <p className="text-xs text-gray-500 uppercase">{org.role} · {org.plan}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
