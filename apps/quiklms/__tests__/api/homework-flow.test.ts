/**
 * Homework lifecycle — teacher creates (with an attachment) → assigns to a batch →
 * student sees it and submits (with a file) → teacher reviews and grades → student
 * sees the result.
 *
 * Every `describe` here pins a defect that broke that chain:
 *
 *  - CREATE: `dueDate: z.string()` accepted the `''` that an untouched
 *    `<input type="date">` submits, so `new Date('')` reached Prisma as an Invalid
 *    Date and the whole create failed with no field named. This is the one that
 *    made "a teacher cannot create homework at all" true.
 *  - CREATE: `maxScore` was capped at 100 while the Total Points input had no max,
 *    so a 150-point assignment was refused as a bare "Validation failed".
 *  - GRADE: `score` was independently capped at 100, which would have made a
 *    >100-point assignment ungradable — and permitted 100 on a 20-point one,
 *    because nothing compared the score to the homework's own `maxScore`.
 *  - STORED URLS: `stripPresignedParams` matched `X-Amz-` only. Storage moved to
 *    GCS, which signs with `X-Goog-…`, so every signature was persisted into
 *    `attachmentUrls` / `correctedFileUrl` and went stale in an hour.
 *  - SUBMIT: `lateSubmissionDeadline` was written by the form and never enforced.
 *
 * The routes are imported and invoked, never mocked (rule book §4). Prisma, the
 * storage helpers and the auth context are the only mocks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  assertCanViewStudent: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  putObject: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
  hwCreate: vi.fn(),
  hwFindUnique: vi.fn(),
  hwFindMany: vi.fn(),
  hwUpdate: vi.fn(),
  subCreate: vi.fn(),
  subFindFirst: vi.fn(),
  subFindMany: vi.fn(),
  subUpdate: vi.fn(),
  subCount: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  batchFindUnique: vi.fn(),
  batchStudentFindMany: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth, requireRoles: h.requireRoles }));
vi.mock('@/lib/auth/student-access', () => ({ assertCanViewStudent: h.assertCanViewStudent }));
vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => 'test-bucket' }));
vi.mock('@/lib/s3', () => ({
  S3_BUCKET: 'test-bucket',
  presignPut: h.presignPut,
  presignGet: h.presignGet,
  putObject: h.putObject,
  presignFromUrlOrKey: h.presignFromUrlOrKey,
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsHomework: {
      create: h.hwCreate, findUnique: h.hwFindUnique, findMany: h.hwFindMany,
      update: h.hwUpdate, delete: vi.fn(),
    },
    lmsHomeworkSubmission: {
      create: h.subCreate, findFirst: h.subFindFirst, findMany: h.subFindMany,
      update: h.subUpdate, count: h.subCount,
    },
    lmsUser: { findUnique: h.userFindUnique, findMany: h.userFindMany },
    lmsBatch: { findUnique: h.batchFindUnique },
    lmsBatchStudent: { findMany: h.batchStudentFindMany },
  },
}));

import { Unauthorized } from '@/lib/http';
import { POST as createHomework } from '@/app/api/homework/route';
import { PATCH as updateHomework, GET as getHomework } from '@/app/api/homework/[id]/route';
import { POST as uploadHomeworkFile } from '@/app/api/upload/homework-resource/route';
import { POST as submitHomework } from '@/app/api/homework/[id]/submit/route';
import { GET as listSubmissions } from '@/app/api/homework/[id]/submissions/route';
import { PATCH as gradeSubmission } from '@/app/api/homework/submissions/[id]/grade/route';
import { GET as studentSubmissions } from '@/app/api/homework/student/submissions/route';

const TEACHER = { id: 't1', role: 'TEACHER', orgId: 'org-1', isActive: true };
const LEARNER = { id: 'u1', role: 'LEARNER', orgId: 'org-1', isActive: true };
const HW = '11111111-1111-1111-1111-111111111111';
const PERMANENT = 'https://storage.googleapis.com/test-bucket/tenants/org-1/homework/1700000000000-a.pdf';

function jsonReq(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as never;
}
function formReq(url: string, name: string, type: string, bytes = 3) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return new Request(url, { method: 'POST', body: form }) as never;
}
const getReq = (url: string) => new Request(url) as never;

/** The exact body the teacher form posts, with per-test overrides. */
const createBody = (over: Record<string, unknown> = {}) => ({
  title: 'Chapter 5 Exercises',
  description: '',
  type: 'assignment',
  dueDate: '2099-08-15',
  maxScore: 100,
  instructions: '',
  allowLateSubmission: false,
  latePenaltyPercent: 10,
  batchId: 'b1',
  attachmentUrls: [],
  resourceLinks: [],
  ...over,
});

