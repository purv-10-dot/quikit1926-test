import { describe, it, expect } from "vitest";
import {
  createOrgSchema,
  updateOrgSchema,
  createAppSchema,
  updateAppSchema,
  createUserSchema,
  updateUserSchema,
} from "@/lib/schemas/superAdminSchemas";

// ─── createOrgSchema ─────────────────────────────────────────────────────────

describe("createOrgSchema", () => {
  it("accepts valid org data", () => {
    const result = createOrgSchema.safeParse({
      name: "Acme Corp",
      slug: "acme-corp",
      plan: "growth",
    });
    expect(result.success).toBe(true);
  });

  it("defaults plan to startup", () => {
    const result = createOrgSchema.parse({
      name: "Test",
      slug: "test",
    });
    expect(result.plan).toBe("startup");
  });

  it("rejects empty name", () => {
    const result = createOrgSchema.safeParse({ name: "", slug: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug (uppercase)", () => {
    const result = createOrgSchema.safeParse({ name: "Test", slug: "Bad-Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = createOrgSchema.safeParse({ name: "Test", slug: "bad slug" });
    expect(result.success).toBe(false);
  });

  it("accepts valid slug with numbers and hyphens", () => {
    const result = createOrgSchema.safeParse({ name: "Test", slug: "my-org-123" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid plan", () => {
    const result = createOrgSchema.safeParse({ name: "Test", slug: "test", plan: "free" });
    expect(result.success).toBe(false);
  });

  it("accepts optional billing email", () => {
    const result = createOrgSchema.safeParse({
      name: "Test",
      slug: "test",
      billingEmail: "billing@test.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid billing email", () => {
    const result = createOrgSchema.safeParse({
      name: "Test",
      slug: "test",
      billingEmail: "not-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null billing email", () => {
    const result = createOrgSchema.safeParse({
      name: "Test",
      slug: "test",
      billingEmail: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── updateOrgSchema ─────────────────────────────────────────────────────────

describe("updateOrgSchema", () => {
  it("accepts partial updates", () => {
    const result = updateOrgSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no updates)", () => {
    const result = updateOrgSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts status change", () => {
    const result = updateOrgSchema.safeParse({ status: "suspended" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateOrgSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });
});

// ─── createAppSchema ─────────────────────────────────────────────────────────

describe("createAppSchema", () => {
  it("accepts valid app data", () => {
    const result = createAppSchema.safeParse({
      name: "QuikScale",
      slug: "quikscale",
      baseUrl: "https://quikscale.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing baseUrl", () => {
    const result = createAppSchema.safeParse({
      name: "Test",
      slug: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid baseUrl", () => {
    const result = createAppSchema.safeParse({
      name: "Test",
      slug: "test",
      baseUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to active", () => {
    const result = createAppSchema.parse({
      name: "Test",
      slug: "test",
      baseUrl: "https://test.com",
    });
    expect(result.status).toBe("active");
  });

  it("accepts coming_soon status", () => {
    const result = createAppSchema.safeParse({
      name: "Test",
      slug: "test",
      baseUrl: "https://test.com",
      status: "coming_soon",
    });
    expect(result.success).toBe(true);
  });
});

// ─── updateAppSchema ─────────────────────────────────────────────────────────

describe("updateAppSchema", () => {
  it("accepts partial updates", () => {
    const result = updateAppSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid url", () => {
    const result = updateAppSchema.safeParse({ baseUrl: "bad" });
    expect(result.success).toBe(false);
  });
});

// ─── createUserSchema ────────────────────────────────────────────────────────

describe("createUserSchema", () => {
  it("accepts valid user data", () => {
    const result = createUserSchema.safeParse({
      email: "user@test.com",
      firstName: "John",
      lastName: "Doe",
      password: "securepass123",
    });
    expect(result.success).toBe(true);
  });

  it("defaults isSuperAdmin to false", () => {
    const result = createUserSchema.parse({
      email: "user@test.com",
      firstName: "John",
      lastName: "Doe",
      password: "securepass123",
    });
    expect(result.isSuperAdmin).toBe(false);
  });

  it("rejects short password", () => {
    const result = createUserSchema.safeParse({
      email: "user@test.com",
      firstName: "John",
      lastName: "Doe",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createUserSchema.safeParse({
      email: "not-email",
      firstName: "John",
      lastName: "Doe",
      password: "securepass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty first name", () => {
    const result = createUserSchema.safeParse({
      email: "user@test.com",
      firstName: "",
      lastName: "Doe",
      password: "securepass123",
    });
    expect(result.success).toBe(false);
  });
});

// ─── updateUserSchema ────────────────────────────────────────────────────────

describe("updateUserSchema", () => {
  it("accepts partial updates", () => {
    const result = updateUserSchema.safeParse({ firstName: "Jane" });
    expect(result.success).toBe(true);
  });

  it("accepts isSuperAdmin toggle", () => {
    const result = updateUserSchema.safeParse({ isSuperAdmin: true });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
