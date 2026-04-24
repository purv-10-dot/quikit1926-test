import Link from "next/link";
import {
  Building2, Users, Briefcase, HardHat, Package, Boxes, Ruler,
  Building, Layers, PieChart, MapPin, Percent, Receipt, FileText,
  Landmark, CalendarRange, Hammer, Truck, Archive,
} from "lucide-react";

const MASTER_SECTIONS: Array<{
  title: string;
  items: Array<{ href: string; label: string; description: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    title: "People & Partners",
    items: [
      { href: "/masters/companies",   label: "Companies",   description: "Legal entities with GSTIN/PAN/CIN.",           icon: Building2 },
      { href: "/masters/vendors",     label: "Vendors",     description: "Suppliers for materials and services.",        icon: Users },
      { href: "/masters/customers",   label: "Customers",   description: "Clients you bill for projects.",               icon: Briefcase },
      { href: "/masters/contractors", label: "Contractors", description: "Subcontractors with specialisation + license.", icon: HardHat },
    ],
  },
  {
    title: "Items & Inventory",
    items: [
      { href: "/masters/items",       label: "Items",       description: "Materials, consumables, services.",    icon: Package },
      { href: "/masters/item-groups", label: "Item Groups", description: "Hierarchical categorisation.",         icon: Boxes },
      { href: "/masters/uom",         label: "UOM",         description: "Units of measurement.",                icon: Ruler },
    ],
  },
  {
    title: "Organisation",
    items: [
      { href: "/masters/departments",     label: "Departments",     description: "Functional departments.",       icon: Building },
      { href: "/masters/work-categories", label: "Work Categories", description: "Types of construction work.",   icon: Layers },
      { href: "/masters/cost-centers",    label: "Cost Centers",    description: "Accounting cost buckets.",      icon: PieChart },
      { href: "/masters/locations",       label: "Locations",       description: "Sites, warehouses, offices.",   icon: MapPin },
    ],
  },
  {
    title: "Financial",
    items: [
      { href: "/masters/gst",              label: "GST Codes",         description: "Tax rate slabs.",               icon: Percent },
      { href: "/masters/tds",              label: "TDS Codes",         description: "Income tax deduction sections.", icon: Receipt },
      { href: "/masters/terms",            label: "Terms & Conditions", description: "Reusable clauses.",           icon: FileText },
      { href: "/masters/banks",            label: "Banks",             description: "Bank accounts per company.",    icon: Landmark },
      { href: "/masters/financial-years",  label: "Financial Years",   description: "Fiscal periods.",               icon: CalendarRange },
    ],
  },
  {
    title: "Project Operations",
    items: [
      { href: "/masters/projects",  label: "Projects",  description: "Construction projects.",                icon: Hammer },
      { href: "/masters/machinery", label: "Machinery", description: "Heavy equipment — owned or rented.",    icon: Truck },
      { href: "/masters/assets",    label: "Assets",    description: "Non-inventory fixed assets.",           icon: Archive },
    ],
  },
];

export default function MastersIndex() {
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Masters</h1>
      <p className="text-sm text-gray-500 mb-6">
        Reference data for the whole ERP — create these before you can transact.
      </p>

      {MASTER_SECTIONS.map((section) => (
        <section key={section.title} className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {section.title}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition"
              >
                <div className="p-2 rounded-lg bg-accent-50 text-accent-700">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
