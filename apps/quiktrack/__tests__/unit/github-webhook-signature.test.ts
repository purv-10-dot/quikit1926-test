import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  verifyWebhookSignature,
  verifyWebhookSignatureFromEnv,
} from "@/lib/services/github/webhook-signature";

const SECRET = "webhook-shared-secret";
const BODY = JSON.stringify({ action: "opened", number: 42 });

function sign(body: string | Buffer, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("github webhook-signature", () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
  });

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("accepts a valid signature over a Buffer body", () => {
    const buf = Buffer.from(BODY, "utf8");
    expect(verifyWebhookSignature(buf, sign(buf, SECRET), SECRET)).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyWebhookSignature(BODY, sign(BODY, "other-secret"), SECRET)).toBe(false);
  });

  it("rejects when the body was altered after signing", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyWebhookSignature(BODY + " ", sig, SECRET)).toBe(false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const bare = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(verifyWebhookSignature(BODY, bare, SECRET)).toBe(false);
  });

  it("fails closed on missing header or secret", () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, sign(BODY, SECRET), "")).toBe(false);
    expect(verifyWebhookSignature(BODY, undefined, undefined)).toBe(false);
  });

  it("env variant reads the configured secret", () => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
    expect(verifyWebhookSignatureFromEnv(BODY, sign(BODY, SECRET))).toBe(true);
  });

  it("env variant fails closed when the secret is unset", () => {
    expect(verifyWebhookSignatureFromEnv(BODY, sign(BODY, SECRET))).toBe(false);
  });
});
