import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { generateCertificate } from '@/lib/services/certificates-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `learnerId` and `courseId` are the two body-supplied thirds of
 * `LmsCertificateIssued`'s `@@unique([orgId, learnerId, courseId])` key — the
 * lookup that decides "already issued?" and then the insert itself. Missing,
 * they reached Postgres as `undefined` on a NOT NULL column. `orgId` is taken
 * from the session, never the body, so it is deliberately not declared.
 *
 * `userName`/`courseName` are nullable snapshot columns and stay optional.
 * `expiresAt` is parsed with `new Date(...)` by the handler, so it is accepted
 * as a string or a number of milliseconds.
 */
const generateCertificateSchema = z.object({
  learnerId: z.string().min(1, 'learnerId is required'),
  courseId: z.string().min(1, 'courseId is required'),
  certificateTemplateId: z.string().nullish(),
  userName: z.string().nullish(),
  courseName: z.string().nullish(),
  designation: z.string().nullish(),
  isComplianceCertificate: z.boolean().optional(),
  expiresAt: z.union([z.string(), z.number()]).nullish(),
  score: z.number().nullish(),
  passingScore: z.number().nullish(),
  passed: z.boolean().nullish(),
});

// POST /api/certificates/generate — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const body = (await parseBody(req, generateCertificateSchema)) as Record<string, unknown>;
  const certificate = await generateCertificate({
    certificateTemplateId: body.certificateTemplateId as string | undefined,
    learnerId: body.learnerId as string,
    courseId: body.courseId as string,
    orgId: user.orgId as string,
    userName: body.userName as string,
    courseName: body.courseName as string,
    designation: body.designation as string | undefined,
    isComplianceCertificate: body.isComplianceCertificate as boolean | undefined,
    expiresAt: body.expiresAt ? new Date(body.expiresAt as string) : undefined,
    score: body.score as number | undefined,
    passingScore: body.passingScore as number | undefined,
    passed: body.passed as boolean | undefined,
  });
  return json({ success: true, data: certificate });
});
