"use client";

/**
 * In-app organisation switcher dropdown.
 *
 * Lives in the VC layout's top context bar. For users with active QuikVC
 * memberships in multiple tenants, lets them swap without going back to
 * /select-org. For single-tenant users, renders as a non-interactive label
 * (no point dropping a dropdown that has one item).
 *
 * After switching, performs a hard navigation to /home so server components
 * re-fetch session + tenant-scoped data.
 */
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, ChevronDown, CheckCircle2 } from "lucide-react";

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

/**
 * Where each role lands after a successful org switch. Mirrors the
 * landingPathForRole() in /select-org so swap behavior is consistent
 * regardless of entry point.
 */
function landingPathForRole(role: string): string {
  if (VC_ROLES.has(role)) return "/home";
  if (FOUNDER_ROLES.has(role)) return "/dashboard";
  if (INVESTOR_ROLES.has(role)) return "/summary";
  return "/home";
}

export default function OrgSwitcher({
  currentTenantName,
}: {
  currentTenantName?: string;
}) {
  const { data: session, update } = useSession();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentTenantId = session?.user?.orgId;

  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setOrgs(j.data.filter((o: OrgInfo) => o.status === "active"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchTo(org: OrgInfo) {
    setSwitching(org.orgId);
    try {
      const r = await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.orgId }),
      });
      const j = await r.json();
      if (!j.success) {
        setSwitching(null);
        return;
      }
      await update({ orgId: org.orgId, membershipRole: org.role });
      // Role-aware redirect — same logic as /select-org. The OrgSwitcher
      // lives in the (vc) layout so most callers land on /home, but a
      // tenant where this user is a founder/investor should route there.
      window.location.href = landingPathForRole(org.role);
    } catch {
      setSwitching(null);
    }
  }

  // Single-org users get a static label, not a dropdown. Avoids visual noise
  // for the 80% case.
  if (!loading && orgs.length <= 1) {
    return (
      <span className="font-medium text-gray-900 truncate">
        {currentTenantName ?? orgs[0]?.name ?? "—"}
      </span>
    );
  }

  const current = orgs.find((o) => o.orgId === currentTenantId);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 px-2 py-1 text-sm rounded-md hover:bg-gray-100"
      >
        <Building2 className="h-4 w-4 text-gray-500" />
        <span className="font-medium text-gray-900 truncate max-w-[160px]">
          {current?.name ?? currentTenantName ?? "Select org"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-72 py-1">
          <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            Switch organisation
          </p>
          {orgs.map((org) => (
            <button
              key={org.orgId}
              type="button"
              disabled={switching !== null}
              onClick={() => switchTo(org)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50 ${
                org.orgId === currentTenantId ? "bg-slate-50" : ""
              }`}
            >
              <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{org.name}</p>
                <p className="text-[10px] text-gray-500 uppercase">
                  {org.role} · {org.plan}
                </p>
              </div>
              {org.orgId === currentTenantId && (
                <CheckCircle2 className="h-4 w-4 text-slate-700 flex-shrink-0" />
              )}
              {switching === org.orgId && (
                <span className="text-[10px] text-gray-400">Switching…</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
