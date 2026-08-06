/** Shared types for the User Management page. Extracted from page.tsx. */
import type { PermissionMatrix } from "@/lib/rbac/menu-catalog";

export interface UserRow {
  id: string;
  username: string;            // legacy column on cn_users; derived server-side from email
  fullName: string;            // legacy column on cn_users; kept for back-compat in list responses
  firstName?: string;          // preferred field — populated for new invites
  lastName?: string;           // preferred field — populated for new invites
  email: string;
  mobile: string;
  userType: string;
  department?: string;
  modulesAssigned?: string[];
  projectsAssigned?: string[];
  isHoUser?: boolean;
  appAllow?: boolean;
  status: string;
  invitedAt?: string;
  acceptedAt?: string | null;
  inviteTokenExpires?: string | null;
  lastLoginAt?: string | null;
  roleKey?: string;
  permissionMatrix?: PermissionMatrix | null;
  hasSettingsAccess?: boolean;
}

/* ─── Email-typeahead hit (existing org member) ─── */
export interface ExistingMemberHit {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
  status: string;
  hasQuikInfraAccess: boolean;
}

export interface InviteResult {
  email: string;
  fullName?: string;
  url: string;
  mailSent: boolean;
  mailError?: string;
  mode: "create" | "resend";
}
