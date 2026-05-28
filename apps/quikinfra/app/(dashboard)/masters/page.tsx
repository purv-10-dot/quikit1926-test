"use client";

/**
 * Masters index — grid of all master data modules.
 */

import { useRouter } from "next/navigation";
import {
  FolderKanban, Package, Boxes, Truck, HardHat, Building2,
  MapPin, Calculator, Receipt, CreditCard, Landmark,
  Users, ListTodo, BarChart3, Hammer, Globe, CalendarCheck, FileText,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";

const MASTERS = [
  { label: "Projects",          href: "/masters/projects",         icon: FolderKanban,  count: 0 },
  { label: "Items / Materials", href: "/masters/items",            icon: Package,       count: 0 },
  { label: "Item Groups",       href: "/masters/item-groups",      icon: Boxes,         count: 0 },
  { label: "Vendors",           href: "/masters/vendors",          icon: Truck,         count: 0 },
  { label: "Contractors",       href: "/masters/contractors",      icon: HardHat,       count: 0 },
  { label: "Customers",         href: "/masters/customers",        icon: Building2,     count: 0 },
  { label: "Locations / Sites", href: "/masters/locations",        icon: MapPin,        count: 0 },
  { label: "UOM",               href: "/masters/uom",              icon: Calculator,    count: 0 },
  { label: "GST Codes",         href: "/masters/gst",              icon: Receipt,       count: 0 },
  { label: "TDS Codes",         href: "/masters/tds",              icon: CreditCard,    count: 0 },
  { label: "Banks",             href: "/masters/banks",            icon: Landmark,      count: 0 },
  { label: "Departments",       href: "/masters/departments",      icon: Users,         count: 0 },
  { label: "Work Categories",   href: "/masters/work-categories",  icon: ListTodo,      count: 0 },
  { label: "Cost Centers",      href: "/masters/cost-centers",     icon: BarChart3,     count: 0 },
  { label: "Machinery",         href: "/masters/machinery",        icon: Hammer,        count: 0 },
  { label: "Companies",         href: "/masters/companies",        icon: Globe,         count: 0 },
  { label: "Financial Years",   href: "/masters/financial-years",  icon: CalendarCheck, count: 0 },
  { label: "Terms & Conditions",href: "/masters/terms",            icon: FileText,      count: 0 },
];

export default function MastersIndexPage() {
  const router = useRouter();

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
                <p className="text-xs text-slate-500 mt-0.5">{m.count} records</p>
              </div>
            </button>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
