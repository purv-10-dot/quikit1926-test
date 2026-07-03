import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function CreditNotesPage() {
  return <ModulePage config={getModuleConfig("credit-notes")} />;
}
