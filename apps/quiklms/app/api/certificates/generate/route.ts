import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { generateCertificate } from '@/lib/services/certificates-service';

// POST /api/certificates/generate — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const body = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const certificate = await generateCertificate({
    certificateTemplateId: body.certificateTemplateId as string | undefined,
    learnerId: body.learnerId as string,
    courseId: body.courseId as string,
    tenantId: user.tenantId as string,
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
