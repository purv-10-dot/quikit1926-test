import {
  Building2, Users, ShieldCheck, SlidersHorizontal, Zap, BookOpen, Package, ShoppingCart, ShoppingBag, Plug, Wrench,
  LifeBuoy,
  type LucideIcon
} from "lucide-react";

export type SettingsLink = { title: string; href: string; badge?: string };
export type SettingsCategory = { title: string; icon: LucideIcon; links: SettingsLink[] };
export type SettingsSection = { title: string; categories: SettingsCategory[] };

/** Zoho-style settings catalog. Only links to routes that exist in the app. */
export const SETTINGS_CATALOG: SettingsSection[] = [
  {
    title: "Organization Settings",
    categories: [
      { title: "Organization", icon: Building2, links: [
        { title: "Profile", href: "/settings/organization" },
        { title: "Locations", href: "/settings/locations" },
        { title: "Currencies", href: "/settings/currencies" }
      ] },
      { title: "Users & Roles", icon: Users, links: [
        { title: "Users", href: "/settings/users" },
        { title: "Roles & Permissions", href: "/settings/roles-permissions" }
      ] },
      { title: "Taxes & Compliance", icon: ShieldCheck, links: [
        { title: "Taxes", href: "/settings/taxes" }
      ] },
      { title: "Setup & Configurations", icon: Wrench, links: [
        { title: "General", href: "/settings/general" },
        { title: "AI Assistant", href: "/settings/ai", badge: "New" },
        { title: "Payment Terms", href: "/settings/payment-terms", badge: "New" },
        { title: "Opening Balances", href: "/settings/opening-balances" }
      ] },
      { title: "Customization", icon: SlidersHorizontal, links: [
        { title: "Transaction Number Series", href: "/settings/transaction-series" },
        { title: "PDF Templates", href: "/settings/pdf-templates", badge: "New" },
        { title: "Customers & Vendors", href: "/settings/customers-vendors" }
      ] },
      { title: "Automation", icon: Zap, links: [
        { title: "Approval Policies", href: "/settings/approval-policies" },
        { title: "Transaction Locking", href: "/transaction-locking" }
      ] },
      // Per-user, not org-level — every member sees their own requests here.
      { title: "Help & Support", icon: LifeBuoy, links: [
        { title: "Support Status", href: "/settings/support" }
      ] }
    ]
  },
  {
    title: "Module Settings",
    categories: [
      { title: "General", icon: BookOpen, links: [
        { title: "Chart of Accounts", href: "/chart-of-accounts" },
        { title: "Budgets", href: "/budgets" }
      ] },
      { title: "Inventory", icon: Package, links: [
        { title: "Items", href: "/inventory" },
        { title: "Warehouses", href: "/inventory/warehouses" }
      ] },
      { title: "Sales", icon: ShoppingCart, links: [
        { title: "Quotes", href: "/settings/quotes" },
        { title: "Invoices", href: "/settings/invoices" }
      ] },
      { title: "Purchases", icon: ShoppingBag, links: [
        { title: "Purchase Orders", href: "/settings/purchase-orders" }
      ] },
      { title: "Integrations", icon: Plug, links: [
        { title: "Accounting Sync", href: "/settings/integrations", badge: "New" },
        { title: "Portals", href: "/settings/portals" },
        { title: "Integrations", href: "/integrations" }
      ] }
    ]
  }
];
