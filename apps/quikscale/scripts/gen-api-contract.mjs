#!/usr/bin/env node
/**
 * gen-api-contract.mjs — regenerate `docs/API_CONTRACT.md` from source.
 *
 *   node scripts/gen-api-contract.mjs            # write docs/API_CONTRACT.md
 *   node scripts/gen-api-contract.mjs --check    # exit 1 if the file is stale
 *   node scripts/gen-api-contract.mjs --out X.md # write elsewhere
 *
 * What it reads, per `app/api/**\/route.ts`:
 *   - exported HTTP verbs (`export const GET =`, `export async function GET`)
 *   - the auth wrapper in use → module gate + RBAC `resource:action`
 *   - query params (only via variables provably bound to `searchParams`)
 *   - request headers read by the handler
 *   - the Zod schema validating the body, resolved into `lib/schemas/*` and
 *     flattened into a field table
 *   - every `NextResponse.json(...)` / `new NextResponse(...)` /
 *     `NextResponse.redirect(...)` in the handler → status code + body keys
 *
 * Prose lives in `docs/api-contract-preamble.md` — edit that, not this file.
 *
 * Heuristics, not a type-checker: shapes marked `inferred` come from reading
 * the object literal the handler returns. When a handler returns a variable
 * built across several statements the generator says so rather than guessing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(APP_ROOT, "app", "api");
const SCHEMA_DIR = path.join(APP_ROOT, "lib", "schemas");
const DOCS_DIR = path.join(APP_ROOT, "docs");
const PREAMBLE = path.join(DOCS_DIR, "api-contract-preamble.md");
const REGISTRY = path.join(APP_ROOT, "lib", "api", "permissionsRegistry.ts");

const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/* ─────────────────────────── generic scanning ─────────────────────────── */

/**
 * Replace every comment body with spaces, preserving file length so all
 * offsets stay valid. String and template literals are left intact.
 */
