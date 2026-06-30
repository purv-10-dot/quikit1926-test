"use client";

import { useQuery } from "@tanstack/react-query";
import { getModuleConfig, type TableRow } from "@/lib/modules";

export function useInvoices() {
  const config = getModuleConfig("invoices");
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<TableRow[]> => {
      const response = await fetch(config.apiPath);
      if (!response.ok) {
        return config.rows;
      }
      const payload = (await response.json()) as { data?: TableRow[] };
      return payload.data?.length ? payload.data : config.rows;
    },
    initialData: config.rows
  });
}