/**
 * The joined validation-error string a 400 envelope carries. Callers use
 * `.toContain('fieldName')` on the result — `expect(string).toContain(substr)`
 * works the same way `expect(array).toContain(item)` did.
 */
const badFields = async (res: Response): Promise<string> => {
  const body = (await res.json()) as { error?: string };
  return body.error ?? '';
};

const publishedHomework = (over: Record<string, unknown> = {}) => ({
  id: HW,
  orgId: 'org-1',
  batchId: 'b1',
  teacherId: 't1',
  title: 'Chapter 5 Exercises',
  status: 'published',
  dueDate: new Date('2099-01-01'),
  allowLateSubmission: false,
  lateSubmissionDeadline: null,
  maxScore: 100,
  latePenaltyPercent: 10,
  ...over,
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(TEACHER);
  h.requireRoles.mockReturnValue(undefined);
  h.assertCanViewStudent.mockResolvedValue(undefined);
  h.presignPut.mockResolvedValue('https://storage.example/put?sig=1');
  h.presignGet.mockResolvedValue('https://storage.example/get?sig=1');
  h.presignFromUrlOrKey.mockImplementation(async (u: string) => `${u}?X-Goog-Signature=fresh`);
  h.batchFindUnique.mockResolvedValue({
    id: 'b1', name: 'Grade 10 — Maths', grade: '10', subject: 'Maths',
    students: [{ studentId: 'u1' }, { studentId: 'u2' }],
  });
  h.userFindUnique.mockResolvedValue({ id: 't1', firstName: 'Tara', lastName: 'Ng' });
  h.userFindMany.mockResolvedValue([]);
  h.hwCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: HW, ...data }));
  h.hwUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: HW, orgId: 'org-1', batchId: 'b1', ...data }));
  // Mirror Prisma: `rubricScores` in `data` is a nested write, and the RETURNED
  // row carries the rows themselves (via `include`), not the write instruction.
  h.subUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const { rubricScores: _w, ...rest } = data;
    return { id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', rubricScores: [], ...rest };
  });
});

