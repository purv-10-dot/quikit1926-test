/**
 * `GET /verify-certificate/:certificateId/download` is PUBLIC — no auth — and
 * had no pass-gate, while its authenticated sibling
 * (`/certificates/:id/download`) refuses a certificate whose learner did not
 * meet the passing criteria.
 *
 * So the gate could be walked around entirely: anyone holding a certificate id
 * could pull the PDF for a FAILED learner. The id is not a secret — it appears
 * in every verification link, and its format is `CERT-<epoch ms>-<9 base36>`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findByCertId: vi.fn(),
  regenerate: vi.fn(),
  gate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/services/certificates-service', () => ({
  findIssuedByCertificateId: h.findByCertId,
  regeneratePdfByCertificateId: h.regenerate,
  // Real implementation — the gate logic itself is what we are asserting.
  downloadGateBlocked: (c: { passed: boolean | null; score: number | null; passingScore: number | null } | null) =>
    !c
      ? false
      : c.passed === false ||
        (typeof c.score === 'number' && typeof c.passingScore === 'number' && c.score < c.passingScore),
}));

import { GET } from '@/app/api/verify-certificate/[certificateId]/download/route';

const req = () => new Request('http://x/api/verify-certificate/CERT-1/download') as never;
const ctx = { params: { certificateId: 'CERT-1' } };

const issued = (o: Partial<{ passed: boolean | null; score: number | null; passingScore: number | null }>) => ({
  id: 'i1',
  certificateId: 'CERT-1',
  passed: null,
  score: null,
  passingScore: null,
  ...o,
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.regenerate.mockResolvedValue({
    buffer: Buffer.from('%PDF-1.4 x'),
    certificate: { certificateId: 'CERT-1' },
  });
});

describe('the public download honours the pass gate', () => {
  it('403s a certificate whose learner failed — the hole', async () => {
    h.findByCertId.mockResolvedValue(issued({ passed: false }));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'You need to meet the passing criteria to download the certificate.',
    });
    // The PDF must never be rendered for a blocked certificate.
    expect(h.regenerate).not.toHaveBeenCalled();
  });

  it('403s when the score is below the passing score', async () => {
    h.findByCertId.mockResolvedValue(issued({ score: 40, passingScore: 70 }));
    expect((await GET(req(), ctx)).status).toBe(403);
    expect(h.regenerate).not.toHaveBeenCalled();
  });

  it('serves the PDF when the learner passed', async () => {
    h.findByCertId.mockResolvedValue(issued({ passed: true, score: 90, passingScore: 70 }));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('Certificate_CERT-1.pdf');
  });

  it('serves a certificate with no score recorded — absence is not failure', async () => {
    // Non-assessed courses issue certificates with score/passingScore null. The
    // legacy treated only an explicit failure as blocking.
    h.findByCertId.mockResolvedValue(issued({}));
    expect((await GET(req(), ctx)).status).toBe(200);
  });

  it('serves when the score meets the bar exactly', async () => {
    h.findByCertId.mockResolvedValue(issued({ score: 70, passingScore: 70 }));
    expect((await GET(req(), ctx)).status).toBe(200);
  });

  it('404s an unknown certificate id without rendering anything', async () => {
    h.findByCertId.mockResolvedValue(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(h.regenerate).not.toHaveBeenCalled();
  });
});
