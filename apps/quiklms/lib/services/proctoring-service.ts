/**
 * Proctoring service — ported from ProctoringService (Mongo → Prisma).
 * Writes ProctoringLog rows, aggregates proctoringFlags Json on the ExamSession,
 * and lazily generates IncidentReport rows. tenantId enforced via tenantWhere().
 */
import type { Prisma, ProctoringEventType, ProctoringSeverity } from '@prisma/client';
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
  const tenantId = user.tenantId as string;

  const count = await prisma.proctoringLog.count({
    where: { sessionId, eventType: eventType as ProctoringEventType },
  });

  let severity: ProctoringSeverity;
  if (eventType === 'print_attempt') severity = 'high';
  else if (count >= 10) severity = 'high';
  else if (count >= 3) severity = 'medium';
  else severity = 'low';

  const log = await prisma.proctoringLog.create({
    data: {
      tenantId,
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
    const session = await prisma.examSession.findUnique({ where: { id: sessionId }, select: { proctoringFlags: true } });
    if (session) {
      const flags = (session.proctoringFlags as unknown as ProctoringFlags) || {};
      flags[flagField] = ((flags[flagField] as number) || 0) + 1;
      flags.totalFlags = ((flags.totalFlags as number) || 0) + 1;
      flags.severityLevel = severity;
      await prisma.examSession.update({
        where: { id: sessionId },
        data: { proctoringFlags: flags as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return log;
}

export async function getSessionLog(user: AuthUser, sessionId: string) {
  const tenantId = user.tenantId as string;
  return prisma.proctoringLog.findMany({
    where: { tenantId, sessionId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function getExamIncidents(user: AuthUser, examId: string) {
  const tenantId = user.tenantId as string;

  const sessions = await prisma.examSession.findMany({
    where: { tenantId, examId, proctoringFlags: { path: ['totalFlags'], gt: 0 } },
  });

  const incidents: unknown[] = [];
  for (const session of sessions) {
    let incident = await prisma.incidentReport.findFirst({ where: { sessionId: session.id, tenantId } });
    if (!incident) {
      const logs = await prisma.proctoringLog.findMany({ where: { sessionId: session.id } });
      const summary: Record<string, number> = {};
      let total = 0;
      for (const log of logs) {
        summary[log.eventType] = (summary[log.eventType] || 0) + 1;
        total++;
      }
      summary.total = total;

      incident = await prisma.incidentReport.create({
        data: {
          tenantId,
          sessionId: session.id,
          examId,
          flagSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const student = await prisma.user.findUnique({
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
  const tenantId = user.tenantId as string;

  const existing = await prisma.incidentReport.findFirst({ where: { sessionId, tenantId } });
  if (!existing) throw NotFound('Incident report not found');

  const incident = await prisma.incidentReport.update({
    where: { id: existing.id },
    data: {
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      disposition: data.disposition as Prisma.IncidentReportUpdateInput['disposition'],
      action: data.action as Prisma.IncidentReportUpdateInput['action'],
      remarks: data.remarks,
    },
  });

  if (data.action === 'session_voided') {
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { status: 'voided', endedAt: new Date() },
    });
  }

  return incident;
}
