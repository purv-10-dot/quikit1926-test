"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

interface Me {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

export function HeroBanner() {
  const api = useApiClient();
  const { data: meRes } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const me = meRes?.data;
  const firstName = me ? (me.displayName ?? `${me.firstName} ${me.lastName}`) : "there";

  return (
    <div className="w-full pt-5 pb-4">
      <h1 className="font-serif-display text-[#0A1733] text-[36px] lg:text-[48px] leading-[1.05] font-bold tracking-tight">
        Hi {firstName},
      </h1>
      <h2 className="font-serif-display text-[#15296B] text-[28px] lg:text-[36px] leading-[1.1] font-semibold tracking-tight mt-1">
        glad you&apos;re here <span className="inline-block">👋</span>
      </h2>
      <p className="text-[#5c7168] text-sm lg:text-base mt-3 font-medium">Here&apos;s what&apos;s happening today</p>
    </div>
  );
}
