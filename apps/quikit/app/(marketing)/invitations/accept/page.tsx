import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPage } from "../../_components/static-page";
import { loadPage } from "../../_lib/load-page";

/**
 * Invitation accept landing — lives INSIDE the marketing route group so
 * it inherits `(marketing)/layout.tsx`, which is the layout that mounts
 * the watercolor intro and the global <LoginModal />.
 *
 * The page itself just renders the same content the marketing home page
 * renders (so the background looks identical to image 4). The LoginModal
 * detects `pathname === "/invitations/accept"` plus `?token=…` on mount
 * and auto-opens in its "invitation" view, presenting the Set-Password
 * form in the same light "paper" styling as the regular Welcome-back
 * popup — see _components/login-modal.tsx.
 *
 * No server-side token validation here: the modal calls
 * GET /api/invitations/accept on the client to fetch invitation details,
 * and POSTs the new password (or skip) to the same endpoint. That route
 * lives at app/api/invitations/accept/route.ts on this launcher.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set Up Your Account — QuikIT",
  robots: { index: false, follow: false },
};

export default async function InvitationAcceptPage() {
  const page = await loadPage("index");
  if (!page) notFound();
  return <StaticPage page={page} />;
}
