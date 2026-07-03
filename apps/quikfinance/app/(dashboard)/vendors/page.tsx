import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function VendorsPage() {
  return <ModulePage config={getModuleConfig("vendors")} />;
}
