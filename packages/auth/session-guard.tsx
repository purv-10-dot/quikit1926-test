"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const CHECK_INTERVAL = 60 * 1000;

export interface SessionGuardConfig {
  validateEndpoint?: string;
  loginRoute?: string;
}

async function validateSession(endpoint: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const res = await fetch(endpoint);
    return await res.json();
  } catch {
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
      intervalRef.current = setInterval(poll, CHECK_INTERVAL);
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
