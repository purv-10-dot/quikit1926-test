"use client";

/**
 * AccountAclBanner — shown on /accounts when the caller is ACL-restricted, so
 * the empty / partial list isn't silent (P2.10). Calls /api/accounts/acl-scope
 * once on mount.
 */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

interface ScopeResponse {
  unrestricted: boolean;
  count?: number;
}

export function AccountAclBanner() {
  const [scope, setScope] = useState<ScopeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/accounts/acl-scope", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ScopeResponse };
        if (!cancelled && json.data) setScope(json.data);
      } catch {
        // Banner is best-effort — silent on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!scope || scope.unrestricted) return null;
  const count = scope.count ?? 0;
  return (
    <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        Showing the <strong>{count}</strong> account{count === 1 ? "" : "s"} assigned to you.
        Contact your admin to expand access.
      </p>
    </div>
  );
}
