import { DataTable } from "@/components/shared/DataTable";
import { getModuleConfig } from "@/lib/modules";

export function InvoiceTable() {
  const config = getModuleConfig("invoices");
  return <DataTable columns={config.columns} rows={config.rows} title={config.title} />;
}
