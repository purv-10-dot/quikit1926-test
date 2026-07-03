import { ChartOfAccountsWorkspace } from "@/components/chart-of-accounts/ChartOfAccountsWorkspace";
import { PageHeader } from "@/components/shared/PageHeader";

export default function ChartOfAccountsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Chart of Accounts" description="Maintain the account tree, account types, and running balances." />
      <ChartOfAccountsWorkspace />
    </div>
  );
}
