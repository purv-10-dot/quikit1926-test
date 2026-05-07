/**
 * NextAuth configuration — shared between the [...nextauth] route handler
 * and `getServerSession()` callers in service-layer code.
 *
 * Keeping the options in one file means `getServerSession(authOptions)`
 * returns the same session shape the route handler issues. Inlining the
 * options in the route handler (the Next.js docs' example) quietly drops
 * session tokens when other parts of the app try to resolve them.
 *
 * Authenticates against `CnDemoUser` (seeded via `prisma/seed.ts` from
 * SUPERADMIN_* env vars) and `users` (tenant users invited via
 * Settings → Users), both via email + scrypt-verified password. Not a
 * platform-wide User table — when the root workspace User table becomes
 * authoritative, swap the `authorize()` lookup to point at it and delete
 * the CnDemoUser table.
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db/prisma";
import { verifyPassword } from "./password";
import { logger } from "@/lib/observability/logger";
import { findByEmailForLogin, touchLastLogin } from "@/lib/users/repository";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";

export const authOptions: NextAuthOptions = {
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

        // ── 1. Seeded Prisma users (CnDemoUser) ─────────────────────
        // Primary source. Wrapped in try/catch so a DB-less dev env
        // (where Prisma throws on connect) falls through to the
        // users path below instead of 500ing.
        try {
          const user = await (db as any).cnDemoUser.findUnique({
            where: { email },
          });
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
              tenantId: user.tenantId,
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
          // Fall through to users path below.
        }

        // ── 2. Tenant users (users) ─────────────────────────────
        // Invited via Settings → Users. Every row has a scrypt-hashed
        // passwordHash + materialised roleKey so we don't need a second
        // lookup to resolve permissions. Wrapped in try/catch so the
        // same DB-less dev env that broke the Prisma path above also
        // falls through cleanly here (returns null → login fails with
        // "Invalid credentials" instead of 500).
        try {
          const cnUser = await findByEmailForLogin(email);
          if (cnUser) {
            const valid = verifyPassword(password, cnUser.passwordHash);
            if (!valid) {
              logger.warn({
                msg: "login_failed",
                source: "users",
                reason: "bad_password",
                email,
              });
              return null;
            }
            // Fall back to the user-type descriptor if the row pre-dates
            // the roleKey-on-write upgrade (e.g. migrated from JSON).
            const descriptor = getUserTypeDescriptor(cnUser.userType ?? "USER");
            const roleKey =
              cnUser.roleKey ?? descriptor?.backingRole ?? "site_engineer";

            // Best-effort last-login stamp; never block auth on it.
            void touchLastLogin(cnUser.id);

            logger.info({
              msg: "login_ok",
              source: "users",
              userId: cnUser.id,
              email,
              roleKey,
            });
            return {
              id: cnUser.id,
              name: cnUser.fullName ?? cnUser.username ?? email,
              email: cnUser.email,
              tenantId: cnUser.tenantId ?? "default",
              orgId: cnUser.orgId ?? "default",
              roleKey,
              displayRole: descriptor?.label ?? cnUser.userType ?? "",
              department: cnUser.department ?? "",
              mustChangePassword: cnUser.mustChangePassword === true,
            } as any;
          }
        } catch (e: any) {
          logger.warn({
            msg: "users_lookup_failed",
            email,
            err: e?.message,
          });
        }

        logger.warn({ msg: "login_failed", reason: "unknown_or_inactive", email });
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Session lives until the user explicitly signs out. NextAuth requires
    // a finite maxAge, so we set it to 1 year and refresh the cookie on
    // every authenticated request via updateAge — active users effectively
    // never expire.
    maxAge: 60 * 60 * 24 * 365, // 1 year
    updateAge: 60 * 60 * 24, // refresh cookie at most once per day
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 365, // keep JWT lifetime in lockstep with session
  },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.tenantId = u.tenantId;
        token.orgId = u.orgId;
        token.roleKey = u.roleKey;
        token.displayRole = u.displayRole;
        token.department = u.department;
        token.mustChangePassword = u.mustChangePassword === true;
      }
      // Allow client code to flip the flag off after a successful reset
      // via `update({ mustChangePassword: false })` from useSession() —
      // saves a forced re-login round-trip.
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as any;
        s.id = token.id;
        s.tenantId = token.tenantId;
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
    "quikconstruction-dev-secret-change-in-production-must-be-16-chars",
};
