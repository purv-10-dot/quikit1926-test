import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Liveness/readiness probe. Confirms the Next.js runtime and DB are reachable.
 * GET /api/health
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // `service` identifies this app in aggregated health dashboards — the
    // original returned it (`app.controller.ts:13-20`) and the port dropped it.
    return NextResponse.json({
      status: 'ok',
      service: 'QuikSkill LMS Backend',
      db: 'up',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'degraded', service: 'QuikSkill LMS Backend', db: 'down', error: (err as Error).message },
      { status: 503 },
    );
  }
}
