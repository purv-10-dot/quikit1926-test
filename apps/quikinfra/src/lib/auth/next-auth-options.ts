/**
 * NextAuth configuration — shared between the [...nextauth] route handler
 * and `getServerSession(authOptions)` callers in service-layer code.
 *
 * QuikInfra no longer ships its own /login page. When QUIKIT_URL is
 * set, auth is delegated to the central QuikIT launcher (OAuth2/OIDC). The
 * session cookie is shared across every app in the cluster via a common
 * NEXTAUTH_SECRET; the cn_users row is resolved server-side from the email
 * claim inside getTenantContext().
 *
 * The local CredentialsProvider is kept as a fallback for environments
 * where the central auth isn't configured (CI, isolated dev) so the route
 * handler at /api/auth/* doesn't blow up.
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createOAuthClientOptions } from "@quikit/auth";
import "@quikit/auth/types";
import { db } from "@/lib/db/prisma";
import { verifyPassword } from "./password";
import { logger } from "@/lib/observability/logger";
import { findByEmailForLogin, touchLastLogin } from "@/lib/users/repository";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

const credentialsFallback: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        try {
          const user = await (db as any).cnDemoUser.findUnique({ where: { email } });
          if (user && user.status === "active") {
            const valid = verifyPassword(password, user.passwordHash);
            if (!valid) {
              logger.warn({ msg: "login_failed", reason: "bad_password", email });
              return null;
            }
            logger.info({
              msg: "login_ok",
              source: "prisma",
              userId: user.id,
              email,
              roleKey: user.roleKey,
            });
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              orgId: user.orgId,
              roleKey: user.roleKey,
              displayRole: user.displayRole,
              department: user.department,
            } as any;
          }
        } catch (e: any) {
          logger.warn({
            msg: "prisma_user_lookup_failed_falling_back",
            email,
            err: e?.message,
          });
        }

        try {
          const cnUser = await findByEmailForLogin(email);
          if (cnUser) {
            const valid = verifyPassword(password, cnUser.passwordHash);
            if (!valid) {
              logger.warn({
                msg: "login_failed",
                source: "cn_users",
                reason: "bad_password",
                email,
              });
              return null;
            }
            const descriptor = getUserTypeDescriptor(cnUser.userType ?? "USER");
            const roleKey = cnUser.roleKey ?? descriptor?.backingRole ?? "user";
            void touchLastLogin(cnUser.id);
            logger.info({
              msg: "login_ok",
              source: "cn_users",
              userId: cnUser.id,
              email,
              roleKey,
            });
            return {
              id: cnUser.id,
              name: cnUser.fullName ?? cnUser.username ?? email,
              email: cnUser.email,
              orgId: cnUser.orgId ?? "default",
              roleKey,
              displayRole: descriptor?.label ?? cnUser.userType ?? "",
              department: cnUser.department ?? "",
              mustChangePassword: cnUser.mustChangePassword === true,
            } as any;
          }
        } catch (e: any) {
          logger.warn({ msg: "cn_users_lookup_failed", email, err: e?.message });
        }

        logger.warn({ msg: "login_failed", reason: "unknown_or_inactive", email });
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  jwt: { maxAge: 60 * 60 * 24 * 30 },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.orgId = u.orgId;
        token.roleKey = u.roleKey;
        token.displayRole = u.displayRole;
        token.department = u.department;
        token.mustChangePassword = u.mustChangePassword === true;
      }
      if (!token.orgId && (token as any).tenantId) {
        token.orgId = (token as any).tenantId;
      }
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as any;
        s.id = token.id;
        s.orgId = token.orgId;
        s.roleKey = token.roleKey;
        s.displayRole = token.displayRole;
        s.department = token.department;
        s.mustChangePassword = (token as any).mustChangePassword === true;
      }
      return session;
    },
  },
  secret:
    process.env.NEXTAUTH_SECRET ||
    "quikinfra-dev-secret-change-in-production-must-be-16-chars",
};

export const authOptions: NextAuthOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({
        quikitUrl: QUIKIT_URL,
        clientId: QUIKIT_CLIENT_ID,
        clientSecret: QUIKIT_CLIENT_SECRET,
      })
    : credentialsFallback;
