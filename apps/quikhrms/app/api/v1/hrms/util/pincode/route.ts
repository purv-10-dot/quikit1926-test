import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";

// Looks up an Indian 6-digit PIN via India Post's free public API and returns
// city / state / country to auto-fill address forms. No key required.
export const GET = withAuth(async (req: NextRequest) => {
  try {
    const pin = new URL(req.url).searchParams.get("pin")?.trim() ?? "";
    if (!/^\d{6}$/.test(pin)) return validationError("Enter a valid 6-digit PIN code.");

    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      headers: { Accept: "application/json" },
      // Don't let a slow upstream hang the request forever.
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    if (!res || !res.ok) return internalError("PIN lookup service unavailable.");
    const json = (await res.json().catch(() => null)) as
      | Array<{ Status: string; PostOffice?: Array<{ District: string; State: string; Country: string; Name: string }> }>
      | null;

    const entry = Array.isArray(json) ? json[0] : null;
    const po = entry?.PostOffice?.[0];
    if (!entry || entry.Status !== "Success" || !po) return notFound("No location found for this PIN code.");

    return successResponse({
      city: po.District,
      state: po.State,
      country: po.Country || "India",
    });
  } catch (error) {
    console.error("GET /util/pincode error:", error);
    return internalError();
  }
});