// ═══════════════════ 1. TEACHER CREATES HOMEWORK ═══════════════════
describe('POST /api/homework — create', () => {
  it('creates a homework item with all its fields', async () => {
    const res = await createHomework(jsonReq('http://x/api/homework', createBody()), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Chapter 5 Exercises');
    // `json()` aliases id → _id; the whole client addresses records by `_id`.
    expect(body._id).toBe(HW);
    // Published on create — that IS the "assign to the batch" step.
    expect(h.hwCreate.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', teacherId: 't1', batchId: 'b1', status: 'published',
    });
  });

  /**
   * THE REGRESSION. `''` is what the Due Date input submits when untouched, and
   * `z.string()` let it through to `new Date('')`.
   */
  it('rejects a BLANK due date as a field error, not an opaque failure', async () => {
    const res = await createHomework(jsonReq('http://x/api/homework', createBody({ dueDate: '' })), {});
    expect(res.status).toBe(400);
    expect(await badFields(res)).toContain('dueDate');
    // The important half: nothing reached the database.
    expect(h.hwCreate).not.toHaveBeenCalled();
  });

  it('rejects a date string that does not parse', async () => {
    // `2099-13-45` passes a `^\d{4}-\d{2}-\d{2}` regex and is still an Invalid
    // Date — which is why the guard asserts parseability, not shape.
    for (const dueDate of ['2099-13-45', 'next tuesday', 'tomorrow']) {
      h.hwCreate.mockClear();
      const res = await createHomework(jsonReq('http://x/api/homework', createBody({ dueDate })), {});
      expect(res.status, dueDate).toBe(400);
      expect(await badFields(res)).toContain('dueDate');
      expect(h.hwCreate).not.toHaveBeenCalled();
    }
  });

  it('never hands Prisma an Invalid Date', async () => {
    await createHomework(jsonReq('http://x/api/homework', createBody({ dueDate: '2099-08-15' })), {});
    const { dueDate } = h.hwCreate.mock.calls[0][0].data;
    expect(Number.isNaN(new Date(dueDate).getTime())).toBe(false);
  });

  it('accepts an assignment worth MORE than 100 points', async () => {
    // The Total Points input carries `min={1}` and no max, so 150 is ordinary
    // input. The route used to answer 400 "Validation failed".
    const res = await createHomework(jsonReq('http://x/api/homework', createBody({ maxScore: 150 })), {});
    expect(res.status).toBe(200);
    expect(h.hwCreate.mock.calls[0][0].data.maxScore).toBe(150);
  });

  it('still rejects a zero/fractional/absurd score ceiling', async () => {
    for (const maxScore of [0, -5, 12.5, 2_000_000]) {
      const res = await createHomework(jsonReq('http://x/api/homework', createBody({ maxScore })), {});
      expect(res.status, String(maxScore)).toBe(400);
      expect(await badFields(res)).toContain('maxScore');
    }
  });

  it('rejects an empty title and an empty batch', async () => {
    expect(await badFields(await createHomework(jsonReq('http://x/api/homework', createBody({ title: '  '.trim() })), {})))
      .toContain('title');
    expect(await badFields(await createHomework(jsonReq('http://x/api/homework', createBody({ batchId: '' })), {})))
      .toContain('batchId');
  });

  it('rejects a resource link with no url', async () => {
    const res = await createHomework(
      jsonReq('http://x/api/homework', createBody({ resourceLinks: [{ url: '', label: 'Dead' }] })),
      {},
    );
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));
    const res = await createHomework(jsonReq('http://x/api/homework', createBody()), {});
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/homework/:id — the edit the teacher can now reach', () => {
  it('applies the same bounds as create', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    const ok = await updateHomework(
      jsonReq(`http://x/api/homework/${HW}`, { maxScore: 150, dueDate: '2099-09-01' }, 'PATCH'),
      { params: { id: HW } },
    );
    expect(ok.status).toBe(200);

    const bad = await updateHomework(
      jsonReq(`http://x/api/homework/${HW}`, { dueDate: '' }, 'PATCH'),
      { params: { id: HW } },
    );
    expect(bad.status).toBe(400);
    expect(await badFields(bad)).toContain('dueDate');
  });

  it('persists the late-submission window it accepts', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    await updateHomework(
      jsonReq(
        `http://x/api/homework/${HW}`,
        { allowLateSubmission: true, lateSubmissionDeadline: '2099-09-20', latePenaltyPercent: 25 },
        'PATCH',
      ),
      { params: { id: HW } },
    );
    expect(h.hwUpdate.mock.calls[0][0].data).toMatchObject({
      allowLateSubmission: true,
      latePenaltyPercent: 25,
    });
    expect(h.hwUpdate.mock.calls[0][0].data.lateSubmissionDeadline).toBeInstanceOf(Date);
  });

  it('404s across orgs', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ orgId: 'org-OTHER' }));
    const res = await updateHomework(
      jsonReq(`http://x/api/homework/${HW}`, { title: 'Stolen' }, 'PATCH'),
      { params: { id: HW } },
    );
    expect(res.status).toBe(404);
    expect(h.hwUpdate).not.toHaveBeenCalled();
  });
});

// ═══════════════════ 2. THE ATTACHMENT UPLOAD ═══════════════════
describe('POST /api/upload/homework-resource', () => {
  it('stores the bytes and returns both a permanent and a renderable URL', async () => {
    const res = await uploadHomeworkFile(
      formReq('http://x/api/upload/homework-resource', 'brief.pdf', 'application/pdf', 9),
      {},
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();

    // Proxied: the server already wrote it, so there is nothing left to PUT.
    expect(data.uploadUrl).toBeUndefined();
    expect(h.presignPut).not.toHaveBeenCalled();
    // Tenant-scoped key — one org's homework can never land in another's prefix.
    expect(data.s3Key.startsWith('tenants/org-1/homework/')).toBe(true);
    expect(data.permanentUrl).toBe(`https://storage.googleapis.com/test-bucket/${data.s3Key}`);
    // The bucket is private, so the caller also needs something it can render.
    expect(data.previewUrl).toBe('https://storage.example/get?sig=1');

    const [key, buffer, contentType] = h.putObject.mock.calls[0];
    expect(key).toBe(data.s3Key);
    expect(buffer.length).toBe(9);
    expect(contentType).toBe('application/pdf');
  });

  it('is open to the LEARNER too — the student submits through the same route', async () => {
    h.requireAuth.mockResolvedValue(LEARNER);
    const res = await uploadHomeworkFile(
      formReq('http://x/api/upload/homework-resource', 'my-answers.pdf', 'application/pdf'),
      {},
    );
    expect(res.status).toBe(200);
  });

  it('401s when unauthenticated, and never touches storage', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));
    const res = await uploadHomeworkFile(
      formReq('http://x/api/upload/homework-resource', 'a.pdf', 'application/pdf'),
      {},
    );
    expect(res.status).toBe(401);
    expect(h.putObject).not.toHaveBeenCalled();
  });
});

