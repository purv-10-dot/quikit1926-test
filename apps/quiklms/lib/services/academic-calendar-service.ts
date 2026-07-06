/**
 * Academic calendar service — ported from AcademicCalendarService (Prisma).
 * Mongo subdocs (terms[], holidays[]) became child tables AcademicTerm /
 * AcademicHoliday. We include them on read so the response shape matches the
 * legacy embedded document. updateTerms/updateHolidays replace the child rows.
 */
import { prisma } from '@/lib/prisma';
import { Conflict, NotFound } from '@/lib/http';

export interface TermInput {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}
export interface HolidayInput {
  date: string;
  name: string;
  type?: string;
}

const WITH_CHILDREN = {
  terms: { orderBy: { startDate: 'asc' } },
  holidays: { orderBy: { date: 'asc' } },
} as const;

export async function createCalendar(
  tenantId: string,
  dto: { academicYear: string; terms?: TermInput[]; holidays?: HolidayInput[] },
  createdBy: string,
) {
  const existing = await prisma.academicCalendar.findFirst({
    where: { tenantId, academicYear: dto.academicYear },
  });
  if (existing) throw Conflict(`Academic calendar for ${dto.academicYear} already exists`);

  return prisma.academicCalendar.create({
    data: {
      tenantId,
      academicYear: dto.academicYear,
      createdBy,
      terms: {
        create: (dto.terms || []).map((t) => ({
          name: t.name,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          isActive: t.isActive ?? false,
        })),
      },
      holidays: {
        create: (dto.holidays || []).map((h) => ({
          date: new Date(h.date),
          name: h.name,
          type: h.type || 'custom',
        })),
      },
    },
    include: WITH_CHILDREN,
  });
}

export async function getCalendarForYear(tenantId: string, academicYear: string) {
  const calendar = await prisma.academicCalendar.findFirst({
    where: { tenantId, academicYear },
    include: WITH_CHILDREN,
  });
  if (!calendar) throw NotFound(`No calendar found for ${academicYear}`);
  return calendar;
}

export async function getAllCalendars(tenantId: string) {
  return prisma.academicCalendar.findMany({
    where: { tenantId },
    orderBy: { academicYear: 'desc' },
    include: WITH_CHILDREN,
  });
}

export async function getCurrentTerm(tenantId: string) {
  const now = new Date();
  const calendars = await prisma.academicCalendar.findMany({
    where: { tenantId },
    include: WITH_CHILDREN,
  });
  for (const calendar of calendars) {
    for (const term of calendar.terms) {
      if (now >= term.startDate && now <= term.endDate) {
        return { academicYear: calendar.academicYear, term, calendarId: calendar.id };
      }
    }
  }
  return null;
}

export async function updateTerms(tenantId: string, calendarId: string, terms: TermInput[]) {
  const calendar = await prisma.academicCalendar.findFirst({ where: { id: calendarId, tenantId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.$transaction([
    prisma.academicTerm.deleteMany({ where: { calendarId } }),
    prisma.academicTerm.createMany({
      data: terms.map((t) => ({
        calendarId,
        name: t.name,
        startDate: new Date(t.startDate),
        endDate: new Date(t.endDate),
        isActive: t.isActive ?? false,
      })),
    }),
  ]);
  return prisma.academicCalendar.findUnique({ where: { id: calendarId }, include: WITH_CHILDREN });
}

export async function updateHolidays(tenantId: string, calendarId: string, holidays: HolidayInput[]) {
  const calendar = await prisma.academicCalendar.findFirst({ where: { id: calendarId, tenantId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.$transaction([
    prisma.academicHoliday.deleteMany({ where: { calendarId } }),
    prisma.academicHoliday.createMany({
      data: holidays.map((h) => ({
        calendarId,
        date: new Date(h.date),
        name: h.name,
        type: h.type || 'custom',
      })),
    }),
  ]);
  return prisma.academicCalendar.findUnique({ where: { id: calendarId }, include: WITH_CHILDREN });
}

export async function deleteCalendar(tenantId: string, calendarId: string) {
  const calendar = await prisma.academicCalendar.findFirst({ where: { id: calendarId, tenantId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.academicCalendar.delete({ where: { id: calendarId } });
  return { success: true };
}
