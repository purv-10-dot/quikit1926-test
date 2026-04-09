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
  }
}
