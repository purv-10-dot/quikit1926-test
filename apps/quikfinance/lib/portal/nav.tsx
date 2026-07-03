import {
  LayoutDashboard, FileText, ShoppingCart, Truck, Wallet, FolderOpen, LifeBuoy, UserCircle,
  Receipt, ClipboardCheck, Package, Boxes, CreditCard, MessagesSquare, Banknote, ShieldCheck,
  Calculator, CalendarClock, FileBarChart, Landmark, BookOpen, type LucideIcon
} from "lucide-react";
import type { PortalKey } from "./hosts";

export type NavItem = { title: string; href: string; icon: LucideIcon };
export type NavGroup = { title: string; items: NavItem[] };

export type PortalMeta = {
  key: PortalKey;
  name: string;
  tagline: string;
  accent: string; // tailwind classes for the brand chip
  nav: NavGroup[];
};

export const PORTALS: Record<PortalKey, PortalMeta> = {
  client: {
    key: "client",
    name: "Client Portal",
    tagline: "Your account with us",
    accent: "bg-indigo-600",
    nav: [
      { title: "Overview", items: [{ title: "Dashboard", href: "/client/dashboard", icon: LayoutDashboard }] },
      { title: "Sales", items: [
        { title: "Quotes", href: "/client/sales/quotes", icon: FileText },
        { title: "Sales Orders", href: "/client/sales/orders", icon: ShoppingCart },
        { title: "Invoices", href: "/client/sales/invoices", icon: Receipt },
        { title: "Credit Notes", href: "/client/sales/credit-notes", icon: ClipboardCheck }
      ] },
      { title: "Finance", items: [
        { title: "Statement", href: "/client/finance/statement", icon: FileBarChart },
        { title: "Payments", href: "/client/finance/payments", icon: Wallet }
      ] },
      { title: "More", items: [
        { title: "Documents", href: "/client/documents", icon: FolderOpen },
        { title: "Support", href: "/client/support", icon: LifeBuoy },
        { title: "Profile", href: "/client/profile", icon: UserCircle }
      ] }
    ]
  },
  vendor: {
    key: "vendor",
    name: "Vendor Portal",
    tagline: "Supplier self-service",
    accent: "bg-emerald-600",
    nav: [
      { title: "Overview", items: [{ title: "Dashboard", href: "/vendor/dashboard", icon: LayoutDashboard }] },
      { title: "Purchase", items: [
        { title: "Purchase Orders", href: "/vendor/purchase/orders", icon: Package },
        { title: "Delivery Schedule", href: "/vendor/purchase/schedule", icon: CalendarClock }
      ] },
      { title: "Billing", items: [
        { title: "Submit Bills", href: "/vendor/billing/bills", icon: Receipt },
        { title: "Vendor Ledger", href: "/vendor/billing/ledger", icon: FileBarChart },
        { title: "Payments", href: "/vendor/billing/payments", icon: Banknote }
      ] },
      { title: "Logistics", items: [
        { title: "Shipments", href: "/vendor/logistics/shipments", icon: Truck },
        { title: "Returns", href: "/vendor/logistics/returns", icon: Boxes }
      ] },
      { title: "More", items: [
        { title: "Documents", href: "/vendor/documents", icon: FolderOpen },
        { title: "Messages", href: "/vendor/messages", icon: MessagesSquare },
        { title: "Profile", href: "/vendor/profile", icon: UserCircle }
      ] }
    ]
  },
  ca: {
    key: "ca",
    name: "CA Portal",
    tagline: "Practice & compliance",
    accent: "bg-violet-600",
    nav: [
      { title: "Overview", items: [
        { title: "Dashboard", href: "/ca/dashboard", icon: LayoutDashboard },
        { title: "Compliance Calendar", href: "/ca/compliance/calendar", icon: CalendarClock }
      ] },
      { title: "Accounting", items: [
        { title: "Trial Balance", href: "/ca/accounting/trial-balance", icon: Calculator },
        { title: "Balance Sheet", href: "/ca/accounting/balance-sheet", icon: Landmark },
        { title: "Profit & Loss", href: "/ca/accounting/profit-loss", icon: FileBarChart },
        { title: "Ledger", href: "/ca/accounting/ledger", icon: BookOpen }
      ] },
      { title: "Tax & GST", items: [
        { title: "GST Returns", href: "/ca/gst/returns", icon: CreditCard },
        { title: "TDS / TCS", href: "/ca/tax/tds", icon: Receipt }
      ] },
      { title: "Practice", items: [
        { title: "Audit", href: "/ca/audit", icon: ShieldCheck },
        { title: "Documents", href: "/ca/documents", icon: FolderOpen },
        { title: "Profile", href: "/ca/profile", icon: UserCircle }
      ] }
    ]
  }
};
