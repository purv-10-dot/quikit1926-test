import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { comparePassword } from "@/lib/auth/bcrypt";
import { AUTH_LOGIN_PATH } from "@/lib/auth/routes";
import { db } from "@/lib/db";

/**
 * Standalone QuikCRM auth — NextAuth Credentials against Prisma `User` +
 * active `OrgMember` for tenant (`orgId`) and platform role (`membershipRole`).
 */

/**
 * How often the JWT callback re-validates that the user's org membership is
 * still active. Bounds the stale-access window after a user is removed from the
 * org (was up to the full 30-day token lifetime). Override via env for tighter
 * revocation at the cost of more DB reads.
 */
const MEMBERSHIP_RECHECK_MS = Math.max(
  0,
  Number(process.env.AUTH_MEMBERSHIP_RECHECK_MS ?? 5 * 60 * 1000),
);

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const rawEmail = credentials?.email;
        const password = credentials?.password;
        if (typeof rawEmail !== "string" || typeof password !== "string") {
          return null;
        }
        const email = rawEmail.trim().toLowerCase();
        if (!email || !password) return null;

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            password: true,
          },
        });
        if (!user?.password) return null;

        const valid = await comparePassword(password, user.password);
        if (!valid) return null;

        const membership = await db.orgMember.findFirst({
          where: { userId: user.id, status: "active" },
          orderBy: { createdAt: "asc" },
        });
        if (!membership) return null;

        const name =
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.email ||
          "User";

        return {
          id: user.id,
          email: user.email ?? undefined,
          name,
          orgId: membership.orgId,
          membershipRole: membership.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: AUTH_LOGIN_PATH,
    error: AUTH_LOGIN_PATH,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.orgId = user.orgId;
        token.membershipRole = user.membershipRole;
        token.membershipCheckedAt = Date.now();
        return token;
      }
      // The token lives for 30 days (session.maxAge). Without a recheck, a user
      // removed from the org keeps `orgId` — and thus data access — until the
      // token expires. Re-validate active membership periodically so removal
      // takes effect within MEMBERSHIP_RECHECK_MS, while keeping the DB hit off
      // the hot path of every single request.
      const lastChecked =
        typeof token.membershipCheckedAt === "number" ? token.membershipCheckedAt : 0;
      if (token.sub && token.orgId && Date.now() - lastChecked > MEMBERSHIP_RECHECK_MS) {
        const membership = await db.orgMember.findFirst({
          where: { userId: token.sub, orgId: token.orgId, status: "active" },
          select: { role: true },
        });
        if (!membership) {
          // Membership revoked/suspended — strip the tenant claims so the session
          // resolves with an empty orgId and downstream auth guards reject it.
          token.orgId = undefined;
          token.membershipRole = undefined;
        } else {
          token.membershipRole = membership.role;
          token.membershipCheckedAt = Date.now();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.orgId = typeof token.orgId === "string" ? token.orgId : "";
        session.user.membershipRole =
          typeof token.membershipRole === "string" ? token.membershipRole : "";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
