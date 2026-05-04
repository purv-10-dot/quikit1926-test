/**
 * Admin — IC rules + fund profile.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import ICRulesClient from "./ic-rules-client";

export default async function ICRulesAdminPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const profile = await db.vCFundProfile.findUnique({
    where: { orgId },
  });

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
        ← Admin
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">IC rules &amp; fund profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure how IC voting works, set the fund&apos;s investment thesis, and the daily brief schedule.
        </p>
      </header>

      <ICRulesClient
        initial={{
          fundName: profile?.fundName ?? "Fund I",
          currency: profile?.currency ?? "INR",
          icVotingMode: profile?.icVotingMode ?? "single",
          icQuorum: profile?.icQuorum ?? 2,
          icThreshold: profile?.icThreshold ?? "simple-majority",
          icVisibility: profile?.icVisibility ?? "open",
          thesis: profile?.thesis ?? "",
          dailyBriefHour: profile?.dailyBriefHour ?? 6,
        }}
      />
    </div>
  );
}
