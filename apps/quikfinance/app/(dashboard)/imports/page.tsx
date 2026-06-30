import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function ImportsPage() {
  return <ModulePage config={getModuleConfig("imports")} />;
}
