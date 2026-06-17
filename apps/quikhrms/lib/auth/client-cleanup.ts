import { clearToken } from "@/lib/auth/token-store";
import { abortAllInflight } from "@/lib/api-client";

/**
 * Keys holding user/tenant-scoped data that must not survive a session.
 * Device-level prefs (hrms.theme, hrms.sidebarCollapsed) deliberately persist —
 * they carry no tenant data and re-applying them per login would be hostile UX.
 */
const SESSION_SCOPED_LOCAL_KEYS = [
  "hrms.roles", // dev role spoofing
  "hrms.roles.impersonate", // dev role impersonation
  "hrms.asset.customCategories", // tenant data — must not leak to the next user
  "hrms.orgId", // dev no-login identity
  "hrms.userId", // dev no-login identity
];

/**
 * Clear all client-held session state. Call on logout and on session expiry,
 * BEFORE navigating away, so nothing user- or tenant-scoped survives into the
 * next session on a shared machine:
 * - aborts every in-flight GET (responses for the old user must not land)
 * - clears the legacy sessionStorage token pair (hrms_token / hrms_refresh)
 * - removes session-scoped localStorage keys
 */
export function clearClientSessionState(): void {
  if (typeof window === "undefined") return;
  abortAllInflight();
  clearToken();
  for (const key of SESSION_SCOPED_LOCAL_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
