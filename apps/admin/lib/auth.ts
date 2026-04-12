import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * Admin app auth configuration.
 *
 * When QUIKIT_URL is set, Admin authenticates via QuikIT's OAuth2 flow.
 * When unset, falls back to direct CredentialsProvider.
 */
const QUIKIT_URL = process.env.QUIKIT_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

export const authOptions =
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
