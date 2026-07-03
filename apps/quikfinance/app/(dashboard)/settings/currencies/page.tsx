import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function CurrenciesPage() {
  return <ModulePage config={getModuleConfig("currencies")} />;
}
