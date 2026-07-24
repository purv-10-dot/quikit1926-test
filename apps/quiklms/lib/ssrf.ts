/**
 * SSRF guard for server-side URL fetching.
 *
 * The legacy backend had NO host restriction on `GET /learner/file-proxy`
 * (`learner.controller.ts:337-367` — protocol check only), so any authenticated
 * user could make the server fetch `http://169.254.169.254/latest/meta-data/`,
 * `localhost`, or any RFC1918 address and receive the response body. This module
 * closes that hole; it is a deliberate hardening beyond parity, approved
 * 2026-07-17.
 *
 * Blocking is done on the RESOLVED IP, not the hostname — a name like
 * `evil.example.com` can resolve to 127.0.0.1, so a string check on the host is
 * not sufficient.
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { BadRequest } from '@/lib/http';

/** True for loopback / private / link-local / other non-public ranges. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);

  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }

  if (v === 6) {
    const ip6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (ip6 === '::1' || ip6 === '::') return true; // loopback / unspecified
    if (ip6.startsWith('fe80')) return true; // link-local
    if (/^f[cd]/.test(ip6)) return true; // fc00::/7 unique-local
    // IPv4-mapped (::ffff:127.0.0.1) — re-check the embedded v4 address.
    const mapped = ip6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }

  return true; // not a parseable IP — refuse
}

/**
 * Validate a user-supplied URL for server-side fetching.
 * Throws a 400 (matching the legacy handler's error style) when it is unsafe.
 */
export async function assertSafeFetchUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw BadRequest('Invalid URL');
  }

  // Legacy check, preserved verbatim.
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw BadRequest('Only HTTP/HTTPS URLs are supported');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // Literal IP — check directly, no DNS needed.
  if (isIP(host)) {
    if (isBlockedIp(host)) throw BadRequest('Failed to fetch file');
    return parsed;
  }

  // Hostname — resolve and check EVERY address it maps to.
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw BadRequest('Failed to fetch file');
  }
  if (!addresses.length || addresses.some((a) => isBlockedIp(a.address))) {
    throw BadRequest('Failed to fetch file');
  }

  return parsed;
}
