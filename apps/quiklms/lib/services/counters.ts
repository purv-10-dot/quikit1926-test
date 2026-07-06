/**
 * Per-tenant sequence generator — ported from CountersService.
 * Produces SCH-T-0001 / SCH-S-0001 / SCH-P-0001 style ids (teacher/student/parent).
 */
import { prisma } from '@/lib/prisma';

const PREFIX: Record<string, string> = { teacher: 'SCH-T', student: 'SCH-S', parent: 'SCH-P' };

export async function getNextId(tenantId: string, type: 'teacher' | 'student' | 'parent'): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { tenantId_type: { tenantId, type } },
    create: { tenantId, type, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  const seq = counter.seq.toString().padStart(4, '0');
  return `${PREFIX[type]}-${seq}`;
}
