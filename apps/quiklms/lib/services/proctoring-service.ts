/**
 * Proctoring service — ported from ProctoringService (Mongo → Prisma).
 * Writes ProctoringLog rows, aggregates proctoringFlags Json on the ExamSession,
 * and lazily generates IncidentReport rows. orgId enforced via tenantWhere().
 */
import type { Prisma, LmsProctoringEventType as ProctoringEventType, LmsProctoringSeverity as ProctoringSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';
import type { AuthUser } from '@/lib/auth/context';

type ProctoringFlags = Record<string, number | string>;

const FLAG_FIELD_MAP: Record<string, string> = {
  tab_switch: 'tabSwitches',
  fullscreen_exit: 'fullscreenExits',
  copy_attempt: 'copyAttempts',
  paste_attempt: 'copyAttempts',
  right_click: 'rightClicks',
  shortcut_key: 'shortcutAttempts',
  print_attempt: 'shortcutAttempts',
  blur: 'tabSwitches',
  beforeunload: 'tabSwitches',
};

function getFlagField(eventType: string): string | null {
  return FLAG_FIELD_MAP[eventType] || null;
}

export async function logEvent(
  user: AuthUser,
  studentId: string,
  sessionId: string,
  eventType: string,
  metadata?: unknown,
) {
  const orgId = user.orgId as string;

  const count = await prisma.lmsProctoringLog.count({
    where: { sessionId, eventType: eventType as ProctoringEventType },
  });

  let severity: ProctoringSeverity;
  if (eventType === 'print_attempt') severity = 'high';
  else if (count >= 10) severity = 'high';
  else if (count >= 3) severity = 'medium';
  else severity = 'low';

  const log = await prisma.lmsProctoringLog.create({
    data: {
      orgId,
      sessionId,
      studentId,
      eventType: eventType as ProctoringEventType,
      timestamp: new Date(),
      metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      severity,
    },
  });

  const flagField = getFlagField(eventType);
  if (flagField) {
    const session = await prisma.lmsExamSession.findUnique({ where: { id: sessionId }, select: { proctoringFlags: true } });
    if (session) {
      const flags = (session.proctoringFlags as unknown as ProctoringFlags) || {};
      flags[flagField] = ((flags[flagField] as number) || 0) + 1;
      flags.totalFlags = ((flags.totalFlags as number) || 0) + 1;
      flags.severityLevel = severity;
      await prisma.lmsExamSession.update({
        where: { id: sessionId },
        data: { proctoringFlags: flags as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return log;
}

export async function getSessionLog(user: AuthUser, sessionId: string) {
  const orgId = user.orgId as string;
  return prisma.lmsProctoringLog.findMany({
    where: { orgId, sessionId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function getExamIncidents(user: AuthUser, examId: string) {
  const orgId = user.orgId as string;

  const sessions = await prisma.lmsExamSession.findMany({
    where: { orgId, examId, proctoringFlags: { path: ['totalFlags'], gt: 0 } },
  });

  const incidents: unknown[] = [];
  for (const session of sessions) {
    let incident = await prisma.lmsIncidentReport.findFirst({ where: { sessionId: session.id, orgId } });
    if (!incident) {
      const logs = await prisma.lmsProctoringLog.findMany({ where: { sessionId: session.id } });
      const summary: Record<string, number> = {};
      let total = 0;
      for (const log of logs) {
        summary[log.eventType] = (summary[log.eventType] || 0) + 1;
        total++;
      }
      summary.total = total;

      incident = await prisma.lmsIncidentReport.create({
        data: {
          orgId,
          sessionId: session.id,
          examId,
          flagSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const student = await prisma.lmsUser.findUnique({
      where: { id: session.studentId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    incidents.push({
      ...incident,
      student,
      sessionStatus: session.status,
      proctoringFlags: session.proctoringFlags,
    });
  }

  return incidents;
}

export async function reviewIncident(
  user: AuthUser,
  reviewerId: string,
  sessionId: string,
  data: { disposition: string; action: string; remarks?: string },
) {
  const orgId = user.orgId as string;

  const existing = await prisma.lmsIncidentReport.findFirst({ where: { sessionId, orgId } });
  if (!existing) throw NotFound('Incident report not found');

  const incident = await prisma.lmsIncidentReport.update({
    where: { id: existing.id },
    data: {
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      disposition: data.disposition as Prisma.LmsIncidentReportUpdateInput['disposition'],
      action: data.action as Prisma.LmsIncidentReportUpdateInput['action'],
      remarks: data.remarks,
    },
  });

  if (data.action === 'session_voided') {
    await prisma.lmsExamSession.update({
      where: { id: sessionId },
      data: { status: 'voided', endedAt: new Date() },
    });
  }

  return incident;
}
