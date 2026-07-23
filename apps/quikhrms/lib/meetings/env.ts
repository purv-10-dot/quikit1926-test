import fs from "fs";
import path from "path";

const cache: Record<string, string | undefined> = {};

/**
 * Read a literal value straight from `.env`, bypassing Next.js dotenv-expand.
 * Azure client secrets can contain `$`/`~` sequences that dotenv-expand would
 * treat as variable references and mangle — same reason the mailer reads raw.
 */
function readRawEnv(key: string): string | undefined {
  if (key in cache) return cache[key];
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() !== key) continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      cache[key] = v;
      return v;
    }
  } catch {
    // ignore — fall back to process.env below
  }
  cache[key] = undefined;
  return undefined;
}

/** Resolve a config value, preferring the raw `.env` literal over the expanded one. */
export function env(key: string): string | undefined {
  return readRawEnv(key) ?? process.env[key];
}
