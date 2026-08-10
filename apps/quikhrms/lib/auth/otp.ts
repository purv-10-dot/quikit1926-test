import crypto from "crypto";

/**
 * 4-digit OTPs: only the SHA-256 hash is stored (mirrors invite-token.ts),
 * so a DB leak never exposes a usable code.
 */
export function generateOtp(): { raw: string; hash: string } {
  const raw = crypto.randomInt(0, 10000).toString().padStart(4, "0");
  return { raw, hash: hashOtp(raw) };
}

export function hashOtp(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const OTP_TTL_MINUTES = 10;

export function otpExpiry(minutes = OTP_TTL_MINUTES): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
