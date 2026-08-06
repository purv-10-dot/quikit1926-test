/**
 * SSRF guard for `GET /api/learner/file-proxy` (GAP_REPORT §2.4 / §3.2 learner).
 *
 * The legacy had a protocol check and nothing else, so any authenticated user
 * could make the server fetch the cloud metadata endpoint, localhost, or any
 * RFC1918 host and receive the body. Blocking is a deliberate hardening beyond
 * parity, approved 2026-07-17.
 *
 * The check is on the RESOLVED address, not the hostname — `evil.example.com`
 * can resolve to 127.0.0.1, so a string check on the host would not hold.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('dns/promises', () => ({ lookup: h.lookup }));

import { isBlockedIp, assertSafeFetchUrl } from '@/lib/ssrf';

beforeEach(() => {
  h.lookup.mockReset();
  h.lookup.mockResolvedValue([{ address: '93.184.216.34' }]); // public by default
});

describe('isBlockedIp', () => {
  it('blocks the cloud metadata address', () => {
    // The single most valuable target: AWS/GCP/Azure creds live here.
    expect(isBlockedIp('169.254.169.254')).toBe(true);
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback range', '127.1.2.3'],
    ['private 10/8', '10.0.0.5'],
    ['private 172.16/12', '172.16.0.1'],
    ['private 172.31/12 upper', '172.31.255.255'],
    ['private 192.168/16', '192.168.1.1'],
    ['link-local', '169.254.1.1'],
    ['this-network', '0.0.0.0'],
    ['CGNAT', '100.64.0.1'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
  ])('blocks %s', (_label, ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ['public', '93.184.216.34'],
    ['public 8.8.8.8', '8.8.8.8'],
    // 172.32 is OUTSIDE the 172.16/12 private range — must NOT be blocked.
    ['172.32 is public', '172.32.0.1'],
    ['172.15 is public', '172.15.0.1'],
  ])('allows %s', (_label, ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it.each([
    ['ipv6 loopback', '::1'],
    ['ipv6 unspecified', '::'],
    ['ipv6 link-local', 'fe80::1'],
    ['ipv6 unique-local fc', 'fc00::1'],
    ['ipv6 unique-local fd', 'fd12:3456::1'],
    ['ipv4-mapped loopback', '::ffff:127.0.0.1'],
    ['ipv4-mapped metadata', '::ffff:169.254.169.254'],
  ])('blocks %s', (_label, ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it('allows a public ipv6', () => {
    expect(isBlockedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('refuses anything that is not a parseable ip', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});

describe('assertSafeFetchUrl', () => {
  it('allows a public https url', async () => {
    await expect(assertSafeFetchUrl('https://example.com/a.pdf')).resolves.toBeInstanceOf(URL);
  });

  it('keeps the legacy protocol check and its message', async () => {
    await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only HTTP/HTTPS URLs are supported',
    });
  });

  it('rejects a malformed url', async () => {
    await expect(assertSafeFetchUrl('http://')).rejects.toMatchObject({ message: 'Invalid URL' });
  });

  it('blocks a literal internal ip without any dns lookup', async () => {
    await expect(assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it('blocks a hostname that RESOLVES to loopback — the DNS-rebinding case', async () => {
    // This is why the check is on the resolved address, not the host string.
    h.lookup.mockResolvedValue([{ address: '127.0.0.1' }]);
    await expect(assertSafeFetchUrl('http://evil.example.com/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('blocks when ANY resolved address is internal', async () => {
    h.lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '10.0.0.1' }]);
    await expect(assertSafeFetchUrl('http://multi.example.com/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('blocks when dns resolution fails', async () => {
    h.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeFetchUrl('http://nope.example.com/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('blocks when dns returns nothing', async () => {
    h.lookup.mockResolvedValue([]);
    await expect(assertSafeFetchUrl('http://empty.example.com/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('blocks localhost by name', async () => {
    h.lookup.mockResolvedValue([{ address: '127.0.0.1' }]);
    await expect(assertSafeFetchUrl('http://localhost:3000/x')).rejects.toMatchObject({ statusCode: 400 });
  });
});