function blankComments(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && d === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

const OPEN = { "(": ")", "{": "}", "[": "]" };

/** Index of the bracket matching the one at `start`, or -1. Comment-free input. */
function matchBracket(text, start) {
  const close = OPEN[text[start]];
  if (!close) return -1;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split `text` on top-level commas (input excludes the outer brackets). */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) { parts.push(text.slice(last, i)); last = i + 1; }
  }
  parts.push(text.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Parse an object literal (input INCLUDES the outer braces) into
 * `[{ key, value }]` for depth-1 entries. Ternaries and computed expressions
 * are skipped because a key is only recorded right after `{` or a `,`.
 */
function parseObject(objText) {
  if (!objText.startsWith("{")) return [];
  const end = matchBracket(objText, 0);
  const body = objText.slice(1, end === -1 ? objText.length : end);
  return splitTopLevel(body)
    .map((entry) => {
      const spread = entry.match(/^\.\.\.(.*)$/s);
      if (spread) {
        const inner = spread[1].replace(/\s+/g, " ").trim();
        const call = inner.match(/^([\w$.]+)\s*\(/);
        return { key: "..." + (call ? `${call[1]}(…)` : inner.slice(0, 40)), value: "" };
      }
      const m = entry.match(/^(?:(["'])([^"']+)\1|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/);
      if (m) return { key: m[2] ?? m[3], value: m[4].trim() };
      const short = entry.match(/^([A-Za-z_$][\w$]*)$/); // shorthand { foo }
      if (short) return { key: short[1], value: short[1] };
      if (/^[A-Za-z_$][\w$]*\s*\(/.test(entry)) return null; // method shorthand
      return null;
    })
    .filter(Boolean);
}

/* ─────────────────────────── zod schema parsing ─────────────────────────── */

const schemaCache = new Map();

const indexedFiles = new Set();

/** Index every `export const x = ...` in one file into the schema cache. */
function indexFile(absPath) {
  if (indexedFiles.has(absPath) || !fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return;
  indexedFiles.add(absPath);
  const code = blankComments(fs.readFileSync(absPath, "utf8"));
  const rel = path.relative(APP_ROOT, absPath).split(path.sep).join("/");
  for (const m of code.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    if (!schemaCache.has(m[1])) schemaCache.set(m[1], { file: rel, code, start: m.index + m[0].length });
  }
}

/** Every `export const xSchema = ...` in lib/schemas, lazily indexed. */
function schemaIndex() {
  if (schemaCache.size) return schemaCache;
  if (!fs.existsSync(SCHEMA_DIR)) return schemaCache;
  for (const file of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".ts"))) {
    indexFile(path.join(SCHEMA_DIR, file));
  }
  return schemaCache;
}

/** Resolve an `@/lib/...` import specifier to a file on disk and index it. */
function indexImport(spec) {
  if (!spec || !spec.startsWith("@/")) return;
  const base = path.join(APP_ROOT, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) { indexFile(candidate); return; }
  }
}

/** `const FOO = ["a", "b"] as const` → `["a","b"]`, for `z.enum(FOO)`. */
function resolveConstList(name, fileCode) {
  if (!fileCode) return null;
  const m = fileCode.match(new RegExp(`(?:const|let)\\s+${name}\\s*(?::[^=]{0,80})?=\\s*\\[`));
  if (!m) return null;
  const open = fileCode.indexOf("[", m.index + m[0].length - 1);
  const close = matchBracket(fileCode, open);
  if (close === -1) return null;
  const values = [...fileCode.slice(open + 1, close).matchAll(/["']([^"']+)["']/g)].map((v) => v[1]);
  return values.length ? values : null;
}

/** Collapse a zod field chain into one human-readable type string. */
function zodType(expr, fileCode) {
  const s = expr.replace(/\s+/g, " ").trim();
  let base = "unknown";

  const enumMatch = s.match(/z\.enum\(\s*(\[[^\]]*\]|[A-Za-z_$][\w$]*)/);
  const arrayMatch = s.match(/z\.array\(\s*z\.(\w+)/);
  const literal = s.match(/z\.literal\(\s*(["'][^"']*["']|[\w.]+)/);
  const first = s.match(/z\.(?:coerce\.)?(\w+)\(/);

  if (enumMatch) {
    const raw = enumMatch[1];
    const values = raw.startsWith("[")
      ? raw.slice(1, -1).split(",").map((v) => v.trim().replace(/["']/g, "")).filter(Boolean)
      : resolveConstList(raw, fileCode);
    base = values ? "enum: " + values.join(" | ") : `enum: values of \`${raw}\``;
  } else if (arrayMatch) {
    base = `${arrayMatch[1]}[]`;
  } else if (/z\.array\(\s*z\.object/.test(s)) {
    base = "object[]";
  } else if (literal) {
    base = `literal ${literal[1]}`;
  } else if (first) {
    base = first[1];
    if (base === "object") base = "object";
    if (/z\.coerce\./.test(s)) base = `${base} (coerced)`;
  }

  const notes = [];
  const min = s.match(/\.min\(\s*(-?\d+)/);
  const max = s.match(/\.max\(\s*(-?\d+)/);
  if (min) notes.push(`min ${min[1]}`);
  if (max) notes.push(`max ${max[1]}`);
  if (/\.email\(/.test(s)) notes.push("email");
  if (/\.uuid\(/.test(s)) notes.push("uuid");
  if (/\.datetime\(/.test(s)) notes.push("ISO date-time");
  if (/\.url\(/.test(s)) notes.push("url");
  if (/\.nullable\(/.test(s)) notes.push("nullable");
  const def = s.match(/\.default\(\s*([^)]*)\)/);
  if (def) notes.push(`default ${def[1].trim().slice(0, 30)}`);

  const optional = /\.optional\(/.test(s) || !!def;
  return { type: notes.length ? `${base} — ${notes.join(", ")}` : base, optional };
}

/**
 * Turn `[{key, value}]` into field rows, inlining `...someFields` spreads by
 * looking up the plain object const they refer to in the same file. Schemas
 * here are commonly assembled as `z.object({ ...kpiBaseFields, extra })`.
 */
function expandFields(entries, fileCode, depth = 0) {
  const rows = [];
  for (const { key, value } of entries) {
    if (!key.startsWith("...")) {
      rows.push({ name: key, ...zodType(value, fileCode) });
      continue;
    }
    const ref = key.slice(3).trim().replace(/[^\w$].*$/, "");
    if (depth > 2 || !ref) { rows.push({ name: key, type: "spread", optional: true }); continue; }
    const m = fileCode.match(new RegExp(`(?:const|let)\\s+${ref}\\s*(?::[^=]{0,80})?=\\s*\\{`));
    if (!m) { rows.push({ name: `…${ref}`, type: "spread — not resolved", optional: true }); continue; }
    const braceIdx = fileCode.indexOf("{", m.index + m[0].length - 1);
    const end = matchBracket(fileCode, braceIdx);
    if (end === -1) { rows.push({ name: `…${ref}`, type: "spread — not resolved", optional: true }); continue; }
    rows.push(...expandFields(parseObject(fileCode.slice(braceIdx, end + 1)), fileCode, depth + 1));
  }
  return rows;
}

/**
 * Fields from a `z.object(...)` argument — either an inline literal or a
 * reference to a shared field bundle (`z.object(kpiBaseFields)`).
 */
function objectArgFields(inner, fileCode) {
  if (inner.startsWith("{")) return expandFields(parseObject(inner), fileCode);
  const ident = inner.match(/^([A-Za-z_$][\w$]*)$/);
  if (ident) return expandFields([{ key: "..." + ident[1], value: "" }], fileCode);
  return [];
}

/**
 * Resolve a schema name to `{ fields, file, note }`. Follows one level of
 * `.extend({...})` / `.merge(x)` / `.partial()` / `.omit()` wrapping.
 */
function resolveSchema(name, depth = 0) {
  if (depth > 3) return null;
  const entry = schemaIndex().get(name);
  if (!entry) return null;
  const { code, start, file } = entry;

  // The expression that defines this schema, up to the next top-level export.
  const nextExport = code.indexOf("\nexport ", start);
  const expr = code.slice(start, nextExport === -1 ? code.length : nextExport);

  // `z.object({...})`, and the multi-line `z\n  .object({...})` form.
  const objMatch = expr.match(/z\s*\.\s*object\s*\(/);
  if (objMatch) {
    const parenStart = objMatch.index + objMatch[0].length - 1;
    const parenEnd = matchBracket(expr, parenStart);
    const inner = expr.slice(parenStart + 1, parenEnd).trim();
    const fields = objectArgFields(inner, code);
    const partial = /\.partial\(\)/.test(expr);
    const notes = [];
    if (partial) notes.push("all fields optional (`.partial()`)");
    if (/\.refine\(|\.superRefine\(/.test(expr)) notes.push("has cross-field `.refine()` rules");
    if (/\.strict\(\)/.test(expr)) notes.push("`.strict()` — unknown keys rejected");
    return { fields, file, notes, partial };
  }

  // `const x = ySchema.partial()` / `.extend({...})` / `.omit({...})`
  const alias = expr.match(/^\s*([A-Za-z_$][\w$]*)\s*\./);
  if (alias) {
    const parent = resolveSchema(alias[1], depth + 1);
    if (parent) {
      const notes = [...parent.notes, `derived from \`${alias[1]}\``];
      if (/\.partial\(\)/.test(expr)) notes.push("all fields optional (`.partial()`)");
      return { ...parent, notes };
    }
  }
  return null;
}

/** Zod object literals declared inline in a route file. */
function inlineSchemas(code) {
  const found = new Map();
  for (const m of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*z\s*\.\s*object\s*\(/g)) {
    const parenStart = m.index + m[0].length - 1;
    const parenEnd = matchBracket(code, parenStart);
    if (parenEnd === -1) continue;
    const inner = code.slice(parenStart + 1, parenEnd).trim();
    const tail = code.slice(parenEnd, parenEnd + 200);
    const notes = [];
    if (/^\)\s*\.partial\(\)/.test(tail)) notes.push("all fields optional (`.partial()`)");
    if (/^\)\s*[\s\S]{0,120}?\.refine\(/.test(tail)) notes.push("has cross-field `.refine()` rules");
    found.set(m[1], {
      fields: objectArgFields(inner, code),
      file: null,
      notes,
    });
  }
  // Second pass: `const a = bSchema.extend({...})` / `.partial()` built on a
  // schema declared in the same route file or in lib/schemas.
  for (const m of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\.\s*(extend|partial|omit|pick)\s*\(/g)) {
    const [, name, parentName, op] = m;
    if (found.has(name)) continue;
    const parent = found.get(parentName) ?? resolveSchema(parentName);
    if (!parent) continue;
    const fields = [...(parent.fields ?? [])];
    const notes = [...(parent.notes ?? []), `derived from \`${parentName}\`.${op}()`];
    if (op === "extend") {
      const parenStart = m.index + m[0].length - 1;
      const parenEnd = matchBracket(code, parenStart);
      if (parenEnd !== -1) fields.push(...objectArgFields(code.slice(parenStart + 1, parenEnd).trim(), code));
    }
    if (op === "partial") notes.push("all fields optional (`.partial()`)");
    found.set(name, { fields, file: parent.file ?? null, notes, partial: op === "partial" });
  }

  return found;
}

/* ─────────────────────────── route file parsing ─────────────────────────── */

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name === "route.ts" || e.name === "route.tsx") acc.push(full);
  }
  return acc;
}

function toApiPath(file) {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/");
  const segs = rel === "" ? [] : rel.split("/");
  const mapped = segs.map((s) =>
    s.startsWith("[...") ? `{...${s.slice(4, -1)}}` : s.startsWith("[") ? `{${s.slice(1, -1)}}` : s,
  );
  return "/api" + (mapped.length ? "/" + mapped.join("/") : "");
}

/** Leading `//` or `/** *\/` comment directly above `idx`, as a description. */
function leadingComment(raw, idx) {
  const before = raw.slice(0, idx).replace(/\s+$/, "");
  const lines = before.split("\n");
  const collected = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("//")) { collected.unshift(line.replace(/^\/+\s?/, "")); continue; }
    if (line.endsWith("*/")) {
      const buf = [];
      let j = i;
      while (j >= 0 && !lines[j].trim().startsWith("/*")) { buf.unshift(lines[j]); j--; }
      if (j >= 0) buf.unshift(lines[j]);
      collected.unshift(
        ...buf
          .map((l) => l.trim().replace(/^\/\*+/, "").replace(/\*+\/$/, "").replace(/^\*\s?/, ""))
          .filter((l) => l.length),
      );
      break;
    }
    break;
  }
  return collected
    .map((l) => l.replace(/[─━=]{3,}/g, "").trim())
    // Drop JSDoc tags and section-banner comments (`─── Route handlers ───`).
    .filter((l) => l && !/^@/.test(l) && !/^[-─━=*\s]+$/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Locate each exported verb and the span of source belonging to it. */
function methodBlocks(code, raw) {
  const marks = [];
  const re = new RegExp(
    `^export\\s+(?:const\\s+(${VERBS.join("|")})\\s*=|async\\s+function\\s+(${VERBS.join("|")})\\s*\\()`,
    "gm",
  );
  for (const m of code.matchAll(re)) marks.push({ verb: m[1] ?? m[2], start: m.index, bodyAt: m.index + m[0].length });

  // `export { handler as GET, handler as POST }` (NextAuth catch-all etc.)
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const a of m[1].matchAll(/(\w+)\s+as\s+(\w+)/g)) {
      if (VERBS.includes(a[2])) marks.push({ verb: a[2], start: m.index, bodyAt: m.index, reExport: a[1] });
    }
  }
  marks.sort((a, b) => a.start - b.start);

  const boundaries = [...code.matchAll(/^export\s/gm)].map((m) => m.index);
  return marks.map((mark) => {
    const next = boundaries.find((b) => b > mark.start);
    return {
      ...mark,
      code: code.slice(mark.bodyAt, next ?? code.length),
      description: leadingComment(raw, mark.start),
    };
  });
}

/** Wrapper consts declared at the top of a route file. */
function wrapperConsts(code) {
  const map = new Map();
  for (const m of code.matchAll(/const\s+([\w$]+)\s*=\s*withOrgAuthForResource\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g))
    map.set(m[1], { kind: "resource", moduleKey: m[2], resource: m[3] });
  for (const m of code.matchAll(/const\s+([\w$]+)\s*=\s*withOrgAuthForModule\(\s*["']([^"']+)["']/g))
    map.set(m[1], { kind: "module", moduleKey: m[2] });
  return map;
}

const AUTH_SIGNALS = [
  [/x-internal-secret/i, "Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET`"],
  [/publicToken/, "**Public** — unauthenticated; the share token in the URL is the only credential"],
  [/METRICS_TOKEN/, "`Authorization: Bearer <METRICS_TOKEN>`"],
  [/NextAuth\(/, "NextAuth.js handler — sign-in, callbacks, session endpoints"],
  [/create\w+Handler\(\s*authOptions/, "Shared `@quikit/auth` factory handler — session required, runs before org selection"],
  [/process\.uptime\(\)|readiness|liveness/i, "**Public** — infrastructure probe, no auth"],
  [/requireSuperAdmin/, "Super-admin guard (`requireSuperAdmin`)"],
  [/requireAdmin/, "Org-admin guard (`requireAdmin`)"],
  [/getServerSession/, "Hand-rolled `getServerSession` check"],
  [/getToken\(/, "JWT read via `getToken`"],
];

function describeGuard(block, consts, fileCode) {
  const head = block.code.slice(0, 400);
  const res = {
    auth: "Session (NextAuth) + active org membership",
    module: null,
    permission: null,
    rateLimit: null,
    wrapped: true,
  };

  // `auth.view(` and `auth.view<{ id: string }>(` both bind the same gate.
  const viaConst = head.match(/^\s*([\w$]+)\.(view|create|update|delete)\s*(?:<[\s\S]*?>)?\s*\(/);
  if (viaConst && consts.has(viaConst[1])) {
    const c = consts.get(viaConst[1]);
    res.module = c.moduleKey;
    if (c.kind === "resource") res.permission = `${c.resource}:${viaConst[2]}`;
  } else if (/^\s*withOrgAuthForModule\(\s*["'][^"']+["']\s*\)\s*(?:<[\s\S]*?>)?\s*\(/.test(head)) {
    res.module = head.match(/withOrgAuthForModule\(\s*["']([^"']+)["']/)[1];
  } else if (/^\s*([\w$]+)\s*(?:<[\s\S]*?>)?\s*\(/.test(head) && consts.has(head.match(/^\s*([\w$]+)/)[1])) {
    res.module = consts.get(head.match(/^\s*([\w$]+)/)[1]).moduleKey;
  } else if (/^\s*withOrgAuth\s*(?:<[\s\S]*?>)?\s*\(/.test(head)) {
    // bare wrapper — auth + org only
  } else {
    res.wrapped = false;
    res.auth = "Custom (see route)";
    for (const [re, label] of AUTH_SIGNALS) {
      if (re.test(block.code) || re.test(fileCode)) { res.auth = label; break; }
    }
  }

  // Wrapper options object — `{ moduleKey, permission, rateLimit, ... }`.
  const opt = block.code.match(/permission:\s*\{\s*resource:\s*["']([^"']+)["']\s*,\s*action:\s*["']([^"']+)["']/);
  if (opt) res.permission = `${opt[1]}:${opt[2]}`;
  const modOpt = block.code.match(/moduleKey:\s*["']([^"']+)["']/);
  if (modOpt) res.module = modOpt[1];

  if (/rateLimit:\s*false/.test(block.code)) res.rateLimit = "wrapper limiter off — handler self-limits";
  else {
    const custom = block.code.match(/rateLimit:\s*\{([^}]*)\}/);
    if (custom) res.rateLimit = "custom: `" + custom[1].replace(/\s+/g, " ").trim() + "`";
  }
  const inline = block.code.match(/rateLimitAsync\(\s*\{([\s\S]{0,220}?)\}\s*\)/);
  if (inline) {
    const key = inline[1].match(/routeKey:\s*["']([^"']+)["']/);
    const lim = inline[1].match(/limit:\s*([\w.]+)/);
    res.rateLimit = [res.rateLimit, `handler bucket${key ? ` \`${key[1]}\`` : ""}${lim ? ` (limit ${lim[1]})` : ""}`]
      .filter(Boolean)
      .join("; ");
  }
  return res;
}

/** Query params, found only through variables provably bound to searchParams. */
function queryParams(blockCode, fileCode) {
  const names = new Set();
  const scope = fileCode + "\n" + blockCode;
  const vars = new Set(["searchParams"]);
  for (const m of scope.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*[^;\n]*searchParams\s*[;\n]/g)) vars.add(m[1]);
  for (const m of scope.matchAll(/(?:const|let)\s+\{([^}]*)\}\s*=\s*[^;\n]*searchParams/g))
    for (const p of m[1].split(",")) {
      const k = p.split(":")[0].trim();
      if (k) names.add(k);
    }

  for (const m of blockCode.matchAll(/\.searchParams\.(?:get|getAll|has)\(\s*["']([^"']+)["']/g)) names.add(m[1]);
  for (const v of vars) {
    const re = new RegExp(`\\b${v}\\.(?:get|getAll|has)\\(\\s*["']([^"']+)["']`, "g");
    for (const m of blockCode.matchAll(re)) names.add(m[1]);
  }
  return [...names].sort();
}

function requestHeaders(blockCode) {
  const names = new Set();
  for (const m of blockCode.matchAll(/(?:req|request)\.headers\.get\(\s*["']([^"']+)["']/g)) names.add(m[1].toLowerCase());
  return [...names].sort();
}

/** Try to describe the object a returned identifier holds. */
function inferIdentifier(name, blockCode) {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]{0,120})?=\\s*`, "g");
  const m = re.exec(blockCode);
  if (!m) return null;
  const after = blockCode.slice(m.index + m[0].length);

  if (after.startsWith("{")) {
    const keys = parseObject(after).map((f) => f.key);
    if (keys.length) return { keys, note: "inferred from object literal" };
  }
  const mapped = after.slice(0, 4000).match(/=>\s*\(\s*\{/);
  if (mapped) {
    const braceIdx = after.indexOf("{", m.index === -1 ? 0 : mapped.index);
    const objStart = after.indexOf("{", mapped.index);
    const keys = parseObject(after.slice(objStart)).map((f) => f.key);
    if (keys.length) return { keys, note: "inferred from `.map()` projection" };
    void braceIdx;
  }
  const prisma = after.match(/db\.(\w+)\.(findMany|findUnique|findFirst|create|update|upsert|count|groupBy|aggregate)/);
  if (prisma) return { keys: null, note: `Prisma \`${prisma[1]}.${prisma[2]}\` result` };
  return null;
}

const ENVELOPE_KEYS = new Set(["success", "error", "data", "meta", "message"]);

function responses(blockCode) {
  const out = [];
  const push = (r) => {
    if (!out.some((o) => o.status === r.status && o.body === r.body)) out.push(r);
  };

  for (const m of blockCode.matchAll(/NextResponse\.json\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(blockCode, open);
    if (close === -1) continue;
    const args = splitTopLevel(blockCode.slice(open + 1, close));
    const arg1 = args[0] ?? "";
    const arg2 = args[1] ?? "";
    const statusMatch = arg2.match(/status:\s*(\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : 200;

    let body;
    let note = null;
    if (arg1.startsWith("{")) {
      const fields = parseObject(arg1);
      const parts = fields.map(({ key, value }) => {
        if (key === "success") return `success: ${value === "true" || value === "false" ? value : "boolean"}`;
        if (!ENVELOPE_KEYS.has(key)) return key;
        if (key === "data") {
          const ident = value.match(/^([\w$]+)$/);
          if (ident) {
            const inf = inferIdentifier(ident[1], blockCode);
            if (inf?.keys) { note = `\`data\` ${inf.note}: ${inf.keys.map((k) => "`" + k + "`").join(", ")}`; return "data"; }
            if (inf) { note = `\`data\` — ${inf.note}`; return "data"; }
          }
          if (value.startsWith("{")) return "data: { " + parseObject(value).map((f) => f.key).join(", ") + " }";
          if (value.startsWith("[")) return "data: []";
          return "data";
        }
        return key;
      });
      body = "{ " + parts.join(", ") + " }";
    } else if (/^paginatedResponse\(|^withPaginationMeta\(/.test(arg1)) {
      const inner = splitTopLevel(arg1.slice(arg1.indexOf("(") + 1, matchBracket(arg1, arg1.indexOf("("))));
      const ident = (inner[0] ?? "").match(/^([\w$]+)$/);
      if (ident) {
        const inf = inferIdentifier(ident[1], blockCode);
        if (inf?.keys) note = `row shape ${inf.note}: ${inf.keys.map((k) => "`" + k + "`").join(", ")}`;
        else if (inf) note = `rows — ${inf.note}`;
      }
      body = "{ success: true, data: [...], meta: PaginationMeta }";
    } else {
      const ident = arg1.match(/^([\w$]+)$/);
      if (ident) {
        const inf = inferIdentifier(ident[1], blockCode);
        body = inf?.keys ? "{ " + inf.keys.join(", ") + " }" : `\`${ident[1]}\``;
        if (inf && !inf.keys) note = inf.note;
      } else {
        body = "`" + arg1.replace(/\s+/g, " ").slice(0, 70) + "`";
      }
    }
    push({ status, body, note });
  }

  for (const m of blockCode.matchAll(/new NextResponse\s*\(|new Response\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(blockCode, open);
    if (close === -1) continue;
    const args = blockCode.slice(open + 1, close);
    const status = args.match(/status:\s*(\d{3})/);
    const ct = args.match(/["']?[Cc]ontent-[Tt]ype["']?\s*:\s*["']([^"']+)["']/);
    const filename = args.match(/filename="?([^";]+)/);
    push({
      status: status ? Number(status[1]) : 200,
      body: ct ? `binary — \`${ct[1]}\`` : "raw body (non-JSON)",
      note: filename ? `attachment: \`${filename[1]}\`` : null,
    });
  }

  for (const m of blockCode.matchAll(/NextResponse\.redirect\s*\(/g)) {
    void m;
    push({ status: 307, body: "redirect (`Location` header)", note: null });
  }

  return out.sort((a, b) => a.status - b.status);
}

const helperCache = new Map();

/**
 * Some handlers are one-liners that hand off to a shared helper
 * (`return handleReorder(...)`, `createOrgSelectHandler(authOptions)`).
 * Follow the call into the helper so the endpoint documents its statuses
 * instead of showing an empty table.
 */
function delegatedResponses(blockCode, imports) {
  for (const m of blockCode.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const fn = m[1];
    if (!imports.has(fn)) continue;
    const spec = imports.get(fn);

    if (!spec.startsWith("@/")) {
      if (/Handler$/.test(fn)) {
        return { rows: [{ status: null, body: `implemented by \`${fn}()\` in \`${spec}\``, note: null }], via: fn };
      }
      continue;
    }

    const key = `${spec}#${fn}`;
    if (!helperCache.has(key)) {
      const base = path.join(APP_ROOT, spec.slice(2));
      const file = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((f) => fs.existsSync(f));
      let entry = { rows: [], body: "", imports: new Map() };
      if (file) {
        const code = blankComments(fs.readFileSync(file, "utf8"));
        const decl = code.match(new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${fn}\\b|const\\s+${fn}\\s*=)`));
        if (decl) {
          const next = code.indexOf("\nexport ", decl.index + 1);
          const body = code.slice(decl.index, next === -1 ? code.length : next);
          entry = { rows: responses(body), body, imports: importMap(code) };
        }
      }
      helperCache.set(key, entry);
    }
    const entry = helperCache.get(key);
    if (entry.rows.length) return { ...entry, via: fn };
  }
  return null;
}

/**
 * Zod schemas the handler validates with, tagged by what they validate:
 * the JSON body, or a query-param bag assembled from `searchParams`.
 */
function validatedSchemas(blockCode, verb, imports, inline) {
  const found = new Map();
  const record = (name, argText) => {
    const arg = (argText ?? "").replace(/\s+/g, " ").trim();
    let target = "body";
    if (/req(?:uest)?\.json\(\)|\bbody\b|\bpayload\b|formData/.test(arg)) target = "body";
    else if (/params|query|sp\b|searchParams|filters/.test(arg)) target = "query";
    else if (verb === "GET" || verb === "HEAD") target = "query";
    if (!found.has(name)) found.set(name, target);
  };

  for (const m of blockCode.matchAll(/([\w$]+)\s*\.\s*(?:safeParse|parse|parseAsync|safeParseAsync)\s*\(/g)) {
    const name = m[1];
    if (!/[Ss]chema$/.test(name) && !inline.has(name) && !imports.has(name)) continue;
    const open = m.index + m[0].length - 1;
    const close = matchBracket(blockCode, open);
    record(name, close === -1 ? "" : blockCode.slice(open + 1, close));
  }

  const results = [];
  for (const [name, target] of found) {
    if (inline.has(name)) { results.push({ name, target, ...inline.get(name) }); continue; }
    // Schemas defined outside lib/schemas (exports, AI report composers, …)
    // are indexed on demand from the import that brought them in.
    schemaIndex();
    if (!schemaCache.has(name)) indexImport(imports.get(name));
    const resolved = resolveSchema(name);
    if (resolved) results.push({ name, target, ...resolved });
    else results.push({ name, target, fields: [], file: imports.get(name) ?? null, notes: ["definition not resolved — see route"] });
  }
  return results;
}

function importMap(code) {
  const map = new Map();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(" as ").pop().trim();
      if (name) map.set(name, m[2]);
    }
  }
  return map;
}

/* ─────────────────────────── document assembly ─────────────────────────── */

function anchor(s) {
  return s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function esc(s) {
  return String(s).replace(/\|/g, "\\|");
}

function renderMethod(ep) {
  const L = [];
  L.push(`#### \`${ep.verb} ${ep.route}\``);
  L.push("");
  if (ep.description) L.push(`${ep.description}`, "");

  const rows = [["Auth", ep.guard.auth]];
  if (ep.guard.module) rows.push(["Module gate", `\`${ep.guard.module}\` — 404 when the org has the module disabled`]);
  rows.push(["Permission", ep.guard.permission ? `\`${ep.guard.permission}\`` : "_none beyond auth_"]);
  if (ep.guard.rateLimit) rows.push(["Rate limit", ep.guard.rateLimit]);
  else if (ep.guard.wrapped && ["POST", "PUT", "PATCH", "DELETE"].includes(ep.verb))
    rows.push(["Rate limit", "shared mutation bucket"]);
  if (ep.headers.length) rows.push(["Headers read", ep.headers.map((h) => `\`${h}\``).join(", ")]);
  rows.push(["Source", `[${ep.file}](../${ep.file})`]);

  L.push("| | |", "|---|---|");
  for (const [k, v] of rows) L.push(`| **${k}** | ${esc(v)} |`);
  L.push("");

  if (ep.pathParams.length) {
    L.push(`**Path params** — ${ep.pathParams.map((p) => `\`${p}\``).join(", ")}`, "");
  }
  if (ep.query.length) {
    L.push(`**Query** — ${ep.query.map((q) => `\`${q}\``).join(", ")}`, "");
  }

  for (const schema of ep.bodySchemas) {
    const label = schema.target === "query" ? "**Validated query params**" : "**Request body**";
    L.push(`${label} — \`${schema.name}\`${schema.file ? ` (\`${schema.file}\`)` : " (inline)"}`);
    L.push("");
    if (schema.fields?.length) {
      L.push("| Field | Type | Required |", "|---|---|---|");
      for (const f of schema.fields) {
        L.push(`| \`${esc(f.name)}\` | ${esc(f.type ?? "—")} | ${schema.partial || f.optional ? "" : "✓"} |`);
      }
      L.push("");
    }
    if (schema.notes?.length) L.push(schema.notes.map((n) => `- ${n}`).join("\n"), "");
  }
  if (!ep.bodySchemas.some((s) => s.target === "body") && ep.readsBody && ["POST", "PUT", "PATCH", "DELETE"].includes(ep.verb)) {
    L.push("**Request body** — JSON, not validated by a Zod schema (see route).", "");
  }

  L.push("**Responses**", "");
  if (ep.delegatedVia) L.push(`_Handler delegates to \`${ep.delegatedVia}()\`._`, "");
  L.push("| Status | Body |", "|---|---|");
  const seen = new Set();
  for (const r of ep.responses) {
    const key = `${r.status}|${r.body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    L.push(`| ${r.status ? `\`${r.status}\`` : "_delegated_"} | ${esc(r.body)}${r.note ? `<br/>${esc(r.note)}` : ""} |`);
  }
  if (ep.guard.wrapped) L.push("| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |");
  L.push("");
  return L.join("\n");
}

function permissionAppendix() {
  if (!fs.existsSync(REGISTRY)) return "";
  const code = blankComments(fs.readFileSync(REGISTRY, "utf8"));
  const rows = [];
  for (const m of code.matchAll(/resource:\s*["']([^"']+)["']\s*,\s*label:\s*["']([^"']+)["']\s*,\s*actions:\s*(ACTIONS|\[[^\]]*\])/g)) {
    const actions = m[3] === "ACTIONS"
      ? "view, create, update, delete"
      : m[3].slice(1, -1).split(",").map((a) => a.trim().replace(/["']/g, "")).filter(Boolean).join(", ");
    rows.push(`| \`${m[1]}\` | ${m[2]} | ${actions} |`);
  }
  if (!rows.length) return "";
  return [
    "## Appendix A — permission resources",
    "",
    "Every `resource:action` pair the RBAC v2 gate can enforce, from `lib/api/permissionsRegistry.ts`.",
    "",
    "| Resource | Label | Actions |",
    "|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outFile = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : path.join(DOCS_DIR, "API_CONTRACT.md");
  const check = args.includes("--check");

  const files = walk(API_DIR).sort();
  const endpoints = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const code = blankComments(raw);
    const rel = path.relative(APP_ROOT, file).split(path.sep).join("/");
    const route = toApiPath(file);
    const consts = wrapperConsts(code);
    const imports = importMap(code);
    const inline = inlineSchemas(code);
    const pathParams = [...route.matchAll(/\{\.{0,3}(\w+)\}/g)].map((m) => m[1]);
    // Fallback description: the file's first JSDoc block. Route files that
    // document the endpoint above a helper (not above the export) still get it.
    const jsdoc = raw.match(/\/\*\*[\s\S]*?\*\//);
    const fileDesc = jsdoc
      ? jsdoc[0]
          .split("\n")
          .map((l) => l.trim().replace(/^\/\*+/, "").replace(/\*+\/$/, "").replace(/^\*\s?/, "").trim())
          .filter((l) => l && !/^@/.test(l) && !/^[-─━=*\s]+$/.test(l))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

    for (const block of methodBlocks(code, raw)) {
      let resp = block.reExport
        ? [{ status: 200, body: `delegated to \`${block.reExport}\``, note: null }]
        : responses(block.code);
      let delegatedVia = null;
      let schemas = validatedSchemas(block.code, block.verb, imports, inline);
      if (!resp.length) {
        const delegated = delegatedResponses(block.code, imports);
        if (delegated) {
          resp = delegated.rows;
          delegatedVia = delegated.via;
          // The helper also owns the body validation — surface its schema.
          if (!schemas.length && delegated.body) {
            schemas = validatedSchemas(delegated.body, block.verb, delegated.imports, new Map());
          }
        }
      }
      endpoints.push({
        route,
        verb: block.verb,
        file: rel,
        module: route.split("/")[2] ?? "root",
        description: block.description || fileDesc || "",
        guard: describeGuard(block, consts, code),
        query: queryParams(block.code, code),
        headers: requestHeaders(block.code),
        pathParams,
        bodySchemas: schemas,
        readsBody: /\.json\(\)|formData\(\)/.test(block.code),
        responses: resp,
        delegatedVia,
      });
    }
  }

  const verbOrder = Object.fromEntries(VERBS.map((v, i) => [v, i]));
  endpoints.sort(
    (a, b) => a.module.localeCompare(b.module) || a.route.localeCompare(b.route) || verbOrder[a.verb] - verbOrder[b.verb],
  );

  const modules = [...new Set(endpoints.map((e) => e.module))].sort();
  const preamble = fs.existsSync(PREAMBLE) ? fs.readFileSync(PREAMBLE, "utf8").trimEnd() : "# QuikScale — API Contract";

  const L = [preamble, ""];

  L.push("## Endpoint index", "");
  L.push(`\`${files.length}\` route files · \`${endpoints.length}\` endpoints · \`${modules.length}\` modules.`, "");
  L.push("| Module | Endpoints | Verbs |", "|---|---:|---|");
  for (const m of modules) {
    const eps = endpoints.filter((e) => e.module === m);
    const verbs = VERBS.filter((v) => eps.some((e) => e.verb === v));
    L.push(`| [\`${m}\`](#module-${anchor(m)}) | ${eps.length} | ${verbs.join(", ")} |`);
  }
  L.push(`| **Total** | **${endpoints.length}** | |`, "");

  const byVerb = VERBS.map((v) => [v, endpoints.filter((e) => e.verb === v).length]).filter(([, c]) => c);
  L.push("Method mix: " + byVerb.map(([v, c]) => `\`${v}\` ${c}`).join(" · "), "");
  L.push("---", "");

  for (const m of modules) {
    const eps = endpoints.filter((e) => e.module === m);
    L.push(`## Module \`${m}\` <a id="module-${anchor(m)}"></a>`, "");
    L.push(`_${eps.length} endpoint${eps.length === 1 ? "" : "s"}_`, "");
    L.push("| Endpoint | Permission | Module gate |", "|---|---|---|");
    for (const e of eps) {
      L.push(
        `| \`${e.verb} ${esc(e.route)}\` | ${e.guard.permission ? `\`${e.guard.permission}\`` : "—"} | ${e.guard.module ? `\`${e.guard.module}\`` : "—"} |`,
      );
    }
    L.push("");
    let currentRoute = null;
    for (const e of eps) {
      if (e.route !== currentRoute) {
        currentRoute = e.route;
        L.push(`### \`${e.route}\``, "");
      }
      L.push(renderMethod(e));
    }
    L.push("---", "");
  }

  L.push(permissionAppendix());
  L.push("");
  L.push(
    "<sub>Generated by `scripts/gen-api-contract.mjs` — do not hand-edit below the preamble. " +
      "Prose lives in `docs/api-contract-preamble.md`.</sub>",
    "",
  );

  const doc = L.join("\n").replace(/\n{3,}/g, "\n\n");

  if (check) {
    const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
    if (existing !== doc) {
      console.error("API_CONTRACT.md is stale — run: node scripts/gen-api-contract.mjs");
      process.exit(1);
    }
    console.log("API_CONTRACT.md is up to date.");
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, doc, "utf8");
  console.log(
    `Wrote ${path.relative(APP_ROOT, outFile)} — ${endpoints.length} endpoints across ${modules.length} modules ` +
      `(${files.length} route files, ${doc.split("\n").length} lines).`,
  );
}

main();
