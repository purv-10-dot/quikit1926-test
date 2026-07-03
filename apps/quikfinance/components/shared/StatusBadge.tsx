import { Badge, type BadgeTone } from "@/components/ui/badge";

const toneByStatus: Record<string, BadgeTone> = {
  active: "success",
  paid: "success",
  posted: "success",
  approved: "success",
  sent: "info",
  viewed: "info",
  partial: "warning",
  draft: "muted",
  submitted: "warning",
  overdue: "danger",
  void: "danger",
  inactive: "muted",
  in_stock: "success",
  service: "info"
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.replaceAll("_", " ");
  return <Badge tone={toneByStatus[status] ?? "default"}>{normalized}</Badge>;
}
