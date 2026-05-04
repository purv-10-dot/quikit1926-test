/**
 * Page-level session guard.
 *
 *   const { orgId, userId, session } = await requireSession();
 *
 * Behaviour:
 *   - real NextAuth session present → returns { session, orgId, userId }
 *   - no session, dev bypass enabled (QUIKVC_DEV_BYPASS=1) → demo session
 *   - no session in any other environment → redirect to /login?callbackUrl=…
 *
 * Use from server components / page.tsx / layout.tsx. For API routes, prefer
 * `withOrgAuth` which has its own auth + 401 handling.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Session } from "next-auth";
import { getDevAwareSession } from "@/lib/dev-session";

export interface PageSessionContext {
  session: Session;
  orgId: string;
  userId: string;
}

export async function requireSession(): Promise<PageSessionContext> {
  const session = await getDevAwareSession();
  const userId = session?.user?.id;
  const orgId = session?.user?.orgId;

  if (!session || !userId || !orgId) {
    // Build callbackUrl so the user lands back where they were after login.
    let callback = "/";
    try {
      const h = await headers();
      const path = h.get("x-invoke-path") ?? h.get("next-url") ?? "/";
      callback = path;
    } catch {
      // headers() can throw outside a request context — fall back to "/"
    }
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return { session, orgId, userId };
}
