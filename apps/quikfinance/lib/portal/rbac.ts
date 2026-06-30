import type { PortalKey } from "./hosts";

/**
 * Portal RBAC. Each portal has its own role set and a permission matrix. Server
 * routes call `portalCan(portal, role, permission)`; the UI hides actions the
 * role lacks. Roles map to the spec (Client: Owner/Finance Manager/AP/Viewer,
 * Vendor: Vendor Admin/Finance/Operations/Viewer, CA: CA Admin/Auditor/Tax
 * Consultant/Article Assistant/Viewer).
 */

export type Permission =
  | "view" | "pay" | "approve" | "download" | "comment" | "upload"
  | "manage_users" | "submit_bill" | "accept_po" | "file_return" | "audit" | "switch_company";

export const PORTAL_ROLES: Record<PortalKey, string[]> = {
  client: ["owner", "finance_manager", "accounts_payable", "viewer"],
  vendor: ["vendor_admin", "finance", "operations", "viewer"],
  ca: ["ca_admin", "auditor", "tax_consultant", "article_assistant", "viewer"]
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", finance_manager: "Finance Manager", accounts_payable: "Accounts Payable",
  vendor_admin: "Vendor Admin", finance: "Finance", operations: "Operations",
  ca_admin: "CA Admin", auditor: "Auditor", tax_consultant: "Tax Consultant", article_assistant: "Article Assistant",
  viewer: "Viewer"
};

const MATRIX: Record<PortalKey, Record<string, Permission[]>> = {
  client: {
    owner: ["view", "pay", "approve", "download", "comment", "upload", "manage_users"],
    finance_manager: ["view", "pay", "approve", "download", "comment", "upload"],
    accounts_payable: ["view", "pay", "download", "comment", "upload"],
    viewer: ["view", "download"]
  },
  vendor: {
    vendor_admin: ["view", "submit_bill", "accept_po", "download", "comment", "upload", "manage_users"],
    finance: ["view", "submit_bill", "download", "comment"],
    operations: ["view", "accept_po", "download", "comment", "upload"],
    viewer: ["view", "download"]
  },
  ca: {
    ca_admin: ["view", "approve", "download", "comment", "upload", "file_return", "audit", "switch_company", "manage_users"],
    auditor: ["view", "download", "comment", "upload", "audit", "switch_company"],
    tax_consultant: ["view", "download", "comment", "file_return", "switch_company"],
    article_assistant: ["view", "download", "comment", "switch_company"],
    viewer: ["view", "download", "switch_company"]
  }
};

export function portalCan(portal: PortalKey, role: string, permission: Permission): boolean {
  return MATRIX[portal]?.[role]?.includes(permission) ?? false;
}

export function permissionsFor(portal: PortalKey, role: string): Permission[] {
  return MATRIX[portal]?.[role] ?? [];
}
