import { signAppJwtFromEnv } from "@/lib/services/github/app-jwt";

/**
 * Thin GitHub REST client for the QuikTrack GitHub App.
 *
 * Two auth modes:
 *   - App JWT (from `app-jwt`) — used only to mint installation tokens.
 *   - Installation access token — short-lived (≈1h), used for all repo/data
 *     calls. Callers cache it (in `QtGithubInstallation.accessTokenEnc`) until
 *     `expires_at` and re-mint via `createInstallationToken` when stale.
 *
 * Uses the global `fetch` (Node 18+/Next runtime) — no `@octokit` dependency,
 * per the app's no-new-deps rule. Network functions are intentionally small so
 * the routes/services above them stay testable by mocking `fetch`.
 */

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GithubApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "GithubApiError";
    this.statusCode = statusCode;
  }
}

export interface InstallationToken {
  token: string;
  /** ISO-8601 expiry from GitHub (~1 hour out). */
  expiresAt: string;
}

function baseHeaders(auth: string): Record<string, string> {
  return {
    Authorization: `Bearer ${auth}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "QuikTrack-GitHub-Integration",
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export interface UserAccessToken {
  accessToken: string;
  /** GitHub omits expiry for classic OAuth; present for expiring-token apps. */
  expiresInSeconds?: number;
  refreshToken?: string;
  scope?: string;
}

/**
 * Exchange an OAuth `code` (identity leg) for a user access token.
 * `POST https://github.com/login/oauth/access_token`
 * Reads client credentials from the environment.
 */
export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
): Promise<UserAccessToken> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GithubApiError("GitHub OAuth client is not configured.", 503);
  }
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "QuikTrack-GitHub-Integration",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new GithubApiError(
      `OAuth code exchange failed: ${await readError(res)}`,
      res.status,
    );
  }
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  if (!data.access_token) {
    throw new GithubApiError(
      data.error_description ?? data.error ?? "GitHub returned no access token.",
      400,
    );
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in,
    refreshToken: data.refresh_token,
    scope: data.scope,
  };
}

/**
 * Exchange the App JWT for an installation access token.
 * `POST /app/installations/{installation_id}/access_tokens`
 */
export async function createInstallationToken(
  installationId: string | number,
): Promise<InstallationToken> {
  const appJwt = await signAppJwtFromEnv();
  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    { method: "POST", headers: baseHeaders(appJwt) },
  );
  if (!res.ok) {
    throw new GithubApiError(
      `Failed to create installation token: ${await readError(res)}`,
      res.status,
    );
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: data.expires_at };
}

export interface InstallationInfo {
  accountLogin: string;
  accountId: string;
  targetType: string;
  repositorySelection: string;
}

/**
 * Read installation metadata (account login/id, target type, repo selection)
 * using the App JWT. `GET /app/installations/{installation_id}`
 */
export async function getInstallation(
  installationId: string | number,
): Promise<InstallationInfo> {
  const appJwt = await signAppJwtFromEnv();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: baseHeaders(appJwt),
  });
  if (!res.ok) {
    throw new GithubApiError(
      `Failed to read installation: ${await readError(res)}`,
      res.status,
    );
  }
  const data = (await res.json()) as {
    account?: { login?: string; id?: number; type?: string };
    target_type?: string;
    repository_selection?: string;
  };
  return {
    accountLogin: data.account?.login ?? "",
    accountId: data.account?.id != null ? String(data.account.id) : "",
    targetType: data.target_type ?? data.account?.type ?? "Organization",
    repositorySelection: data.repository_selection ?? "selected",
  };
}

/**
 * Create a branch on a repo, off a source branch. GitHub has no single
 * "create branch" call — we read the source branch's tip SHA, then create the
 * `refs/heads/<newBranch>` ref pointing at it. Returns the new ref URL.
 * Throws GithubApiError(422) if the branch already exists.
 */
export async function createBranch(
  installationToken: string,
  repoFullName: string,
  sourceBranch: string,
  newBranch: string,
): Promise<{ ref: string; url: string }> {
  const src = await githubRequest<{ object: { sha: string } }>(
    installationToken,
    `/repos/${repoFullName}/git/ref/heads/${encodeURIComponent(sourceBranch)}`,
  );
  const created = await githubRequest<{ ref: string; url: string }>(
    installationToken,
    `/repos/${repoFullName}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: src.object.sha,
      }),
    },
  );
  return { ref: created.ref, url: created.url };
}

/**
 * Perform an authenticated GitHub REST call with an installation token.
 * `path` is appended to the API base (e.g. `/repos/{owner}/{repo}/branches`).
 * Returns the parsed JSON; throws `GithubApiError` on a non-2xx response.
 */
export async function githubRequest<T>(
  installationToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...baseHeaders(installationToken), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    throw new GithubApiError(
      `GitHub request failed (${path}): ${await readError(res)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}
