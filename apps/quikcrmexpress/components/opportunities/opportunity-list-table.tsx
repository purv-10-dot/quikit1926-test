"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { buildOpportunityFilterRequest } from "./opportunity-advanced-filter";
import { StagePill } from "./stage-pill";
import { Pagination } from "@/components/shared/pagination";
import { SkeletonBar } from "@/components/ui/skeleton";
import type { FilterPayload } from "@/types/lead-filter";
import type { QceOpportunityStage } from "@quikit/database";

type Row = {
  id: string;
  name: string;
  accountId: string | null;
  account: { id: string; name: string } | null;
  stage: QceOpportunityStage;
  amount: number | null;
  currency: string | null;
  amountDisplay: string;
  probability: number;
  closeDate: string | null;
  ownerName: string | null;
};

type ListResp = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

async function fetchList(
  page: number,
  pageSize: number,
  filter: FilterPayload,
  search: string,
): Promise<ListResp> {
  const filterActive = filter.conditions.length > 0;
  const searchActive = search.length > 0;

  if (filterActive || searchActive) {
    const r = await fetch("/api/opportunities/filter", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildOpportunityFilterRequest(filter),
        page,
        pageSize,
        ...(searchActive ? { search } : {}),
      }),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "Failed to load");
    return j.data as ListResp;
  }

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const r = await fetch(`/api/opportunities?${params.toString()}`, { credentials: "include" });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Failed to load");
  return j.data as ListResp;
}

export function OpportunityListTable({
  filterKey,
  filter,
  search,
  resetToken,
}: {
  filterKey: string;
  filter: FilterPayload;
  search: string;
  resetToken: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [page, setPageState] = useState<number>(() =>
    readPageFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readPageSizeFromUrl(new URLSearchParams(searchParams.toString())),
  );

  const writeUrl = useCallback(
    (nextPage: number, nextLimit: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) sp.delete("page");
      else sp.set("page", String(nextPage));
      if (nextLimit === DEFAULT_PAGE_SIZE) sp.delete("limit");
      else sp.set("limit", String(nextLimit));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl(next, pageSize);
    },
    [pageSize, writeUrl],
  );
  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      writeUrl(1, next);
    },
    [writeUrl],
  );

  // Mirror URL → state on browser back/forward.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  useEffect(() => {
    setPageState(1);
    writeUrl(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["opportunities", "list", page, pageSize, filterKey],
    queryFn: () => fetchList(page, pageSize, filter, search),
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-accent-50 text-left text-xs uppercase tracking-wider text-crm-muted">
            <tr>
              <th className="px-3 py-2">Opportunity</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Prob</th>
              <th className="px-3 py-2">Close</th>
              <th className="px-3 py-2">Owner</th>
            </tr>
          </thead>
          <tbody aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-crm-border">
                <td className="px-3 py-3"><SkeletonBar widthClass="w-40" /></td>
                <td className="px-3 py-3"><SkeletonBar widthClass="w-32" /></td>
                <td className="px-3 py-3"><SkeletonBar widthClass="w-20" heightClass="h-5" className="rounded-full" /></td>
                <td className="px-3 py-3 text-right"><SkeletonBar widthClass="w-16" /></td>
                <td className="px-3 py-3 text-right"><SkeletonBar widthClass="w-10" /></td>
                <td className="px-3 py-3"><SkeletonBar widthClass="w-20" /></td>
                <td className="px-3 py-3"><SkeletonBar widthClass="w-24" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">Failed to load</div>;
  if (!data || data.items.length === 0) {
    return (
      <div className="p-6 text-sm text-crm-muted">
        {filter.conditions.length > 0 || search
          ? "No opportunities match your filter."
          : "No opportunities yet."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-accent-50 text-left text-xs uppercase tracking-wider text-crm-muted">
          <tr>
            <th className="px-3 py-2">Opportunity</th>
            <th className="px-3 py-2">Account</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">Prob</th>
            <th className="px-3 py-2">Close</th>
            <th className="px-3 py-2">Owner</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.id} className="border-t border-crm-border hover:bg-accent-50/40">
              <td className="px-3 py-2">
                <Link href={`/opportunities/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-crm-muted">{r.account?.name ?? "—"}</td>
              <td className="px-3 py-2">
                <StagePill stage={r.stage} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-accent-700">
                {r.amountDisplay}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.probability}%</td>
              <td className="px-3 py-2">
                {r.closeDate ? new Date(r.closeDate).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2 text-crm-muted">{r.ownerName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={data.total}
        onPage={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        showPageNumbers
      />
    </div>
  );
}

