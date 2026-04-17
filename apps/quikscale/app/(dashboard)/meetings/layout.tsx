/**
 * FF-1 route gate for "meetings" module. Redirects to /dashboard?feature_disabled=meetings
 * when the module (or any ancestor via cascade rule) is disabled for the caller's tenant.
 */
import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function FeatureFlagLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("quikscale", "meetings", authOptions);
  return <>{children}</>;
}
