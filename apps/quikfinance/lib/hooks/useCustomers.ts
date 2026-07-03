"use client";

import { useQuery } from "@tanstack/react-query";
import { getModuleConfig, type TableRow } from "@/lib/modules";

export function useCustomers() {
  const config = getModuleConfig("customers");
  return useQuery({
    queryKey: ["customers"],
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
