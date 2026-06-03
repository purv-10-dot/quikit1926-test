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

  /**
   * Fetch emails for a list of Jira accountIds via the dedicated bulk-email
   * endpoint. This endpoint surfaces addresses that `/users/search` redacts
   * for privacy-mode users — provided the API-token user shares a workspace
   * with the target.
   *
   *   GET /rest/api/3/user/email/bulk?accountId=...&accountId=...
   *   → { emails: [{ accountId, email }, ...] }
   *
   * Atlassian caps requests at 90 accountIds per call; we chunk to 80 for
   * margin. Returns a Map<accountId, email>; users for whom Atlassian still
   * refuses to release the email simply don't appear in the map.
   */
  async getEmailsForAccountIds(
    accountIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (accountIds.length === 0) return out;

    const CHUNK = 80;
    for (let i = 0; i < accountIds.length; i += CHUNK) {
      const slice = accountIds.slice(i, i + CHUNK);
      const qs = slice.map((id) => `accountId=${encodeURIComponent(id)}`).join("&");
      try {
        // Response shape is undocumented across some Jira tenants — be liberal.
        const res = await this.get<
          | { emails?: Array<{ accountId?: string; email?: string }> }
          | Array<{ accountId?: string; email?: string }>
        >(`/rest/api/3/user/email/bulk?${qs}`);
        // Log the raw shape so we can diagnose when the endpoint returns
        // something unexpected (different tenants differ). Trim the body
        // so we don't spam the server log with hundreds of rows.
        const preview = JSON.stringify(res).slice(0, 500);
        console.log(
          `[jira-import] /user/email/bulk → ${slice.length} accountIds, response preview: ${preview}`,
        );
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.emails)
            ? res.emails
            : [];
        for (const row of list) {
          if (row.accountId && row.email) {
            out.set(row.accountId, row.email.trim().toLowerCase());
          }
        }
        console.log(
          `[jira-import] /user/email/bulk recovered ${list.length} emails for this batch`,
        );
      } catch (err) {
        // 404 / 403 / 410 — endpoint disabled or token lacks scope.
        // Log so we know which case we're hitting.
        console.warn(
          `[jira-import] /user/email/bulk FAILED for ${slice.length} accountIds:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return out;
  }

  /**
   * Fetch a binary resource (attachment) with the same auth + throttle as the
   * JSON endpoints. Accepts either an absolute Jira URL (the `content` URL
   * returned in the issue's `attachment[]` array) or a path on this site.
   * Honours 429 with up to 3 retries; returns the raw bytes.
   */
  async fetchBinary(urlOrPath: string): Promise<{ bytes: Buffer; contentType: string }> {
    const url = urlOrPath.startsWith("http") ? urlOrPath : this.base + urlOrPath;
    let attempt = 0;
    while (true) {
      await this.wait();
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: this.authHeader },
        redirect: "follow",
      });
      if (res.status === 429 && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        attempt += 1;
        continue;
      }
      if (!res.ok) {
        throw new Error(`Jira ${res.status} ${res.statusText} on GET ${url}`);
      }
      const ab = await res.arrayBuffer();
      return {
        bytes: Buffer.from(ab),
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    }
  }

  /**
   * Fetch full user objects for a list of accountIds via the targeted
   * `/rest/api/3/user/bulk` endpoint. Different from `/user/email/bulk`:
   * this one accepts user-issued API tokens (no Marketplace whitelist
   * required) and returns the standard user object — `emailAddress`,
   * `displayName`, `active`, etc.
   *
   * Atlassian sometimes releases an email here even when /users/search
   * redacted it, because discovery-mode privacy is stricter than targeted
   * lookups. Useful as a fallback for privacy-mode users. Chunks to 50
   * per call for URL-length safety.
   */
  async getUsersByAccountIds(
    accountIds: string[],
  ): Promise<Array<{
    accountId: string;
    emailAddress: string | null;
    displayName: string;
    active: boolean;
    accountType?: string;
  }>> {
    const out: Array<{
      accountId: string;
      emailAddress: string | null;
      displayName: string;
      active: boolean;
      accountType?: string;
    }> = [];
    if (accountIds.length === 0) return out;

    const CHUNK = 50;
    for (let i = 0; i < accountIds.length; i += CHUNK) {
      const slice = accountIds.slice(i, i + CHUNK);
      const qs = slice.map((id) => `accountId=${encodeURIComponent(id)}`).join("&");
      try {
        // Response may be wrapped in { values: [...] } (paged shape) or
        // be a bare array depending on tenant. Handle both.
        const res = await this.get<
          | { values?: Array<unknown> }
          | Array<unknown>
        >(`/rest/api/3/user/bulk?${qs}`);
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as { values?: Array<unknown> })?.values)
            ? ((res as { values: Array<unknown> }).values)
            : [];
        const recovered = list as Array<{
          accountId: string;
          emailAddress: string | null;
          displayName: string;
          active: boolean;
          accountType?: string;
        }>;
        const withEmail = recovered.filter((u) => !!u.emailAddress).length;
        console.log(
          `[jira-import] /user/bulk → ${slice.length} requested, ${recovered.length} returned, ${withEmail} with email`,
        );
        out.push(...recovered);
      } catch (err) {
        console.warn(
          `[jira-import] /user/bulk FAILED for ${slice.length} accountIds:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return out;
  }
}

/* ───────────────────── Atlassian Document Format converters ───────────────────── */

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** Placeholder src injected into <img> tags during ADF→HTML conversion.
 *  After attachments upload, the importer rewrites these to the real
 *  /api/issues/{id}/attachments/{attId}?redirect=1 URLs. */
export const ATTACHMENT_PLACEHOLDER_PREFIX = "quiktrack-attachment:";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapMarks(text: string, marks: AdfNode["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const m of marks) {
    switch (m.type) {
      case "strong":
        out = `<strong>${out}</strong>`;
        break;
      case "em":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = String((m.attrs as { href?: string })?.href ?? "");
        if (href) out = `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${out}</a>`;
        break;
      }
    }
  }
  return out;
}

