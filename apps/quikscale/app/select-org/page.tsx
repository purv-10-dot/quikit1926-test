import { redirect } from "next/navigation";

/**
 * QuikScale select-org — redirects to QuikIT gateway.
 *
 * Org selection now lives in apps/quikit. When QUIKIT_URL is set,
 * redirect there. When unset, redirect to dashboard (backward compat).
 */
export default function SelectOrgPage() {
  const quikitUrl = process.env.QUIKIT_URL;
  if (quikitUrl) {
    redirect(`${quikitUrl}/select-org`);
  }
  redirect("/dashboard");
}
