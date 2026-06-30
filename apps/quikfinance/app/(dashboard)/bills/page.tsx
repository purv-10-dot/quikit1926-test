import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function BillsPage() {
  return <ModulePage config={getModuleConfig("bills")} />;
}
