import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function QuotationsPage() {
  return <ModulePage config={getModuleConfig("quotations")} />;
}
