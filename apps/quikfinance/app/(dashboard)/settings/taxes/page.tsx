import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function TaxesPage() {
  return <ModulePage config={getModuleConfig("taxes")} />;
}
