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
