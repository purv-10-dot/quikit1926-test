/**
 * FF-1 route gate for "teams" module. Redirects to /dashboard?feature_disabled=teams
 * when the module is disabled for the caller's tenant.
 */
import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function FeatureFlagLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("admin", "teams", authOptions);
  return <>{children}</>;
}
