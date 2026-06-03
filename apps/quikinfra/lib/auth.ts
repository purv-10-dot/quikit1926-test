import { createOAuthClientOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikInfra auth — central-auth only. OAuth2 client to the QuikIT launcher.
 * No local credentials fallback; missing env vars are a misconfiguration.
 */
const QUIKIT_URL = process.env.QUIKIT_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

if (!QUIKIT_URL || !QUIKIT_CLIENT_ID || !QUIKIT_CLIENT_SECRET) {
  throw new Error(
    "QuikInfra auth misconfigured: QUIKIT_URL, QUIKIT_CLIENT_ID, and " +
      "QUIKIT_CLIENT_SECRET are required (central auth is the only login path).",
  );
}

export const authOptions = createOAuthClientOptions({
  quikitUrl: QUIKIT_URL,
  clientId: QUIKIT_CLIENT_ID,
  clientSecret: QUIKIT_CLIENT_SECRET,
});
