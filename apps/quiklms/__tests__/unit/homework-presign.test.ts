/**
 * homework — every attachment / submission / corrected-file URL was returned
 * UNSIGNED, so it 403'd against the private bucket. The legacy presigned on
 * every read path (`homework.service.ts:41-74`); the first port declared URLs
 * "returned as stored (passthrough)", which broke every homework attachment,
 * student submission and teacher-corrected feedback file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  presign: vi.fn(),
  hwFindUnique: vi.fn(),
  hwFindMany: vi.fn(),
  subFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  batchFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: h.presign }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsHomework: { findUnique: h.hwFindUnique, findMany: h.hwFindMany },
    lmsHomeworkSubmission: { findMany: h.subFindMany },
    lmsUser: { findUnique: h.userFindUnique, findMany: h.userFindMany },
    lmsBatch: { findUnique: h.batchFindUnique },
    lmsBatchStudent: { findMany: vi.fn() },
  },
}));

import { findOne, getSubmissions, getTeacherHomework } from '@/lib/services/homework-service';

const S3 = 'https://b.s3.ap-south-1.amazonaws.com';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.presign.mockImplementation(async (u: string) => `${u}?X-Amz-Signature=sig`);
  // batchLite(id, true) selects `students`, so the mock must provide it.
  h.batchFindUnique.mockResolvedValue({
    id: 'b1', name: 'B', grade: '10', subject: 'Maths', students: [{ studentId: 'u1' }],
  });
  h.userFindUnique.mockResolvedValue({ id: 't1', firstName: 'T', lastName: 'One' });
  h.userFindMany.mockResolvedValue([]);
});

describe('homework read paths presign attachment urls', () => {
  it('findOne presigns the homework attachmentUrls', async () => {
    h.hwFindUnique.mockResolvedValue({
      id: 'hw1', orgId: 'org-1', batchId: 'b1', teacherId: 't1',
      attachmentUrls: [`${S3}/hw/1.pdf`],
    });
    const out = await findOne('org-1', 'hw1');
    expect((out.attachmentUrls as string[])[0]).toContain('X-Amz-Signature');
  });

  it('getTeacherHomework presigns every row', async () => {
    h.hwFindMany.mockResolvedValue([
      { id: 'hw1', orgId: 'org-1', batchId: 'b1', teacherId: 't1', attachmentUrls: [`${S3}/a.pdf`] },
      { id: 'hw2', orgId: 'org-1', batchId: 'b1', teacherId: 't1', attachmentUrls: [`${S3}/b.pdf`] },
    ]);
    const rows = await getTeacherHomework('org-1', 't1');
    expect((rows[0].attachmentUrls as string[])[0]).toContain('X-Amz-Signature');
    expect((rows[1].attachmentUrls as string[])[0]).toContain('X-Amz-Signature');
  });

  it('getSubmissions presigns attachments AND the corrected feedback file', async () => {
    h.subFindMany.mockResolvedValue([
      {
        id: 's1', studentId: 'u1', rubricScores: [],
        attachmentUrls: [`${S3}/sub/1.pdf`],
        correctedFileUrl: `${S3}/fb/1.pdf`,
      },
    ]);
    h.userFindMany.mockResolvedValue([
      { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.test', grade: '10', studentId: 'S1' },
    ]);
    const [sub] = await getSubmissions('org-1', 'hw1');
    expect((sub.attachmentUrls as string[])[0]).toContain('X-Amz-Signature');
    expect(sub.correctedFileUrl).toContain('X-Amz-Signature');
  });

  it('leaves an empty attachment list alone', async () => {
    h.hwFindUnique.mockResolvedValue({
      id: 'hw1', orgId: 'org-1', batchId: 'b1', teacherId: 't1', attachmentUrls: [],
    });
    const out = await findOne('org-1', 'hw1');
    expect(out.attachmentUrls).toEqual([]);
    expect(h.presign).not.toHaveBeenCalled();
  });

  it('keeps the stored url when presigning fails — never returns undefined', async () => {
    h.presign.mockResolvedValue(null);
    h.hwFindUnique.mockResolvedValue({
      id: 'hw1', orgId: 'org-1', batchId: 'b1', teacherId: 't1', attachmentUrls: [`${S3}/hw/1.pdf`],
    });
    const out = await findOne('org-1', 'hw1');
    expect((out.attachmentUrls as string[])[0]).toBe(`${S3}/hw/1.pdf`);
  });
});
