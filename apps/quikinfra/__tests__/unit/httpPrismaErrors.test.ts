import { describe, it, expect } from "vitest";
import { mapPrismaError } from "@/lib/http/prisma-errors";

// `@/lib/http/errors` is mocked in setup.ts with a faithful DomainError, so
// instanceof / shape checks (.code, .httpStatus, .details) work here.

function asDomain(e: unknown) {
  return e as { code: string; httpStatus: number; message: string; details?: any };
}

describe("mapPrismaError — P2002 (unique)", () => {
  it("maps to 409 DUPLICATE", () => {
    const out = asDomain(mapPrismaError({ code: "P2002", meta: { target: ["email"] } }, "vendor"));
    expect(out.code).toBe("DUPLICATE");
    expect(out.httpStatus).toBe(409);
    expect(out.message).toContain("vendor");
    expect(out.message).toContain("email");
    expect(out.details).toEqual({ target: ["email"] });
  });

  it("joins multiple target columns", () => {
    const out = asDomain(mapPrismaError({ code: "P2002", meta: { target: ["a", "b"] } }, "item"));
    expect(out.message).toContain("a, b");
  });

  it("handles a string target", () => {
    const out = asDomain(mapPrismaError({ code: "P2002", meta: { target: "code" } }, "uom"));
    expect(out.code).toBe("DUPLICATE");
    expect(out.message).toContain("code");
  });

  it("uses 'this value' fallback when target is missing", () => {
    const out = asDomain(mapPrismaError({ code: "P2002", meta: {} }, "thing"));
    expect(out.message).toContain("this value");
    expect(out.details).toEqual({ target: null });
  });
});

describe("mapPrismaError — P2003 (FK)", () => {
  it("maps to 400 INVALID_REFERENCE", () => {
    const out = asDomain(mapPrismaError({ code: "P2003", meta: { target: ["projectId"] } }, "po"));
    expect(out.code).toBe("INVALID_REFERENCE");
    expect(out.httpStatus).toBe(400);
    expect(out.message).toContain("po");
    expect(out.details).toEqual({ target: ["projectId"] });
  });
});

describe("mapPrismaError — P2025 (not found)", () => {
  it("maps to 404 NOT_FOUND", () => {
    const out = asDomain(mapPrismaError({ code: "P2025" }, "vendor"));
    expect(out.code).toBe("NOT_FOUND");
    expect(out.httpStatus).toBe(404);
    expect(out.message).toContain("vendor");
  });

  it("defaults the entity label to 'record'", () => {
    const out = asDomain(mapPrismaError({ code: "P2025" }));
    expect(out.message).toContain("record");
  });
});

describe("mapPrismaError — passthrough", () => {
  it("returns an unknown Prisma code unchanged", () => {
    const e = { code: "P9999", message: "weird" };
    expect(mapPrismaError(e, "x")).toBe(e);
  });

  it("returns a non-Prisma Error unchanged", () => {
    const e = new Error("boom");
    expect(mapPrismaError(e)).toBe(e);
  });

  it("returns a plain object without a P-code unchanged", () => {
    const e = { code: "SOME_OTHER", message: "nope" };
    expect(mapPrismaError(e)).toBe(e);
  });

  it("returns null/undefined/string unchanged", () => {
    expect(mapPrismaError(null)).toBeNull();
    expect(mapPrismaError(undefined)).toBeUndefined();
    expect(mapPrismaError("string-error")).toBe("string-error");
  });
});
