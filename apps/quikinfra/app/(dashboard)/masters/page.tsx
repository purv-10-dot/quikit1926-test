"use client";

/**
 * Masters index — grid of all master data modules.
 */

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban, Package, Boxes, Truck, HardHat, Building2,
  MapPin, Calculator, Receipt, CreditCard, Landmark,
  Users, ListTodo, BarChart3, Hammer, Globe, CalendarCheck, FileText,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";

const MASTERS = [
  { key: "projects",       label: "Projects",          href: "/masters/projects",         icon: FolderKanban },
  { key: "items",          label: "Items / Materials", href: "/masters/items",            icon: Package },
  { key: "itemGroups",     label: "Item Groups",       href: "/masters/item-groups",      icon: Boxes },
  { key: "vendors",        label: "Vendors",           href: "/masters/vendors",          icon: Truck },
  { key: "contractors",    label: "Contractors",       href: "/masters/contractors",      icon: HardHat },
  { key: "customers",      label: "Customers",         href: "/masters/customers",        icon: Building2 },
  { key: "locations",      label: "Locations / Sites", href: "/masters/locations",        icon: MapPin },
  { key: "uom",            label: "UOM",               href: "/masters/uom",              icon: Calculator },
  { key: "gst",            label: "GST Codes",         href: "/masters/gst",              icon: Receipt },
  { key: "tds",            label: "TDS Codes",         href: "/masters/tds",              icon: CreditCard },
  { key: "banks",          label: "Banks",             href: "/masters/banks",            icon: Landmark },
  { key: "departments",    label: "Departments",       href: "/masters/departments",      icon: Users },
  { key: "workCategories", label: "Work Categories",   href: "/masters/work-categories",  icon: ListTodo },
  { key: "costCenters",    label: "Cost Centers",      href: "/masters/cost-centers",     icon: BarChart3 },
  { key: "machinery",      label: "Machinery",         href: "/masters/machinery",        icon: Hammer },
  { key: "companies",      label: "Companies",         href: "/masters/companies",        icon: Globe },
  { key: "financialYears", label: "Financial Years",   href: "/masters/financial-years",  icon: CalendarCheck },
  { key: "terms",          label: "Terms & Conditions",href: "/masters/terms",            icon: FileText },
];

export default function MastersIndexPage() {
  const router = useRouter();

  // Live record counts per master. Refetches on mount so the cards reflect
  // data created since the page was last opened.
  const { data: summary, isLoading } = useQuery<{ data: Record<string, number> }>({
    queryKey: ["masters-summary"],
    queryFn: async () => {
      const res = await fetch("/api/masters/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load master counts");
      return res.json();
    },
    refetchOnMount: "always",
    staleTime: 0,
  });
  const counts = summary?.data ?? {};

  return (
    <>
      <PageHeader
        title="Master Data"
        subtitle="Foundation data for all construction modules"
      />
      <PageContainer>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {MASTERS.map((m) => (
            <button
              key={m.href}
              onClick={() => router.push(m.href)}
              className="group relative flex flex-col items-start gap-3 p-5 rounded-xl bg-white border border-slate-200 shadow-soft hover:shadow-md hover:border-orange-200 hover:-translate-y-0.5 transition-all text-left overflow-hidden"
            >
              {/* hover-revealed accent stripe */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 opacity-0 group-hover:opacity-100 transition-opacity"
              />
              <div className="flex w-full items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 flex items-center justify-center ring-1 ring-orange-100 group-hover:from-orange-500 group-hover:to-orange-600 group-hover:text-white group-hover:ring-orange-300 transition-colors">
                  <m.icon className="w-5 h-5" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{m.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isLoading ? "…" : (counts[m.key] ?? 0)} records
                </p>
              </div>
            </button>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
