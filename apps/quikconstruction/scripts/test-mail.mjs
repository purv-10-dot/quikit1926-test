/**
 * Standalone SMTP test — bypasses Next.js entirely.
 *
 * Usage:
 *   cd apps/quikconstruction
 *   node scripts/test-mail.mjs tikarebhavna792@gmail.com
 *
 * Reads .env directly, builds a nodemailer transport from SMTP_*, and
 * sends a plain test message. If this works but the Next.js app
 * doesn't, the problem is that Next is caching a stale .env. If this
 * fails, the JSON error contains the exact SMTP-level reason (M365
 * AUTH blocked, bad password, port closed, etc.).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

// Minimal .env parser so we don't need to add a dotenv dependency.
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[test-mail] .env not found at ${filePath}`);
    return {};
  }
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const env = parseEnv(envPath);
const to = process.argv[2];

if (!to) {
  console.error("Usage: node scripts/test-mail.mjs <recipient@example.com>");
  process.exit(2);
}

const host = env.SMTP_HOST;
const port = parseInt(env.SMTP_PORT ?? "587", 10);
const secure =
  env.SMTP_SECURE != null ? env.SMTP_SECURE.toLowerCase() === "true" : port === 465;
const user = env.SMTP_USER;
const pass = env.SMTP_PASS;
const from = env.MAIL_FROM ?? user;

console.log(
  JSON.stringify(
    {
      envPath,
      host,
      port,
      secure,
      user,
      passwordLength: pass ? pass.length : 0,
      from,
      to,
    },
    null,
    2
  )
);

if (!host || !user || !pass) {
  console.error("[test-mail] SMTP_HOST / SMTP_USER / SMTP_PASS missing in .env");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  requireTLS: !secure,
  tls: { minVersion: "TLSv1.2" },
  logger: true,   // dump the SMTP conversation
  debug: true,    // include the protocol-level trace
});

try {
  console.log("\n[test-mail] verifying connection...");
  await transporter.verify();
  console.log("[test-mail] verify OK — auth + TLS negotiated");

  console.log("\n[test-mail] sending message...");
  const info = await transporter.sendMail({
    from,
    to,
    subject: "QuikConstruction standalone SMTP test",
    text:
      "If you're reading this, SMTP credentials + network are fine. " +
      "The failure is inside Next.js (most likely .env not reloaded).",
    html: `
      <h2>QuikConstruction standalone SMTP test</h2>
      <p>If you're reading this, SMTP credentials + network are fine.</p>
      <p>The failure is inside Next.js — most likely <b>the dev server
      was never restarted after editing .env</b>.</p>
      <p><b>Sent at:</b> ${new Date().toISOString()}</p>
    `,
  });

  console.log("\n[test-mail] ✅ SENT");
  console.log("  messageId:", info.messageId);
  console.log("  accepted:", info.accepted);
  console.log("  rejected:", info.rejected);
  console.log("  response:", info.response);
  process.exit(0);
} catch (err) {
  console.error("\n[test-mail] ❌ FAILED");
  console.error("  code:    ", err?.code);
  console.error("  command: ", err?.command);
  console.error("  response:", err?.response);
  console.error("  message: ", err?.message);
  process.exit(1);
}