// ═══════════════════ 3. STUDENT SEES IT AND SUBMITS ═══════════════════
describe('GET /api/homework/student/submissions — the student dashboard', () => {
  it('lists homework assigned to a batch the student is enrolled in', async () => {
    h.requireAuth.mockResolvedValue(LEARNER);
    h.subFindMany.mockResolvedValue([]);
    h.batchStudentFindMany.mockResolvedValue([{ batchId: 'b1' }]);
    h.hwFindMany.mockResolvedValue([publishedHomework({ attachmentUrls: [PERMANENT] })]);

    const res = await studentSubmissions(getReq('http://x/api/homework/student/submissions'), {});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.pending).toHaveLength(1);
    expect(body.pending[0]._id).toBe(HW);
    // Batch and teacher are resolved to objects the UI can name.
    expect(body.pending[0].batchId.name).toBe('Grade 10 — Maths');
    // The teacher's brief must arrive SIGNED or it 403s from the private bucket.
    expect(body.pending[0].attachmentUrls[0]).toContain('X-Goog-Signature=fresh');
  });

  it('scopes the batch lookup to the caller org', async () => {
    h.requireAuth.mockResolvedValue(LEARNER);
    h.subFindMany.mockResolvedValue([]);
    h.batchStudentFindMany.mockResolvedValue([]);
    await studentSubmissions(getReq('http://x/api/homework/student/submissions'), {});
    expect(h.batchStudentFindMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'u1',
      batch: { orgId: 'org-1' },
    });
  });
});

describe('POST /api/homework/:id/submit', () => {
  beforeEach(() => {
    h.requireAuth.mockResolvedValue(LEARNER);
    h.subFindFirst.mockResolvedValue(null);
    h.subCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: 's1', ...data, rubricScores: [] }));
  });

  it('persists the submission with its file', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    const res = await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'Done', attachmentUrls: [PERMANENT] }),
      { params: { id: HW } },
    );
    expect(res.status).toBe(200);
    expect(h.subCreate.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', homeworkId: HW, studentId: 'u1', textResponse: 'Done', isLate: false,
    });
  });

  /**
   * THE REGRESSION. `stripPresignedParams` tested `X-Amz-` only, so a GCS
   * signature — the only kind this bucket mints — was written to the row and went
   * stale an hour later.
   */
  it('strips a GCS signature before storing the attachment URL', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    const signed = `${PERMANENT}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=deadbeef`;
    await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { attachmentUrls: [signed] }),
      { params: { id: HW } },
    );
    expect(h.subCreate.mock.calls[0][0].data.attachmentUrls).toEqual([PERMANENT]);
  });

  it('still strips a legacy AWS signature, and leaves a clean URL alone', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, {
        attachmentUrls: [`${PERMANENT}?X-Amz-Signature=old`, PERMANENT, 'https://drive.google.com/file/d/abc'],
      }),
      { params: { id: HW } },
    );
    expect(h.subCreate.mock.calls[0][0].data.attachmentUrls).toEqual([
      PERMANENT, PERMANENT, 'https://drive.google.com/file/d/abc',
    ]);
  });

  it('refuses a late submission when the teacher did not allow one', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ dueDate: new Date('2000-01-01') }));
    const res = await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'late' }),
      { params: { id: HW } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Late submissions are not allowed for this homework');
  });

  /** THE REGRESSION: the far end of the late window was never checked. */
  it('refuses a late submission past lateSubmissionDeadline', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({
      dueDate: new Date('2000-01-01'),
      allowLateSubmission: true,
      lateSubmissionDeadline: new Date('2000-02-01'),
    }));
    const res = await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'very late' }),
      { params: { id: HW } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('The late submission deadline for this homework has passed');
    expect(h.subCreate).not.toHaveBeenCalled();
  });

  it('accepts a late submission still inside the window, and flags it late', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({
      dueDate: new Date('2000-01-01'),
      allowLateSubmission: true,
      lateSubmissionDeadline: new Date('2099-02-01'),
    }));
    const res = await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'a bit late' }),
      { params: { id: HW } },
    );
    expect(res.status).toBe(200);
    expect(h.subCreate.mock.calls[0][0].data.isLate).toBe(true);
  });

  it('refuses a closed homework and a second submission', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ status: 'closed' }));
    expect((await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'x' }), { params: { id: HW } },
    )).status).toBe(400);

    h.hwFindUnique.mockResolvedValue(publishedHomework());
    h.subFindFirst.mockResolvedValue({ id: 's1' });
    expect((await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'x' }), { params: { id: HW } },
    )).status).toBe(400);
  });

  it('404s on another org\'s homework', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ orgId: 'org-OTHER' }));
    const res = await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'x' }),
      { params: { id: HW } },
    );
    expect(res.status).toBe(404);
    expect(h.subCreate).not.toHaveBeenCalled();
  });

  it('cannot self-grade — score is not in the submit schema', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework());
    await submitHomework(
      jsonReq(`http://x/api/homework/${HW}/submit`, { textResponse: 'x', score: 100, status: 'graded' }),
      { params: { id: HW } },
    );
    const { data } = h.subCreate.mock.calls[0][0];
    expect(data.score).toBeUndefined();
    expect(data.status).toBeUndefined();
  });
});

