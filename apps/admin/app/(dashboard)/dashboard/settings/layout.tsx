/**
 * FF-1 route gate for "settings" module. Redirects to /dashboard?feature_disabled=settings
 * when the module is disabled for the caller's tenant.
 */
import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function FeatureFlagLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("admin", "settings", authOptions);
  return <>{children}</>;
}
