/**
 * FF-1 route gate for "criticalNumbers" module. Redirects to
 * /dashboard?feature_disabled=criticalNumbers when the module is disabled for
 * the caller's tenant. Matches the pattern used by priority / www / kpi —
 * required here because Critical Numbers is a TOP-LEVEL Execution module, so
 * there's no parent whose gate it could inherit via the cascade rule.
 */
import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function FeatureFlagLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("quikscale", "criticalNumbers", authOptions);
  return <>{children}</>;
}
