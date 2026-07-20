import { NextResponse } from 'next/server';

/**
 * GET /api — the base endpoint.
 *
 * The NestJS original served `'QuikSkill LMS API is running!'` at the root
 * (`app.controller.ts:8-11`, and `main.ts` sets no global prefix). It was never
 * ported, so anything polling the API root as a liveness signal — uptime
 * monitors, a load balancer's default health path — got a 404.
 *
 * Deliberately dependency-free: it answers "is the runtime up", nothing more.
 * `/api/health` is the one that probes the database.
 */
export async function GET() {
  return NextResponse.json({ message: 'QuikSkill LMS API is running!' });
}
