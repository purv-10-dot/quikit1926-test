import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function ExpensesPage() {
  return <ModulePage config={getModuleConfig("expenses")} />;
}
