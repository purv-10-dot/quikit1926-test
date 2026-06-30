import { assertProductionSecurity } from "@/lib/security/pci";

export function getPublicEnv() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  };
}

let securityChecked = false;

export function getServerEnv() {
  // Fail fast in a running production server when security-critical secrets are
  // missing or weak. Skipped during `next build` (secrets injected at runtime).
  if (!securityChecked && process.env.NEXT_PHASE !== "phase-production-build") {
    securityChecked = true;
    assertProductionSecurity();
  }
  return {
    ...getPublicEnv(),
    databaseUrl: process.env.DATABASE_URL ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    openaiSupportModel: process.env.OPENAI_SUPPORT_MODEL ?? "gpt-5-mini",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? ""
  };
}
