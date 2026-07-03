import { StatusBadge } from "@/components/shared/StatusBadge";

export function InvoiceStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}
