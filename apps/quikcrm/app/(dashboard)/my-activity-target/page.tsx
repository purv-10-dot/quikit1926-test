import { requireUser } from "@/lib/auth/require";
import { MyActivityTargetClient } from "@/components/dashboard/my-activity-target-client";

/**
 * My Activity Target — self-service page for the logged-in user.
 * Any authenticated user may open it; the client redirects to /dashboard if
 * they have no assigned target (the API returns { assigned: false }). Data is
 * always the caller's own — the API takes no userId.
 */
export default async function MyActivityTargetPage() {
  await requireUser();
  return <MyActivityTargetClient />;
}
