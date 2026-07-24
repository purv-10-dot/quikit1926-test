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
  orgId: string,
  dto: { academicYear: string; terms?: TermInput[]; holidays?: HolidayInput[] },
  createdBy: string,
) {
  const existing = await prisma.lmsAcademicCalendar.findFirst({
    where: { orgId, academicYear: dto.academicYear },
  });
  if (existing) throw Conflict(`Academic calendar for ${dto.academicYear} already exists`);

  return prisma.lmsAcademicCalendar.create({
    data: {
      orgId,
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

export async function getCalendarForYear(orgId: string, academicYear: string) {
  const calendar = await prisma.lmsAcademicCalendar.findFirst({
    where: { orgId, academicYear },
    include: WITH_CHILDREN,
  });
  if (!calendar) throw NotFound(`No calendar found for ${academicYear}`);
  return calendar;
}

export async function getAllCalendars(orgId: string) {
  return prisma.lmsAcademicCalendar.findMany({
    where: { orgId },
    orderBy: { academicYear: 'desc' },
    include: WITH_CHILDREN,
  });
}

export async function getCurrentTerm(orgId: string) {
  const now = new Date();
  const calendars = await prisma.lmsAcademicCalendar.findMany({
    where: { orgId },
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

export async function updateTerms(orgId: string, calendarId: string, terms: TermInput[]) {
  const calendar = await prisma.lmsAcademicCalendar.findFirst({ where: { id: calendarId, orgId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.$transaction([
    prisma.lmsAcademicTerm.deleteMany({ where: { calendarId } }),
    prisma.lmsAcademicTerm.createMany({
      data: terms.map((t) => ({
        calendarId,
        name: t.name,
        startDate: new Date(t.startDate),
        endDate: new Date(t.endDate),
        isActive: t.isActive ?? false,
      })),
    }),
  ]);
  return prisma.lmsAcademicCalendar.findUnique({ where: { id: calendarId }, include: WITH_CHILDREN });
}

export async function updateHolidays(orgId: string, calendarId: string, holidays: HolidayInput[]) {
  const calendar = await prisma.lmsAcademicCalendar.findFirst({ where: { id: calendarId, orgId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.$transaction([
    prisma.lmsAcademicHoliday.deleteMany({ where: { calendarId } }),
    prisma.lmsAcademicHoliday.createMany({
      data: holidays.map((h) => ({
        calendarId,
        date: new Date(h.date),
        name: h.name,
        type: h.type || 'custom',
      })),
    }),
  ]);
  return prisma.lmsAcademicCalendar.findUnique({ where: { id: calendarId }, include: WITH_CHILDREN });
}

export async function deleteCalendar(orgId: string, calendarId: string) {
  const calendar = await prisma.lmsAcademicCalendar.findFirst({ where: { id: calendarId, orgId } });
  if (!calendar) throw NotFound('Academic calendar not found');
  await prisma.lmsAcademicCalendar.delete({ where: { id: calendarId } });
  return { success: true };
}