/**
 * Atlassian Document Format → HTML. Preserves the structures that have a
 * natural HTML equivalent (headings, paragraphs, lists, code blocks, tables,
 * links, hard breaks, horizontal rules) and emits `<img>` tags for media
 * nodes whose `src` is a placeholder that the importer rewrites to a real
 * download URL once the attachment row exists.
 *
 * Anything unknown falls back to walking children — so unsupported nodes
 * lose their structure but never lose their text content.
 */
export function adfToHtml(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const out: string[] = [];

  const walk = (node: AdfNode): string => {
    if (!node) return "";
    switch (node.type) {
      case "text":
        return wrapMarks(escapeHtml(node.text ?? ""), node.marks);
      case "hardBreak":
        return "<br>";
      case "paragraph":
        return `<p>${(node.content ?? []).map(walk).join("")}</p>`;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number((node.attrs as { level?: number })?.level ?? 2)));
        return `<h${level}>${(node.content ?? []).map(walk).join("")}</h${level}>`;
      }
      case "bulletList":
        return `<ul>${(node.content ?? []).map(walk).join("")}</ul>`;
      case "orderedList":
        return `<ol>${(node.content ?? []).map(walk).join("")}</ol>`;
      case "listItem":
        return `<li>${(node.content ?? []).map(walk).join("")}</li>`;
      case "blockquote":
        return `<blockquote>${(node.content ?? []).map(walk).join("")}</blockquote>`;
      case "codeBlock":
        return `<pre><code>${(node.content ?? []).map(walk).join("")}</code></pre>`;
      case "rule":
        return "<hr>";
      case "mediaSingle":
      case "mediaGroup":
        return (node.content ?? []).map(walk).join("");
      case "media": {
        const id = String((node.attrs as { id?: string })?.id ?? "");
        const alt = String((node.attrs as { alt?: string })?.alt ?? "");
        if (!id) return "";
        return `<img src="${ATTACHMENT_PLACEHOLDER_PREFIX}${escapeHtml(id)}" alt="${escapeHtml(alt)}" />`;
      }
      case "table":
        return `<table>${(node.content ?? []).map(walk).join("")}</table>`;
      case "tableRow":
        return `<tr>${(node.content ?? []).map(walk).join("")}</tr>`;
      case "tableHeader":
        return `<th>${(node.content ?? []).map(walk).join("")}</th>`;
      case "tableCell":
        return `<td>${(node.content ?? []).map(walk).join("")}</td>`;
      default:
        // Unknown node — walk children so we don't lose their text.
        return (node.content ?? []).map(walk).join("");
    }
  };

  const root = adf as AdfNode;
  if (Array.isArray(root.content)) {
    for (const child of root.content) out.push(walk(child));
  } else {
    out.push(walk(root));
  }
  return out.join("").trim();
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
