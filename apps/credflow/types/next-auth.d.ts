import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      orgId: string;
      membershipRole: string;
    };
  }

  interface User {
    orgId?: string;
    membershipRole?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    orgId?: string;
    membershipRole?: string;
    /** Epoch ms of the last active-membership re-validation (see lib/auth.ts jwt callback). */
    membershipCheckedAt?: number;
  }
}