// ═══════════════════ 4. TEACHER REVIEWS AND GRADES ═══════════════════
describe('GET /api/homework/:id/submissions — the review list', () => {
  it('returns each submission with a named student and a signed, openable file', async () => {
    h.subFindMany.mockResolvedValue([{
      id: 's1', studentId: 'u1', status: 'submitted', rubricScores: [],
      attachmentUrls: [PERMANENT], correctedFileUrl: null,
      submittedAt: new Date('2026-07-01'), isLate: false,
    }]);
    h.userFindMany.mockResolvedValue([
      { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.dev', grade: '10', studentId: 'S1' },
    ]);

    const res = await listSubmissions(getReq(`http://x/api/homework/${HW}/submissions`), { params: { id: HW } });
    expect(res.status).toBe(200);
    const [sub] = await res.json();

    expect(sub.studentId.firstName).toBe('Ada');
    // `submitted` is the status the Grade button keys on.
    expect(sub.status).toBe('submitted');
    // Signed, so the preview modal can render it rather than showing a 403.
    expect(sub.attachmentUrls[0]).toContain('X-Goog-Signature=fresh');
    expect(h.subFindMany.mock.calls[0][0].where).toMatchObject({ orgId: 'org-1', homeworkId: HW });
  });
});

describe('PATCH /api/homework/submissions/:id/grade', () => {
  beforeEach(() => {
    h.userFindUnique.mockResolvedValue({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('grades a submission and reports it graded', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: false });
    h.hwFindUnique.mockResolvedValue({ maxScore: 100, latePenaltyPercent: 10 });

    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: 85, feedback: 'Solid work' }, 'PATCH'),
      { params: { id: 's1' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('graded');
    expect(body.score).toBe(85);
    expect(body.finalScore).toBe(85);
    expect(body.gradedBy).toBe('t1');
  });

  /** The score ceiling is the homework's, not a literal 100 in the route. */
  it('allows a score above 100 on an assignment worth more than 100', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: false });
    h.hwFindUnique.mockResolvedValue({ maxScore: 150, latePenaltyPercent: 0 });

    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: 140 }, 'PATCH'),
      { params: { id: 's1' } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).score).toBe(140);
  });

  it('refuses a score above the homework maximum, and names the maximum', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: false });
    h.hwFindUnique.mockResolvedValue({ maxScore: 20, latePenaltyPercent: 0 });

    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: 100 }, 'PATCH'),
      { params: { id: 's1' } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('20');
    expect(h.subUpdate).not.toHaveBeenCalled();
  });

  it('rejects a negative score', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: false });
    h.hwFindUnique.mockResolvedValue({ maxScore: 100, latePenaltyPercent: 0 });
    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: -1 }, 'PATCH'),
      { params: { id: 's1' } },
    );
    expect(res.status).toBe(400);
    expect(await badFields(res)).toContain('score');
  });

  it('applies the late penalty to the final score', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: true });
    h.hwFindUnique.mockResolvedValue({ maxScore: 100, latePenaltyPercent: 20 });

    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: 90 }, 'PATCH'),
      { params: { id: 's1' } },
    );
    const body = await res.json();
    expect(body.latePenaltyApplied).toBe(18);
    expect(body.finalScore).toBe(72);
  });

  it('stores the corrected file WITHOUT its GCS signature', async () => {
    h.subFindFirst.mockResolvedValue({ id: 's1', orgId: 'org-1', homeworkId: HW, studentId: 'u1', isLate: false });
    h.hwFindUnique.mockResolvedValue({ maxScore: 100, latePenaltyPercent: 0 });

    await gradeSubmission(
      jsonReq(
        'http://x/api/homework/submissions/s1/grade',
        { score: 70, correctedFileUrl: `${PERMANENT}?X-Goog-Signature=deadbeef` },
        'PATCH',
      ),
      { params: { id: 's1' } },
    );
    expect(h.subUpdate.mock.calls[0][0].data.correctedFileUrl).toBe(PERMANENT);
  });

  it('404s on another org\'s submission', async () => {
    h.subFindFirst.mockResolvedValue(null); // findFirst is already orgId-scoped
    const res = await gradeSubmission(
      jsonReq('http://x/api/homework/submissions/s1/grade', { score: 50 }, 'PATCH'),
      { params: { id: 's1' } },
    );
    expect(res.status).toBe(404);
    expect(h.subUpdate).not.toHaveBeenCalled();
    expect(h.subFindFirst.mock.calls[0][0].where).toMatchObject({ id: 's1', orgId: 'org-1' });
  });
});

