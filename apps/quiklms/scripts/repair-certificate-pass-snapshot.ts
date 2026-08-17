/**
 * Repair issued certificates that can never be downloaded.
 *
 * THE DEFECT (fixed in code 2026-08-13). `generateCertificateForCompletion`
 * built its pass-criteria snapshot from `progress.scorePercentage`, which is
 * lesson-COMPLETION percent (`progress-service.ts:409`), not a grade. It is set
 * for every learner who finishes a course — including courses with no quiz at
 * all. That put a real number in `score`, while `isPassed` sat at its schema
 * default of `false` (`Boolean @default(false)`; only the grader ever writes
 * it), so the row was stamped `passed: false`.
 *
 * `downloadGateBlocked` then refused the download with "You need to meet the
 * passing criteria to download the certificate." — on a certificate the
 * issuance guard had just decided to award. The snapshot is frozen at issue
 * time and no retake or re-completion rewrites it, so the block was permanent.
 *
 * The code fix (snapshot reads `quizScore` only; the gate ignores rows with no
 * `score`) stops it happening again. It does NOT heal rows already stamped —
 * this script does that.
 *
 * WHAT IT TOUCHES. Only certificates the gate currently blocks. For each, the
 * learner's quiz attempts are the source of truth:
 *
 *   • NO attempt for that learner+course → the block is an artifact. `score`,
 *     `passingScore` and `passed` are cleared to NULL, which is what the fixed
 *     code writes for a course with no graded assessment.
 *   • An attempt EXISTS → the snapshot is rebuilt from the latest one:
 *     `score` = `percentage`, `passed` = `passed`, `passingScore` from the
 *     assessment. A learner who genuinely failed STAYS blocked — that is the
 *     gate working, and the script reports those rows rather than clearing them.
 *
 * It never issues, deletes, or re-renders a certificate, and never touches a
 * row the gate already allows.
 *
 * USAGE — dry run first; it prints exactly what it would do and changes nothing:
 *   npx tsx scripts/repair-certificate-pass-snapshot.ts
 *   npx tsx scripts/repair-certificate-pass-snapshot.ts --apply
 *
 * It defaults to `.env.local`, i.e. whatever database this checkout normally
 * talks to. The damaged rows usually live somewhere else — the environment the
 * learner actually downloaded from — so point it explicitly:
 *   npx tsx scripts/repair-certificate-pass-snapshot.ts --database-url="postgresql://…"
 *
 * The banner prints host + database before doing anything. Read it and confirm
 * you are on the environment you meant, especially before `--apply`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Same loader as `backfill-user-app-roles.ts` — tsx does not read .env.local on
// its own and the sibling `repair-orphaned-course-distribution.ts` imports a
// `../lib/prisma` module that does not exist, so it is not a model to copy.
function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// An explicit --database-url wins: it is set before the .env.local loader runs,
// and the loader only fills in keys that are still undefined. Same for a
// DATABASE_URL already exported in the shell.
const urlArg = process.argv.find((a) => a.startsWith('--database-url='));
if (urlArg) {
  const url = urlArg.slice('--database-url='.length).replace(/^(['"])([\s\S]*)\1$/, '$2');
  process.env.DATABASE_URL = url;
  // Prisma's `directUrl` is required by the schema; without an override it
  // would still point at .env.local's database and migrations/queries could
  // straddle two environments.
  process.env.DATABASE_URL_DIRECT = url;
}

loadEnvFile(resolve(appRoot, '.env.local'));

const APPLY = process.argv.includes('--apply');

/** Host + database only — never print credentials. */
function describeTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(no DATABASE_URL set)';
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

type Repair =
  | { kind: 'clear'; certificateId: string; courseName: string | null; score: number | null; passingScore: number | null }
  | { kind: 'rebuild'; certificateId: string; courseName: string | null; score: number; passingScore: number | null; passed: boolean };

