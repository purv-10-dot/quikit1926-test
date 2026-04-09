import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@quikit/database";
import bcrypt from "bcryptjs";

export interface AuthConfig {
  signInPage: string;
  errorPage: string;
}

export function createAuthOptions(config: AuthConfig): NextAuthOptions {
  return {
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Invalid credentials");
          }

          const user = await db.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.password) {
            throw new Error("Invalid credentials");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            throw new Error("Invalid credentials");
          }

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            isSuperAdmin: user.isSuperAdmin,
          };
        },
      }),
    ],
    pages: {
      signIn: config.signInPage,
      error: config.errorPage,
    },
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60,
    },
    jwt: {
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 30 * 24 * 60 * 60,
    },
    callbacks: {
      async jwt({ token, user, trigger, session }) {
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.isSuperAdmin = (user as any).isSuperAdmin ?? false;
        }

        if (trigger === "update" && session) {
          if (session.tenantId === null) {
            token.tenantId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
          } else if (session.tenantId) {
            token.tenantId = session.tenantId;
            token.membershipRole = session.membershipRole;
            token.membershipCheckedAt = Date.now();
          }
        }

        // Re-validate membership every 5 minutes
        const RECHECK_INTERVAL = 5 * 60 * 1000;
        if (
          token.tenantId &&
          token.id &&
          (!token.membershipCheckedAt ||
            Date.now() - (token.membershipCheckedAt as number) > RECHECK_INTERVAL)
        ) {
          const membership = await db.membership.findFirst({
            where: {
              userId: token.id as string,
              tenantId: token.tenantId as string,
              status: "active",
            },
          });

          if (!membership) {
            token.tenantId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
            token.membershipInvalid = true;
          } else {
            token.membershipRole = membership.role;
            token.membershipCheckedAt = Date.now();
            token.membershipInvalid = undefined;
          }
        }

        return token;
      },
      async session({ session, token }) {
        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          tenantId: token.tenantId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          membershipInvalid: token.membershipInvalid as boolean | undefined,
          isSuperAdmin: token.isSuperAdmin as boolean | undefined,
        };
        return session;
      },
    },
    events: {
      async signIn({ user }) {
        await db.user.update({
          where: { id: user.id! },
          data: { lastSignInAt: new Date() },
        });
      },
    },
  };
}