// ═══════════════════ 5. STUDENT SEES THE RESULT ═══════════════════
describe('the graded result reaches the student', () => {
  it('returns the score, the feedback and a signed corrected file', async () => {
    h.requireAuth.mockResolvedValue(LEARNER);
    h.batchStudentFindMany.mockResolvedValue([{ batchId: 'b1' }]);
    h.hwFindMany.mockResolvedValue([]);
    h.subFindMany.mockResolvedValue([{
      id: 's1', homeworkId: HW, studentId: 'u1', status: 'graded', rubricScores: [],
      score: 85, finalScore: 85, feedback: 'Solid work', gradedBy: 't1',
      attachmentUrls: [PERMANENT], correctedFileUrl: PERMANENT,
      submittedAt: new Date('2026-07-01'),
    }]);
    h.userFindMany.mockResolvedValue([{ id: 't1', firstName: 'Tara', lastName: 'Ng' }]);

    const res = await studentSubmissions(getReq('http://x/api/homework/student/submissions'), {});
    const [sub] = (await res.json()).submissions;

    expect(sub.status).toBe('graded');
    expect(sub.score).toBe(85);
    expect(sub.feedback).toBe('Solid work');
    expect(sub.gradedBy.firstName).toBe('Tara');
    // Both the student's own file and the teacher's markup must be openable.
    expect(sub.attachmentUrls[0]).toContain('X-Goog-Signature=fresh');
    expect(sub.correctedFileUrl).toContain('X-Goog-Signature=fresh');
  });

  it('a learner cannot read another student\'s submissions', async () => {
    h.requireAuth.mockResolvedValue(LEARNER);
    h.subFindMany.mockResolvedValue([]);
    h.batchStudentFindMany.mockResolvedValue([]);
    h.hwFindMany.mockResolvedValue([]);
    // A learner's `studentId` param is ignored — only a PARENT may name a child,
    // and `assertCanViewStudent` gates that.
    await studentSubmissions(
      getReq('http://x/api/homework/student/submissions?studentId=someone-else'),
      {},
    );
    expect(h.subFindMany.mock.calls[0][0].where).toMatchObject({ orgId: 'org-1', studentId: 'u1' });
  });
});

// ═══════════════════ read-by-id, used by both sides ═══════════════════
describe('GET /api/homework/:id', () => {
  it('presigns the attachments so they can be opened in the app', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ attachmentUrls: [PERMANENT] }));
    const res = await getHomework(getReq(`http://x/api/homework/${HW}`), { params: { id: HW } });
    expect(res.status).toBe(200);
    expect((await res.json()).attachmentUrls[0]).toContain('X-Goog-Signature=fresh');
  });

  it('404s across orgs', async () => {
    h.hwFindUnique.mockResolvedValue(publishedHomework({ orgId: 'org-OTHER' }));
    const res = await getHomework(getReq(`http://x/api/homework/${HW}`), { params: { id: HW } });
    expect(res.status).toBe(404);
  });
});
