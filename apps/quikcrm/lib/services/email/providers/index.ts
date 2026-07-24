/**
 * Provider registry + feature-availability checks.
 *
 * `getProvider(name)` returns the concrete MailboxProvider. `configuredProviders()`
 * reports which providers have OAuth client creds set (drives which Connect
 * buttons the UI shows and whether the sync cron does anything).
 */

import { env } from "@/lib/env";
import { isTokenCipherConfigured } from "@/lib/crypto/token-cipher";
import { gmailProvider } from "./gmail";
import { microsoftProvider } from "./microsoft";
import type { MailboxProvider, ProviderName } from "./types";

export function getProvider(name: string): MailboxProvider {
  if (name === "gmail") return gmailProvider;
  if (name === "microsoft") return microsoftProvider;
  throw new Error(`Unknown mailbox provider: ${name}`);
}

export function isProviderName(s: string): s is ProviderName {
  return s === "gmail" || s === "microsoft";
}

/** Which providers are usable (client creds present AND token cipher configured). */
export function configuredProviders(): ProviderName[] {
  const e = env();
  if (!isTokenCipherConfigured()) return [];
  const out: ProviderName[] = [];
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) out.push("gmail");
  if (e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET) out.push("microsoft");
  return out;
}

export function isProviderConfigured(name: ProviderName): boolean {
  return configuredProviders().includes(name);
}

/**
 * Diagnostic breakdown of WHY providers are/aren't available. Surfaced on the
 * Settings → Email page so a missing piece is explicit, never a silent
 * "not configured". Reports booleans only — never the secret values.
 */
export interface ProviderConfigStatus {
  tokenEncryptionKey: boolean;
  gmail: boolean;
  microsoft: boolean;
  /** True when at least one provider is fully usable. */
  anyAvailable: boolean;
}

export function providerConfigStatus(): ProviderConfigStatus {
  const e = env();
  const tokenEncryptionKey = isTokenCipherConfigured();
  const gmailCreds = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const microsoftCreds = Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET);
  const gmail = tokenEncryptionKey && gmailCreds;
  const microsoft = tokenEncryptionKey && microsoftCreds;
  return {
    tokenEncryptionKey,
    // Report creds separately from the key gate so the UI can say
    // "creds set but encryption key missing" precisely.
    gmail: gmailCreds,
    microsoft: microsoftCreds,
    anyAvailable: gmail || microsoft,
  };
}
