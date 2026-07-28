// Shared Prisma client for the worker (same generated client as the Next app).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({ log: ['error'] });
