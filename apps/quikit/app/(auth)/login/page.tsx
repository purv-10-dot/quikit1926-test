import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginPageClient } from "./LoginPageClient";

/**
 * With central auth (`NEXT_PUBLIC_AUTH_URL`), credentials login runs only on that host (e.g. :3004).
 * This route stays as a fallback redirect + legacy entrypoint for `?reason=` query forwarding.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const auth = process.env.NEXT_PUBLIC_AUTH_URL?.replace(/\/$/, "");
  if (auth) {
    const q = new URLSearchParams();
    for (const [key, raw] of Object.entries(searchParams)) {
      if (raw === undefined) continue;
      const val = Array.isArray(raw) ? raw[0] : raw;
      if (val !== undefined && val !== "") q.set(key, val);
    }
    const qs = q.toString();
    redirect(`${auth}/login${qs ? `?${qs}` : ""}`);
  }

  return (
    <Suspense fallback={null}>
      <LoginPageClient />
    </Suspense>
  );
}
