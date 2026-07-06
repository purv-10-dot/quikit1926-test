import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Liveness/readiness probe. Confirms the Next.js runtime and DB are reachable.
 * GET /api/health
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { status: 'degraded', db: 'down', error: (err as Error).message },
      { status: 503 },
    );
  }
}
