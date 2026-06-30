import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function PeriodLocksPage() {
  return <ModulePage config={getModuleConfig("period-locks")} />;
}
