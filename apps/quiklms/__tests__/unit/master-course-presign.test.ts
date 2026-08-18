/**
 * GAP_REPORT §3.1 — "S3 presigned enrichment dropped across the board".
 *
 * The legacy controller signed every S3 URL buried in a course before returning
 * it (`master-course.controller.ts:53-82`). The port skipped it entirely, so
 * against a private bucket — which the original's universal presigning implies —
 * every course resource URL 403s in the client.
 *
 * These tests pin the enricher's quirks, which are load-bearing:
 *  - thumbnailUrl gets a SIBLING field and is signed unconditionally;
 *  - resource URLs are rewritten IN PLACE and only when they look like S3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ presign: vi.fn() }));

vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
// See courses-presign.test.ts — the host gate is mirrored, not stubbed, so the
// "leaves non-S3 urls untouched" case still means something.
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: h.presign,
  isManagedStorageUrl: (v: unknown) =>
    typeof v === 'string' && (/\.amazonaws\.com/.test(v) || v.includes('storage.googleapis.com')),
  s3: { send: vi.fn() },
  S3_BUCKET: 'b',
}));
vi.mock('@/lib/db', () => ({ db: {} }));
// master-course-service imports the auth context for `userHasRole` (its actor
// predicates). That module pulls in NextAuth + a real PrismaClient at import
// time, which a pure unit test must not construct.
vi.mock('@/lib/auth/context', () => ({
  userHasRole: (u: { role?: string }, role: string) => u?.role === role,
}));

import { enrichCourseWithPresignedUrls, enrichCoursesWithPresignedUrls } from '@/lib/services/master-course-service';

const S3 = 'https://b.s3.ap-south-1.amazonaws.com/tenants/o1/course-resources/deck.pdf';
const EXTERNAL = 'https://cdn.example.com/video.mp4';

beforeEach(() => {
  h.presign.mockReset();
  h.presign.mockImplementation(async (u: string) => `${u}?sig=1`);
});

describe('enrichCourseWithPresignedUrls', () => {
  it('adds thumbnailUrlPresigned as a sibling, leaving thumbnailUrl intact', async () => {
    const out = await enrichCourseWithPresignedUrls({ thumbnailUrl: S3, modules: [] });
    expect(out.thumbnailUrl).toBe(S3);
    expect(out.thumbnailUrlPresigned).toBe(`${S3}?sig=1`);
  });

  it('signs the thumbnail even when it is not an S3 url (legacy has no host check there)', async () => {
    const out = await enrichCourseWithPresignedUrls({ thumbnailUrl: EXTERNAL, modules: [] });
    // presignFromUrlOrKey itself passes non-S3 urls through, so this is safe —
    // but the CALL must still happen, matching the original.
    expect(h.presign).toHaveBeenCalledWith(EXTERNAL);
  });

  it('rewrites subModule resource urls IN PLACE', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ subModules: [{ resources: [{ url: S3, title: 'Deck' }] }] }],
    });
    const res = (out.modules as any)[0].subModules[0].resources[0];
    expect(res.url).toBe(`${S3}?sig=1`);
    expect(res.title).toBe('Deck');
  });

  it('leaves non-S3 resource urls completely untouched', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ subModules: [{ resources: [{ url: EXTERNAL }] }] }],
    });
    expect((out.modules as any)[0].subModules[0].resources[0].url).toBe(EXTERNAL);
    expect(h.presign).not.toHaveBeenCalled();
  });

  it('signs all four resourceData url keys', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [
        {
          subModules: [
            {
              resourceData: {
                url: S3,
                fileUrl: S3,
                contentUrl: S3,
                videoUrl: S3,
                caption: 'not a url key',
              },
            },
          ],
        },
      ],
    });
    const rd = (out.modules as any)[0].subModules[0].resourceData;
    for (const k of ['url', 'fileUrl', 'contentUrl', 'videoUrl']) {
      expect(rd[k], `${k} must be signed`).toBe(`${S3}?sig=1`);
    }
    expect(rd.caption).toBe('not a url key');
  });

  it('falls back to the original url when presigning returns nothing', async () => {
    h.presign.mockResolvedValue(null);
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ subModules: [{ resources: [{ url: S3 }] }] }],
    });
    // Must never blank a url.
    expect((out.modules as any)[0].subModules[0].resources[0].url).toBe(S3);
  });

  it('does not mutate the input object', async () => {
    const input = { thumbnailUrl: S3, modules: [{ subModules: [{ resources: [{ url: S3 }] }] }] };
    await enrichCourseWithPresignedUrls(input);
    expect(input.modules[0].subModules[0].resources[0].url).toBe(S3);
    expect((input as any).thumbnailUrlPresigned).toBeUndefined();
  });

  it('tolerates courses with no modules / empty branches', async () => {
    await expect(enrichCourseWithPresignedUrls({})).resolves.toEqual({});
    await expect(
      enrichCourseWithPresignedUrls({ modules: [{}, { subModules: [{}] }] }),
    ).resolves.toBeTruthy();
  });

  it('enriches a whole list', async () => {
    const out = await enrichCoursesWithPresignedUrls([{ thumbnailUrl: S3 }, { thumbnailUrl: S3 }]);
    expect(out.map((c) => c.thumbnailUrlPresigned)).toEqual([`${S3}?sig=1`, `${S3}?sig=1`]);
  });
});
