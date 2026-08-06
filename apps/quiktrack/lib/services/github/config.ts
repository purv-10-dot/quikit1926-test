/**
 * Central config + URL helpers for the QuikTrack GitHub App integration.
 *
 * All GitHub-related env vars are read here so the routes stay declarative and
 * a misconfigured deployment fails with one clear message. Nothing here is
 * secret-bearing at rest — secrets (private key, client secret, webhook secret,
 * token-encryption key) are read at point-of-use in their own modules.
 *
 * Base URL follows the app's existing convention (see lib/email/sendEmail.ts):
 * APP_URL → NEXT_PUBLIC_APP_URL → NEXTAUTH_URL.
 */

/** Resolve the app's public base URL, trailing slash stripped. */
export function appBaseUrl(): string {
  const base =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "";
  return base.replace(/\/$/, "");
}

/**
 * The OAuth callback URI. Must EXACTLY match the "Callback URL" registered on
 * the GitHub App — GitHub rejects a mismatch. The initiating org/user is
 * carried in the signed `state`, not the URL.
 */
export function oauthCallbackUri(): string {
  return `${appBaseUrl()}/api/integrations/github/oauth/callback`;
}

/**
 * The GitHub App public installation URL. Users are sent here to install the
 * App onto an org/account; GitHub redirects back to the App's configured
 * "Setup URL" (our install callback) with `installation_id` + `setup_action`.
 */
export function appInstallUrl(): string {
  const slug = process.env.GITHUB_APP_SLUG ?? "";
  return `https://github.com/apps/${slug}/installations/new`;
}

/** GitHub's OAuth authorize endpoint for the (user) identity leg. */
export function oauthAuthorizeUrl(state: string): string {
  const clientId = process.env.GITHUB_APP_CLIENT_ID ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthCallbackUri(),
    state,
    // `repo` is granted via the App installation, not this leg; we only need
    // identity + read:org here to resolve who is connecting.
    scope: "read:user read:org",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Absolute URL to Settings → Integrations → GitHub, for post-flow redirects. */
export function settingsGithubUrl(query = ""): string {
  return `${appBaseUrl()}/settings/integrations/github${query}`;
}

/**
 * True when the minimum env needed to START a connect flow is present. Used to
 * gate the UI / return a clean 503 instead of bouncing the user to a broken
 * GitHub screen. Secrets used only later (private key, webhook secret) are
 * validated at their own point of use.
 */
export function isGithubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_CLIENT_ID &&
      process.env.GITHUB_APP_SLUG &&
      appBaseUrl(),
  );
}
