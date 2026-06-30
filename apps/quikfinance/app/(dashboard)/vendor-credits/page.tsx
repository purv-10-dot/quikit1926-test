import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function VendorCreditsPage() {
  return <ModulePage config={getModuleConfig("vendor-credits")} />;
}
