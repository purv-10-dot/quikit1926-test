import crypto from "node:crypto";
import { getPublicEnv, getServerEnv } from "@/lib/env";

type PaymentLinkRequest = {
  amount: number;
  currency: string;
  referenceId: string;
  description: string;
  customer: {
    name: string;
    email?: string | null;
    contact?: string | null;
  };
  acceptPartial: boolean;
  firstMinPartialAmount?: number;
  expireBy: number;
  callbackUrl?: string | null;
};

export function isRazorpayConfigured() {
  const { razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret } = getServerEnv();
  return Boolean(razorpayKeyId && razorpayKeySecret && razorpayWebhookSecret);
}

export function getRazorpayWebhookUrl() {
  const { appUrl } = getPublicEnv();
  return `${appUrl.replace(/\/$/, "")}/api/v1/razorpay/webhook`;
}

function base64Credentials() {
  const { razorpayKeyId, razorpayKeySecret } = getServerEnv();
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
}

function readRazorpayError(payload: Record<string, unknown>) {
  const error = typeof payload.error === "object" && payload.error !== null ? (payload.error as Record<string, unknown>) : null;
  return String(error?.description ?? payload.error ?? "Razorpay request failed.");
}

export async function createRazorpayPaymentLink(input: PaymentLinkRequest) {
  const body = {
    amount: Math.round(input.amount * 100),
    currency: input.currency,
    accept_partial: input.acceptPartial,
    first_min_partial_amount: input.acceptPartial && input.firstMinPartialAmount ? Math.round(input.firstMinPartialAmount * 100) : undefined,
    expire_by: input.expireBy,
    reference_id: input.referenceId,
    description: input.description,
    customer: {
      name: input.customer.name,
      email: input.customer.email ?? undefined,
      contact: input.customer.contact ?? undefined
    },
    notify: {
      email: Boolean(input.customer.email),
      sms: false
    },
    reminder_enable: true,
    callback_url: input.callbackUrl ?? undefined,
    callback_method: input.callbackUrl ? "get" : undefined
  };

  const response = await fetch("https://api.razorpay.com/v1/payment_links/", {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Credentials()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readRazorpayError(payload));
  }

  return payload;
}

export async function cancelRazorpayPaymentLink(providerLinkId: string) {
  const response = await fetch(`https://api.razorpay.com/v1/payment_links/${providerLinkId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Credentials()}`,
      "Content-Type": "application/json"
    }
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readRazorpayError(payload));
  }

  return payload;
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null) {
  const { razorpayWebhookSecret } = getServerEnv();
  if (!razorpayWebhookSecret) {
    throw new Error("Razorpay webhook secret is not configured.");
  }

  if (!signature) {
    return false;
  }

  const digest = crypto.createHmac("sha256", razorpayWebhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
