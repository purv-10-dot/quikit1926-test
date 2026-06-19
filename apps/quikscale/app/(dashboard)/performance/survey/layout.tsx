import { gateModuleRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function SurveyLayout({ children }: { children: React.ReactNode }) {
  await gateModuleRoute("quikscale", "survey", authOptions);
  return <>{children}</>;
}
