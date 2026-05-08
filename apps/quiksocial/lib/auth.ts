import type { NextAuthOptions } from "next-auth";
import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";
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
