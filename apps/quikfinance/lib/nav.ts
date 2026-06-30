import { navigationGroups, type NavItem } from "@/lib/modules";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";
import { Settings } from "lucide-react";

export type NavDest = { title: string; href: string; group: string; icon: NavItem["icon"] };

/** Flattened, de-duplicated list of every reachable navigation destination (incl. Settings). */
export function allDestinations(): NavDest[] {
  const out: NavDest[] = [];
  const seen = new Set<string>();
  const push = (title: string, href: string, group: string, icon: NavItem["icon"]) => {
    if (href && !seen.has(href)) { seen.add(href); out.push({ title, href, group, icon }); }
  };
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.href) push(item.title, item.href, group.label, item.icon);
      for (const child of item.children ?? []) if (child.href) push(child.title, child.href, group.label, child.icon);
    }
  }
  // Settings live behind the gear icon now — keep them reachable via Ctrl+K.
  push("Settings", "/settings", "Settings", Settings);
  for (const section of SETTINGS_CATALOG) {
    for (const cat of section.categories) {
      for (const link of cat.links) push(link.title, link.href, "Settings", cat.icon);
    }
  }
  return out;
}

export function destByHref(href: string): NavDest | undefined {
  return allDestinations().find((d) => d.href === href);
}

/** Quick-create actions for the command palette and the global "+" button. */
export const QUICK_CREATE: { label: string; href: string }[] = [
  { label: "New Invoice", href: "/invoices/new" },
  { label: "New Bill", href: "/bills/new" },
  { label: "New Quote", href: "/quotations/new" },
  { label: "New Sales Order", href: "/sales-orders/new" },
  { label: "New Purchase Order", href: "/purchase-orders/new" },
  { label: "New Credit Note", href: "/credit-notes/new" },
  { label: "New Vendor Credit", href: "/vendor-credits/new" },
  { label: "New Expense", href: "/expenses/new" },
  { label: "New Journal", href: "/journal-entries/new" },
  { label: "New Budget", href: "/budgets/new" },
  { label: "New Customer", href: "/customers/new" },
  { label: "New Vendor", href: "/vendors/new" }
];
