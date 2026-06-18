import { describe, it, expect } from "vitest";
import { ok, created, noContent, err } from "@/lib/http/envelope";

describe("ok", () => {
  it("returns 200 with { ok:true, data }", async () => {
    const res = ok({ id: "1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ id: "1" });
  });

  it("honours a custom status", async () => {
    expect(ok({}, { status: 202 }).status).toBe(202);
  });
});

describe("created", () => {
  it("returns 201 with the success envelope", async () => {
    const res = created({ id: "x" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("x");
  });
});

describe("noContent", () => {
  it("returns 204 with no body", () => {
    const res = noContent();
    expect(res.status).toBe(204);
  });
});

describe("err", () => {
  it("returns the given status with { ok:false, error, code }", async () => {
    const res = err("EXCEEDS_TENDER", "Too much", 422, { max: 10 });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Too much");
    expect(body.code).toBe("EXCEEDS_TENDER");
    expect(body.details).toEqual({ max: 10 });
  });

  it("preserves top-level error + code for backwards-compat clients", async () => {
    const body = await err("FORBIDDEN", "nope", 403).json();
    expect(body).toMatchObject({ ok: false, error: "nope", code: "FORBIDDEN" });
  });
});
