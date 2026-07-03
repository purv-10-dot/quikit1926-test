import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function JournalEntriesPage() {
  return <ModulePage config={getModuleConfig("journal-entries")} />;
}
