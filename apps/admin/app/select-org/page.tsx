"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronRight, Loader2, Shield } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";

interface OrgMembership {
  membershipId: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  plan: string;
  role: string;
  status: string;
}

export default function SelectOrgPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrgs() {
      const res = await fetch("/api/org/memberships");
      const json = await res.json();
      if (json.success) {
        setOrgs(json.data);
      }
      setLoading(false);
    }
    fetchOrgs();
  }, []);

  async function selectOrg(tenantId: string) {
    setSelecting(tenantId);

    const res = await fetch("/api/org/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });

    const json = await res.json();
    if (json.success) {
      await updateSession({
        tenantId: json.data.tenantId,
        membershipRole: json.data.membershipRole,
      });
      router.push("/dashboard");
    } else {
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
      <div className="w-full max-w-md px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-secondary-light)] mb-4">
            <Shield className="h-6 w-6 text-[var(--color-secondary)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Select Organisation
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Choose an organisation to manage
          </p>
        </div>

        {session?.user?.isSuperAdmin && (
          <button
            onClick={() => router.push("/dashboard/organisations")}
            className="w-full text-left mb-4"
          >
            <Card className="flex items-center gap-4 hover:border-[var(--color-secondary)] hover:shadow-md transition-all cursor-pointer bg-[var(--color-secondary-light)]">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[var(--color-secondary)] text-white shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[var(--color-text-primary)]">
                  Manage All Organisations
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Platform super admin access
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-[var(--color-text-tertiary)]" />
            </Card>
          </button>
        )}

        {orgs.length === 0 ? (
          <Card className="text-center py-8">
            <Building2 className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              You don't have admin access to any organisations.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => (
              <button
                key={org.tenantId}
                onClick={() => selectOrg(org.tenantId)}
                disabled={selecting !== null}
                className="w-full text-left"
              >
                <Card className="flex items-center gap-4 hover:border-[var(--color-secondary)] hover:shadow-md transition-all cursor-pointer">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-lg text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: org.brandColor || "#6366f1" }}
                  >
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--color-text-primary)] truncate">
                      {org.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={org.role}>
                        {ROLE_LABELS[org.role] || org.role}
                      </Badge>
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {org.plan}
                      </span>
                    </div>
                  </div>
                  {selecting === org.tenantId ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-tertiary)]" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                  )}
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
