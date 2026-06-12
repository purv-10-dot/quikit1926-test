"use client";

import { useMemo, useState } from "react";

export function useClientPagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);
  return { page, setPage, totalPages, items: current, total: items.length };
}
