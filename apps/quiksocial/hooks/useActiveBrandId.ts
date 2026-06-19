/**
 * useActiveBrandId — client hook for the caller's active brand id.
 *
 * QuiKit's OIDC session does NOT carry `activeBrandId` on the user object,
 * so client components can no longer read it from `useSession()`. Instead,
 * the active brand lives in `app_quiksocial.UserPreference` per (orgId, userId)
 * and is exposed to the browser through `GET /api/user/active-brand`.
 *
 * This hook fetches that endpoint once on mount and exposes the result.
 * Callers that previously read `(session?.user as any)?.activeBrandId`
 * should swap to:
 *
 *     const activeBrandId = useActiveBrandId();
 */

import { useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";

export function useActiveBrandId(): string | null {
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/active-brand", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(unwrap)
      .then((data) => {
        if (cancelled || !data) return;
        const next =
          (data as { activeBrandId?: string | null; brandId?: string | null })
            ?.activeBrandId ??
          (data as { brandId?: string | null })?.brandId ??
          null;
        setActiveBrandId(next ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveBrandId(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return activeBrandId;
}
