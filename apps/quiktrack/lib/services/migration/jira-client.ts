/**
 * Atlassian Jira Cloud REST client used by the migration importer.
 *
 * Basic auth (email + API token) only — no OAuth needed for an admin-driven
 * one-shot import. Built-in throttle (8 req/s) keeps us under Jira's rate
 * limit on a small site; for very large sites we additionally honour 429s
 * with exponential back-off.
 *
 * Surface area is deliberately tiny — just the verbs the importer needs.
 */

export interface JiraCreds {
  /** e.g. "acme.atlassian.net" — no protocol. */
  domain: string;
  email: string;
  /** Atlassian account API token. */
  apiToken: string;
}

interface PageResp<T> {
  values?: T[];
  isLast?: boolean;
  total?: number;
  maxResults?: number;
  startAt?: number;
  // Some endpoints (issue search) put items in `issues` instead of `values`.
  issues?: T[];
}

const MIN_GAP_MS = 125; // ~8 req/s

export class JiraClient {
  private readonly base: string;
  private readonly authHeader: string;
  private lastRequestAt = 0;

  constructor(creds: JiraCreds) {
    // Defensive normalisation — users often paste the URL from their browser
    // bar like "https://acme.atlassian.net/jira" or "acme.atlassian.net/".
    // Strip the protocol, any path, and the trailing slash so we always end
    // up with bare host + "https://" prefix exactly once.
    const host = creds.domain
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/\/+$/, "");
    this.base = `https://${host}`;
    this.authHeader =
      "Basic " +
      Buffer.from(`${creds.email}:${creds.apiToken}`, "utf8").toString("base64");
  }

  /** Lazy gap so consecutive calls don't burst. */
  private async wait(): Promise<void> {
    const now = Date.now();
    const gap = now - this.lastRequestAt;
    if (gap < MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
    }
    this.lastRequestAt = Date.now();
  }

  /** GET JSON. Retries on 429 with exponential back-off up to 3 attempts. */
  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /** POST JSON. Same retry/throttle as GET. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      await this.wait();
      const res = await fetch(this.base + path, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        attempt += 1;
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Jira ${res.status} ${res.statusText} on GET ${path}${text ? ` — ${text.slice(0, 300)}` : ""}`,
        );
      }
      // Atlassian returns text/html for unauthenticated or wrong-URL requests
      // even when the status is 200 (rare, but happens on weird redirects).
      // Detect non-JSON responses up front so we can surface a clean error
      // instead of a JSON.parse "Unexpected token <".
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Jira returned non-JSON on GET ${path} (content-type "${ct || "unknown"}"). ` +
            "Check the site domain is correct (e.g. 'acme.atlassian.net' — no /jira, no /browse). " +
            (text ? `First bytes: ${text.slice(0, 120)}` : ""),
        );
      }
      return (await res.json()) as T;
    }
  }

  /**
   * Walk every page of a paginated endpoint. Accumulates and returns all
   * items.
   *
   * Jira's REST API is inconsistent: `/rest/api/3/project/search` wraps the
   * payload in `{ values: [...], isLast, total, ... }`, `/rest/api/3/search`
   * uses `{ issues: [...], total, startAt }`, and `/rest/api/3/users/search`
   * returns a **bare array** at the top level. We handle all three shapes.
   *
   * (The bare-array case used to crash here with "Found non-callable
   *  @@iterator" because `Array.prototype.values` is a built-in method, so
   *  `page["values"]` resolved to the iterator function instead of an array
   *  and the spread blew up.)
   */
  async getAllPaged<T>(
    pathBuilder: (startAt: number, maxResults: number) => string,
    {
      key = "values",
      pageSize = 100,
    }: { key?: "values" | "issues"; pageSize?: number } = {},
  ): Promise<T[]> {
    const out: T[] = [];
    let startAt = 0;
    while (true) {
      const page = await this.get<PageResp<T> | T[]>(
        pathBuilder(startAt, pageSize),
      );
      // Three pagination dialects, normalised here.
      let slice: T[];
      if (Array.isArray(page)) {
        slice = page;
      } else {
        const raw = (page as PageResp<T>)[key];
        slice = Array.isArray(raw) ? raw : [];
      }
      out.push(...slice);
      const total = !Array.isArray(page) ? (page as PageResp<T>).total : undefined;
      const isLast =
        (!Array.isArray(page) && (page as PageResp<T>).isLast === true) ||
        slice.length === 0 ||
        slice.length < pageSize ||
        (total !== undefined && startAt + slice.length >= total);
      if (isLast) break;
      startAt += slice.length;
    }
    return out;
  }

  /** Lightweight identity probe — used to validate creds before doing real work. */
  async whoami(): Promise<{ accountId: string; emailAddress: string | null }> {
    return this.get("/rest/api/3/myself");
  }
}

/* ───────────────────── Atlassian Document Format → plain text ───────────────────── */

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

/**
 * Atlassian Document Format → plain text. Walks the JSON tree, concatenating
 * text nodes with single spaces; paragraphs/headings get newline separators.
 * Enough for migration — we lose rich formatting but preserve content + URLs.
 */
export function adfToPlainText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const lines: string[] = [];
  const walk = (node: AdfNode, depth: number): void => {
    if (!node) return;
    if (node.type === "text" && typeof node.text === "string") {
      // Append to last line in progress.
      lines[lines.length - 1] = (lines[lines.length - 1] ?? "") + node.text;
      return;
    }
    const breaksAfter = ["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock"];
    const startsNew = depth > 0 && breaksAfter.includes(node.type ?? "");
    if (startsNew && lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child, depth + 1);
    }
  };
  if (lines.length === 0) lines.push("");
  walk(adf as AdfNode, 0);
  return lines.join("\n").trim();
}
