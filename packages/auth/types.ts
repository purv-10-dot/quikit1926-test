import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      tenantId?: string;
      membershipRole?: string;
      membershipInvalid?: boolean;
      isSuperAdmin?: boolean;
      /** Phase D: true while a super admin is viewing as another user. */
      impersonating?: boolean;
      /** Phase D: the super admin whose shadow session this is. */
      impersonatorUserId?: string;
      /** Phase D: display name of the impersonator (for the banner). */
      impersonatorEmail?: string;
      /** Phase D: hard expiry of the impersonation. Session should reject past this. */
      impersonationExpiresAt?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    isSuperAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    tenantId?: string;
    membershipRole?: string;
    membershipCheckedAt?: number;
    membershipInvalid?: boolean;
    isSuperAdmin?: boolean;
    impersonating?: boolean;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
    impersonationExpiresAt?: string;
  }
}
