/**
 * GAP_REPORT §3.1 — "S3 presigned enrichment dropped across the board".
 *
 * The courses enricher (`courses.controller.ts:36-95`) is a SUPERSET of the
 * master-course one: it signs the relational `modules[].lessons[]` shape
 * (contentUrl / scormLaunchUrl / captions[]) as well as the MasterCourse JSON
 * shape (subModules[].resources[] + resourceData). findAll/findOne merge both
 * collections, so both branches are live.
 *
 * `scormLaunchUrl` is the sharpest case: it is what the SCORM player loads into
 * its iframe. Unsigned, a package on a private bucket never opens — which would
 * quietly undo the §2.3 SCORM work.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ presign: vi.fn() }));

vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
// `isManagedStorageUrl` is the host gate the enricher uses to decide what to
// presign. Mirrored here rather than stubbed true/false so these tests still
// exercise the real "ours vs external URL" decision. Defined inside the factory
// because vi.mock is hoisted above any module-scope const.
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: h.presign,
  isManagedStorageUrl: (v: unknown) =>
    typeof v === 'string' && (/\.amazonaws\.com/.test(v) || v.includes('storage.googleapis.com')),
  s3: { send: vi.fn() },
  S3_BUCKET: 'b',
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { enrichCourseWithPresignedUrls, enrichCoursesWithPresignedUrls } from '@/lib/services/courses-service';

const S3 = 'https://b.s3.ap-south-1.amazonaws.com/tenants/o1/course-resources/video.mp4';
const SCORM = 'https://b.s3.ap-south-1.amazonaws.com/tenants/o1/scorm/abc/index.html';
const EXTERNAL = 'https://cdn.example.com/video.mp4';

beforeEach(() => {
  h.presign.mockReset();
  h.presign.mockImplementation(async (u: string) => `${u}?sig=1`);
});

describe('enrichCourseWithPresignedUrls — relational lesson shape', () => {
  it('signs lesson contentUrl in place', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ contentUrl: S3, title: 'L1' }] }],
    });
    const lesson = (out.modules as any)[0].lessons[0];
    expect(lesson.contentUrl).toBe(`${S3}?sig=1`);
    expect(lesson.title).toBe('L1');
  });

  it('signs scormLaunchUrl — without this a private-bucket SCORM package never opens', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ scormLaunchUrl: SCORM }] }],
    });
    expect((out.modules as any)[0].lessons[0].scormLaunchUrl).toBe(`${SCORM}?sig=1`);
  });

  it('signs every lesson caption url', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ captions: [{ url: S3, lang: 'en' }, { url: S3, lang: 'fr' }] }] }],
    });
    const captions = (out.modules as any)[0].lessons[0].captions;
    expect(captions.map((c: any) => c.url)).toEqual([`${S3}?sig=1`, `${S3}?sig=1`]);
    expect(captions[0].lang).toBe('en');
  });

  it('leaves non-S3 lesson urls untouched', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ contentUrl: EXTERNAL, scormLaunchUrl: EXTERNAL }] }],
    });
    const lesson = (out.modules as any)[0].lessons[0];
    expect(lesson.contentUrl).toBe(EXTERNAL);
    expect(lesson.scormLaunchUrl).toBe(EXTERNAL);
    expect(h.presign).not.toHaveBeenCalled();
  });
});

describe('enrichCourseWithPresignedUrls — MasterCourse json shape', () => {
  it('signs subModule resource urls and their captions', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ subModules: [{ resources: [{ url: S3, captions: [{ url: S3 }] }] }] }],
    });
    const res = (out.modules as any)[0].subModules[0].resources[0];
    expect(res.url).toBe(`${S3}?sig=1`);
    expect(res.captions[0].url).toBe(`${S3}?sig=1`);
  });

  it('signs all four resourceData url keys and nothing else', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [
        { subModules: [{ resourceData: { url: S3, fileUrl: S3, contentUrl: S3, videoUrl: S3, note: S3 } }] },
      ],
    });
    const rd = (out.modules as any)[0].subModules[0].resourceData;
    for (const k of ['url', 'fileUrl', 'contentUrl', 'videoUrl']) expect(rd[k]).toBe(`${S3}?sig=1`);
    expect(rd.note).toBe(S3); // not a recognized key — untouched
  });

  it('handles a course carrying BOTH shapes at once (findAll merges collections)', async () => {
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ contentUrl: S3 }], subModules: [{ resources: [{ url: S3 }] }] }],
    });
    expect((out.modules as any)[0].lessons[0].contentUrl).toBe(`${S3}?sig=1`);
    expect((out.modules as any)[0].subModules[0].resources[0].url).toBe(`${S3}?sig=1`);
  });
});

describe('enrichCourseWithPresignedUrls — shared semantics', () => {
  it('adds thumbnailUrlPresigned as a sibling', async () => {
    const out = await enrichCourseWithPresignedUrls({ thumbnailUrl: S3 });
    expect(out.thumbnailUrl).toBe(S3);
    expect(out.thumbnailUrlPresigned).toBe(`${S3}?sig=1`);
  });

  it('never blanks a url when presigning fails', async () => {
    h.presign.mockResolvedValue(null);
    const out = await enrichCourseWithPresignedUrls({
      modules: [{ lessons: [{ contentUrl: S3, scormLaunchUrl: SCORM }] }],
    });
    const lesson = (out.modules as any)[0].lessons[0];
    expect(lesson.contentUrl).toBe(S3);
    expect(lesson.scormLaunchUrl).toBe(SCORM);
  });

  it('does not mutate the input', async () => {
    const input = { modules: [{ lessons: [{ contentUrl: S3 }] }] };
    await enrichCourseWithPresignedUrls(input);
    expect(input.modules[0].lessons[0].contentUrl).toBe(S3);
  });

  it('tolerates empty / missing branches', async () => {
    await expect(enrichCourseWithPresignedUrls({})).resolves.toEqual({});
    await expect(enrichCourseWithPresignedUrls({ modules: [{}] })).resolves.toBeTruthy();
    await expect(enrichCoursesWithPresignedUrls([])).resolves.toEqual([]);
  });
});
