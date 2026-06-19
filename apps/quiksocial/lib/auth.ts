import type { NextAuthOptions, Session, User } from "next-auth";
import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";
import { db } from "@/lib/db";
import { applyPendingInvitesForEmail } from "@/lib/auth/apply-invites";

/**
 * QuikSocial auth configuration.
 *
 * When QUIKIT_URL is set, QuikSocial authenticates via QuikIT's OAuth2
 * flow (the platform IdP model). When unset, falls back to the direct
 * CredentialsProvider for backward compatibility during migration.
 *
 * On every sign-in, the events.signIn hook accepts any pending BrandInvite
 * rows for the user's email so an invited user lands directly on the
 * brand workspace they were invited to. Idempotent: nothing happens
 * when there are no pending invites.
 */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

const baseOptions: NextAuthOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({
        quikitUrl: QUIKIT_URL,
        clientId: QUIKIT_CLIENT_ID,
        clientSecret: QUIKIT_CLIENT_SECRET,
      })
    : createAuthOptions({
        signInPage: "/login",
        errorPage: "/login",
      });

export const authOptions: NextAuthOptions = {
  ...baseOptions,
  callbacks: {
    ...baseOptions.callbacks,
    /**
     * Surface the user's profile timezone on the session so
     * getUserTimezone(session) (lib/utils/timezone.ts) resolves to the real
     * IANA zone — this is what makes the ported F2 scheduling feature live
     * instead of always degrading to "UTC".
     *
     * QuikSocial is an OIDC client: session.user is built from token claims
     * and the base session callback never touches the DB. We call the base
     * callback first (preserving id/orgId/membership/etc.), then layer on a
     * LIVE auth.User lookup by the user's own id. Reading live on every
     * session resolve means a profile timezone change takes effect without a
     * re-login. The lookup is the user's own row (id-keyed, not org-scoped) —
     * same precedent as /api/user/profile, so it doesn't violate the
     * orgId-filter rule.
     */
    async session(args) {
      // Two next-auth typing facts shape the assertions below (neither is
      // `as any`, and packages/** stays untouched):
      //  1. next-auth v4 types the session-callback param's Session more
      //     loosely than the exported Session getServerSession returns (no
      //     user.id). We assert to the exported Session, which
      //     @quikit/auth/types augments with user.id.
      //  2. @quikit/auth/types pins Session["user"] to a concrete shape that a
      //     local augmentation can't extend, so timezone is added to the
      //     next-auth `User` interface (types/next-auth.d.ts) and written
      //     through `as User`. getUserTimezone(session) reads it at runtime.
      // Call the base callback first to preserve id/orgId/membership/etc.; the
      // LIVE db.user lookup means a profile timezone change applies without a
      // re-login. The lookup is the user's own row (id-keyed, not org-scoped)
      // — same precedent as /api/user/profile, so no orgId-filter violation.
      const session = ((await baseOptions.callbacks?.session?.(args)) ??
        args.session) as Session;
      (session.user as User).timezone =
        (
          await db.user.findUnique({
            where: { id: session.user.id },
            select: { timezone: true },
          })
        )?.timezone ?? undefined;
      return session;
    },
  },
  events: {
    ...baseOptions.events,
    async signIn(message) {
      // Preserve any base-package signIn side effects.
      await baseOptions.events?.signIn?.(message);

      // QuikSocial-specific: auto-accept BrandInvites for this email.
      // OIDC profile mapping populates user.orgId — credentials flow
      // doesn't, so we skip silently when orgId is absent.
      const user = message.user as {
        id?: string;
        email?: string | null;
        orgId?: string;
      };
      if (user.id && user.email && user.orgId) {
        try {
          const count = await applyPendingInvitesForEmail(
            user.orgId,
            user.email,
            user.id,
          );
          if (count > 0) {
            console.log(
              `[apply-invites] Accepted ${count} pending invite(s) for ${user.email}`,
            );
          }
        } catch (err) {
          // Never fail sign-in on apply-invites errors.
          console.error("[apply-invites] Failed:", err);
        }
      }
    },
  },
};
