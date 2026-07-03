import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function FixedAssetsPage() {
  return <ModulePage config={getModuleConfig("fixed-assets")} />;
}
