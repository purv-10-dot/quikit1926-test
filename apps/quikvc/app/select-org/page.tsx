"use client";

/**
 * Select Org — /select-org
 *
 * Bounced here by the platform middleware when the JWT lacks a orgId,
 * or visited explicitly via the in-app org switcher. Calls the shared
 * /api/org/memberships (filtered to QuikVC) — auto-selects when there's
 * one tenant, picker when there are multiple.
 *
 * After selection, redirects based on the user's role in that tenant:
 *   - VC roles (analyst / partner / fund-admin / ic-member / admin) → /home
 *   - founder                                                       → /dashboard
 *   - investor                                                      → /summary
 *   - unknown                                                       → /home
 *
 * Note: /summary (not /dashboard) for investor because the (founder) and
 * (investor) route groups can't both expose /dashboard in Next.js.
 *
 * Dev escape hatch: when QUIKVC_DEV_BYPASS=1 the middleware skips this
 * page entirely; visit it manually if you want to test the picker.
 */
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, CheckCircle2 } from "lucide-react";

interface OrgInfo {
  orgId: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  status: string;
}

const VC_ROLES = new Set(["analyst", "partner", "fund-admin", "ic-member", "admin"]);
const FOUNDER_ROLES = new Set(["founder"]);
const INVESTOR_ROLES = new Set(["investor", "lp"]);

function landingPathForRole(role: string): string {
  if (VC_ROLES.has(role)) return "/home";
  if (FOUNDER_ROLES.has(role)) return "/dashboard";
  if (INVESTOR_ROLES.has(role)) return "/summary";
  return "/home";
}

export default function SelectOrgPage() {
  const { update } = useSession();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then(async (j) => {
        if (!j.success) {
          setError(j.error ?? "Failed to load organisations");
          return;
        }
        const active = j.data.filter((o: OrgInfo) => o.status === "active");
        setOrgs(active);
        if (active.length === 1) {
          await selectOrg(active[0]);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load organisations");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectOrg(org: OrgInfo) {
    setSelecting(true);
    setError(null);
    try {
      const r = await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.orgId }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Selection failed");
        setSelecting(false);
        return;
      }
      // Persist into the JWT so downstream withTenantAuth calls see it.
      await update({ orgId: org.orgId, membershipRole: org.role });
      // Hard navigation to ensure server components re-fetch session.
      window.location.href = landingPathForRole(org.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
      setSelecting(false);
    }
  }

  if (loading || selecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-4" />
          <p className="text-sm text-gray-500">
            {selecting ? "Setting up your workspace…" : "Loading organisations…"}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-6">
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No QuikVC access</h2>
          <p className="text-sm text-gray-500">
            You don&apos;t have access to QuikVC in any organisation. Contact your fund admin or
            ask them to enable QuikVC for your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-wider text-gray-400">QuikVC OS</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Select Organisation</h1>
          <p className="text-sm text-gray-500 mt-1">Choose which fund to work in</p>
        </div>
        <div className="space-y-3">
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onClick={() => selectOrg(org)}
              className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-slate-400 hover:shadow-md transition-all text-left"
            >
              <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-slate-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{org.name}</p>
                <p className="text-xs text-gray-500 uppercase">
                  {org.role} · {org.plan}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
