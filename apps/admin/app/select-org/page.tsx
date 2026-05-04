import { redirect } from "next/navigation";

/**
 * /select-org is retired — org auto-selection happens in the NextAuth jwt
 * callback. Multi-org users switch via the launcher's org dropdown.
 */
export default function SelectOrgPage() {
  const launcher =
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    "http://localhost:3001"; // prod-safety-allow: dev fallback
  redirect(`${launcher}/apps`);
}
