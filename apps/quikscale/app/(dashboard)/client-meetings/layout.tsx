/**
 * Feature-gate route layout for the `clientMeetings` module.
 * Redirects to /dashboard?feature_disabled=clientMeetings when the license is off.
 */
import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function ClientMeetingsLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("quikscale", "clientMeetings", authOptions);
  return <>{children}</>;
}
