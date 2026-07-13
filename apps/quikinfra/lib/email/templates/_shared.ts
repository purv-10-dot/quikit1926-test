/**
 * Shared lookup tables for email templates so role labels stay in sync
 * between the app UI and the outgoing emails.
 */

export const USER_TYPE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HO_USER: "HO User",
  SITE_ADMIN: "Site Admin",
  USER: "User",
};
