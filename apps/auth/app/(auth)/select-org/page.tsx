import { redirect } from "next/navigation";

/**
 * /select-org is retired — org auto-selection happens in the NextAuth jwt
 * callback (first active OrgMember by createdAt). Multi-org users switch via
 * the launcher's org dropdown. This page is a permanent redirect to /apps so
 * any bookmarks or stale links don't 404.
 */
export default function SelectOrgPage() {
  const target =
    process.env.NEXT_PUBLIC_LAUNCHER_URL ??
    "http://localhost:3001/apps"; // prod-safety-allow: dev fallback
  redirect(target);
}
