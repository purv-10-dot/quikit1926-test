"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Background poll for revoked access. Set to 24h because:
//   1. Server-side JWT callback already re-checks membership every 5min
//      on any authenticated request (packages/auth/index.ts RECHECK_INTERVAL).
//      Active users catch revocation within 5 min regardless of this poll.
//   2. Focus/visibility listener below ALSO validates immediately whenever
//      the user returns to the tab. Active users = effectively instant.
//   3. Only fully idle tabs (user never focuses for 24h) wait the full
//      interval to detect server-side revocation.
//
// Trade: DB load on /api/session/validate drops ~1,700x vs the previous 60s
// poll at the cost of 24h worst-case for idle-tab-with-revoked-access.
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
/** Add ±30min jitter to prevent thundering herd when many clients poll simultaneously */
function jitteredInterval() {
  return CHECK_INTERVAL + Math.floor(Math.random() * 3_600_000) - 1_800_000;
}

export interface SessionGuardConfig {
  validateEndpoint?: string;
  loginRoute?: string;
}

async function validateSession(endpoint: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return { valid: false, reason: "validation_error" };
    return await res.json();
  } catch {
    // Network error — treat as valid to avoid false logouts on transient failures,
    // but log for observability
    console.warn("[session-guard] Validation fetch failed, assuming valid");
    return { valid: true };
  }
}

export function createSessionGuard(config: SessionGuardConfig = {}) {
  const endpoint = config.validateEndpoint || "/api/session/validate";
  const loginRoute = config.loginRoute || "/login";

  async function handleInvalid(reason?: string) {
    const param = reason === "app_access_revoked" ? "app_revoked" : "deactivated";
    await signOut({ callbackUrl: `${loginRoute}?reason=${param}` });
  }

  return function SessionGuard({ children }: { children: React.ReactNode }) {
    const { status, update } = useSession();
    const router = useRouter();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      if (status !== "authenticated") return;
      async function check() {
        const data = await validateSession(endpoint);
        if (!data.valid) await handleInvalid(data.reason);
      }
      check();
    }, [status]);

    useEffect(() => {
      if (status !== "authenticated") return;
      async function poll() {
        const data = await validateSession(endpoint);
        if (!data.valid) { await handleInvalid(data.reason); return; }
        const updated = await update();
        if (updated?.user?.membershipInvalid) await handleInvalid("deactivated");
        else if (updated && !updated.user?.tenantId) router.push("/select-org");
      }
      intervalRef.current = setInterval(poll, jitteredInterval());
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [status]);

    useEffect(() => {
      if (status !== "authenticated") return;
      async function onFocus() {
        const data = await validateSession(endpoint);
        if (!data.valid) await handleInvalid(data.reason);
      }
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }, [status]);

    return <>{children}</>;
  };
}