async function main() {
  const { db } = await import('@/lib/db');

  console.log(`Target database: ${describeTarget()}`);
  console.log(`Mode: ${APPLY ? 'APPLY — rows will be written' : 'dry run — nothing will be written'}\n`);

  const totalCerts = await db.lmsCertificateIssued.count();
  console.log(`${totalCerts} issued certificate(s) in this database.`);
  if (totalCerts === 0) {
    console.log('None at all — this is almost certainly not the environment the learner downloaded from.');
    return;
  }

  // Everything `downloadGateBlocked` refuses. The `score` filter mirrors the
  // gate's own guard — a row with no score is not blocked and not our business.
  const blocked = await db.lmsCertificateIssued.findMany({
    where: {
      score: { not: null },
      OR: [{ passed: false }, { passingScore: { not: null } }],
    },
    select: {
      id: true, certificateId: true, courseName: true, orgId: true,
      learnerId: true, courseId: true, score: true, passingScore: true, passed: true, issuedAt: true,
    },
    orderBy: { issuedAt: 'asc' },
  });

  const gateBlocks = blocked.filter(
    (c) =>
      c.passed === false ||
      (typeof c.score === 'number' && typeof c.passingScore === 'number' && c.score < c.passingScore),
  );

  if (gateBlocks.length === 0) {
    console.log('Nothing to repair — no issued certificate is blocked by the download gate.');
    return;
  }

  const repairs: Repair[] = [];
  const genuineFailures: Array<{ certificateId: string; courseName: string | null; percentage: number; passingScore: number | null }> = [];

  for (const cert of gateBlocks) {
    const latestAttempt = await db.lmsQuizAttempt.findFirst({
      where: { orgId: cert.orgId, learnerId: cert.learnerId, courseId: cert.courseId },
      orderBy: { submittedAt: 'desc' },
      select: { assessmentId: true, percentage: true, passed: true },
    });

    if (!latestAttempt) {
      repairs.push({
        kind: 'clear', certificateId: cert.certificateId, courseName: cert.courseName,
        score: cert.score, passingScore: cert.passingScore,
      });
      continue;
    }

    const assessment = await db.lmsAssessment.findUnique({
      where: { id: latestAttempt.assessmentId },
      select: { passingScore: true },
    });
    const passingScore = typeof assessment?.passingScore === 'number' ? assessment.passingScore : null;

    if (latestAttempt.passed === false) {
      genuineFailures.push({
        certificateId: cert.certificateId, courseName: cert.courseName,
        percentage: latestAttempt.percentage, passingScore,
      });
      continue;
    }

    repairs.push({
      kind: 'rebuild', certificateId: cert.certificateId, courseName: cert.courseName,
      score: latestAttempt.percentage, passingScore, passed: latestAttempt.passed,
    });
  }

  console.log(`${gateBlocks.length} issued certificate(s) are currently blocked by the download gate.\n`);

  const cleared = repairs.filter((r): r is Extract<Repair, { kind: 'clear' }> => r.kind === 'clear');
  const rebuilt = repairs.filter((r): r is Extract<Repair, { kind: 'rebuild' }> => r.kind === 'rebuild');

  if (cleared.length) {
    console.log(`  ${cleared.length} blocked with NO quiz attempt behind them — artifact of the completion-percent bug:`);
    for (const r of cleared) {
      console.log(`    ${r.certificateId}  ${JSON.stringify(r.courseName)}  score=${r.score} passingScore=${r.passingScore} → all NULL`);
    }
    console.log('');
  }

  if (rebuilt.length) {
    console.log(`  ${rebuilt.length} have a PASSING attempt — snapshot rebuilt from the real grade:`);
    for (const r of rebuilt) {
      console.log(`    ${r.certificateId}  ${JSON.stringify(r.courseName)}  → score=${r.score} passingScore=${r.passingScore} passed=${r.passed}`);
    }
    console.log('');
  }

  if (genuineFailures.length) {
    console.log(`  ${genuineFailures.length} have a FAILING attempt — left blocked on purpose, review these by hand:`);
    for (const f of genuineFailures) {
      console.log(`    ${f.certificateId}  ${JSON.stringify(f.courseName)}  percentage=${f.percentage} passingScore=${f.passingScore}`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log(`Dry run — nothing written. Re-run with --apply to repair ${repairs.length} row(s).`);
    return;
  }

  let written = 0;
  for (const r of repairs) {
    await db.lmsCertificateIssued.update({
      where: { certificateId: r.certificateId },
      data:
        r.kind === 'clear'
          ? { score: null, passingScore: null, passed: null }
          : { score: r.score, passingScore: r.passingScore, passed: r.passed },
    });
    written++;
  }

  console.log(`Repaired ${written} certificate(s). They are downloadable now.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { db } = await import('@/lib/db');
    await db.$disconnect();
  });
