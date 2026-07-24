/**
 * Lightweight scheduler (no external cron dep). A 60s tick runs the
 * every-minute jobs and fires the daily jobs once when local HH:MM matches.
 * The exam auto-submit sweep runs on its own faster 15s tick so expired
 * sessions are finalized promptly (this is the near-real-time path that the
 * removed BullMQ delayed-job queue would otherwise have provided).
 *   every 15s   → exam auto-submit sweep
 *   every minute → class reminders, escalation, student reminders, absence calls
 *   00:00 on the 1st → teacher-level monthly recalculation
 *   07:00 → teacher lateness scan
 *   09:00 → deadline reminders
 *   09:30 → overdue reminders + course-assignment day-10/20 reminders
 *   hourly → TTL cleanup (otps, analytics-cache)
 */
import { runClassReminders } from './jobs/reminders.js';
import { runEscalations } from './jobs/escalation.js';
import { runStudentReminders } from './jobs/student-reminder.js';
import { runStudentAbsenceCalls } from './jobs/student-absence.js';
import { sweepExpiredSessions } from './jobs/exam-auto-submit.js';
import { runCourseAssignmentReminders } from './jobs/course-assignment-reminders.js';
import { runMonthlyTeacherLevelRecalc } from './jobs/teacher-level.js';
import { runDeadlineReminders, runOverdueReminders, runTeacherLatenessScan, runTtlCleanup } from './jobs/daily.js';

let lastDaily = ''; // 'YYYY-MM-DD-HH:MM' guard so a daily job fires once
let lastMonthly = ''; // 'YYYY-MM-HH:MM' guard so a monthly job fires once
let lastHour = -1;

async function safe(label: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { console.error(`[cron] ${label} failed:`, (e as Error).message); }
}

async function tick() {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const hm = `${hh}:${mm}`;
  const dayKey = now.toISOString().slice(0, 10);

  // Every minute
  await safe('classReminders', runClassReminders);
  await safe('escalations', runEscalations);
  await safe('studentReminders', runStudentReminders);
  await safe('studentAbsenceCalls', runStudentAbsenceCalls);

  // Daily (once per matching minute)
  const fireDaily = async (target: string, jobs: (() => Promise<unknown>)[], label: string) => {
    const stamp = `${dayKey}-${target}`;
    if (hm === target && lastDaily !== stamp) {
      lastDaily = stamp;
      for (const j of jobs) await safe(label, j);
    }
  };
  await fireDaily('7:0', [runTeacherLatenessScan], 'teacherLateness');
  await fireDaily('9:0', [runDeadlineReminders], 'deadlineReminders');
  await fireDaily('9:30', [runOverdueReminders, runCourseAssignmentReminders], 'overdueReminders');

  // Monthly (1st of the month, once per matching minute) — same guard shape as
  // fireDaily, with the day-of-month check added.
  const fireMonthly = async (target: string, jobs: (() => Promise<unknown>)[], label: string) => {
    // Local month key — the trigger is local 00:00, and a UTC key would straddle
    // the boundary for any non-zero offset.
    const stamp = `${now.getFullYear()}-${now.getMonth()}-${target}`;
    if (now.getDate() === 1 && hm === target && lastMonthly !== stamp) {
      lastMonthly = stamp;
      for (const j of jobs) await safe(label, j);
    }
  };
  await fireMonthly('0:0', [runMonthlyTeacherLevelRecalc], 'teacherLevelRecalc');

  // Hourly TTL cleanup
  if (hh !== lastHour) { lastHour = hh; await safe('ttlCleanup', runTtlCleanup); }
}

export function startCron(): void {
  void tick();
  setInterval(() => void tick(), 60_000);

  // Faster, dedicated sweep for exam auto-submit (near-real-time finalization).
  void safe('examSweep', sweepExpiredSessions);
  setInterval(() => void safe('examSweep', sweepExpiredSessions), 15_000);

  console.log('[worker] cron scheduler started (60s tick, 15s exam sweep)');
}
