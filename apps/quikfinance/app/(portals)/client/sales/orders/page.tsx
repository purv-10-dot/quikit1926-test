"use client";

import { ShoppingCart } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function ClientOrdersPage() {
  return (
    <ClientList
      type="orders"
      title="Sales Orders"
      description="Track your orders in progress"
      icon={ShoppingCart}
      columns={[
        { key: "id", label: "Order" },
        { key: "created_at", label: "Date", kind: "date" },
        { key: "total", label: "Amount", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
