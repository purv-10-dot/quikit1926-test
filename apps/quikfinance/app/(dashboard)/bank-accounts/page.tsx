import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function BankAccountsPage() {
  return <ModulePage config={getModuleConfig("bank-accounts")} />;
}
