/**
 * Unit-test Prisma mock helper.
 *
 * Import this file (or a symbol from it) in any unit test that needs a mocked
 * Prisma client. The vi.mock calls here are hoisted by Vitest to the top of
 * the importing test file, registering the mocks before any module under test
 * is resolved.
 *
 * Both @/lib/db/prisma and @/lib/db are wired to the same mock instance so
 * tests have a single control surface regardless of which import path the
 * module under test uses.
 *
 * Usage:
 *   import { prismaMock, dbMock } from "../../helpers/prisma-unit-mock";
 *   prismaMock.crmLead.count.mockResolvedValue(5);
 */
import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";

export const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
// dbMock is an alias for the same object: lead-assignment.ts uses both
// `prisma` (@/lib/db/prisma) and `db` (@/lib/db) — single control surface.
export const dbMock = prismaMock;

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/db", () => ({ db: prismaMock }));

export function resetPrismaUnitMocks(): void {
  mockReset(prismaMock);
}
