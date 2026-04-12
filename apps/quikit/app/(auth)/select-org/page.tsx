"use client";

/**
 * QuikIT Select Organization — /select-org
 *
 * After login, users with multiple org memberships pick which one to
 * work in. Single-org users are auto-forwarded to /apps.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

interface OrgInfo {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}

export default function SelectOrgPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/apps";

  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const active = j.data.filter(
            (o: { status: string }) => o.status === "active",
          );
          setOrgs(active);

          // Auto-forward if only 1 org
          if (active.length === 1) {
            selectOrg(active[0].tenantId);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectOrg(tenantId: string) {
    setSelecting(tenantId);
    try {
      const res = await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const j = await res.json();
      if (j.success) {
        // Update the NextAuth session with the selected tenantId
        try {
          await update({
            tenantId: j.data.tenantId,
            membershipRole: j.data.membershipRole,
          });
        } catch (e) {
          // Session update may fail on first load — proceed anyway
          console.warn("[select-org] session update failed:", e);
        }
        // Always redirect — the JWT callback will re-validate on next request
        window.location.href = callbackUrl;
      } else {
        console.error("[select-org] API error:", j.error);
        setSelecting(null);
      }
    } catch (e) {
      console.error("[select-org] fetch error:", e);
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-2xl font-bold mb-4">
            Q
          </div>
          <h1 className="text-2xl font-bold text-white">Select Organization</h1>
          <p className="text-sm text-gray-400 mt-1">
            Choose which organization to work in
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-4 space-y-2">
          {orgs.length === 0 && (
            <div className="text-center py-8">
              <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                No organizations found. Contact your administrator.
              </p>
            </div>
          )}
          {orgs.map((org) => (
            <button
              key={org.tenantId}
              onClick={() => selectOrg(org.tenantId)}
              disabled={selecting !== null}
              className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-gray-50 transition-colors text-left group disabled:opacity-60"
            >
              <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {org.name}
                </h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {org.role} · {org.plan}
                </p>
              </div>
              {selecting === org.tenantId ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
