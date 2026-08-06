"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

export { INR, INR_LAKH } from "./_shared-constants";

// Lazy-load recharts so the heavy chart bundle (~60KB gzipped) is only fetched
// when a tab actually renders a Donut.
export const Donut = dynamic(() => import("./_donut"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-50 animate-pulse rounded" />,
});

export function KPI({ label, value, top, hint, linkLabel, href }: {
  label: string; value: string; top?: string; hint?: string; linkLabel?: string; href?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.03em] tracking-wide">{label}</p>
        {top && <span className="text-[10px] font-semibold text-gray-400">{top}</span>}
      </div>
      <p className="font-serif-display text-lg md:text-xl font-bold text-gray-900 truncate">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {linkLabel && href && (
        <Link href={href} className="mt-2 inline-block text-xs font-semibold text-[#22c55e] hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-[13px] font-semibold text-gray-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

