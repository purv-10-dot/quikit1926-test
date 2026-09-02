import Link from "next/link";
import LegalShell from "@/components/legal/LegalShell";

// Public, unauthenticated hub page — see middleware.ts publicRoutes ("/legal"
// prefix-matches this route and every page under it).
export default function LegalHubPage() {
  return (
    <LegalShell title="Legal">
      <p>Policies governing your use of QuikInsight.</p>
      <div className="lp-legal-cards">
        <Link href="/legal/privacy" className="lp-legal-card">
          <h3>Privacy Policy</h3>
          <p>What data we collect, why we request access to your connected accounts, and how it&apos;s used.</p>
        </Link>
        <Link href="/legal/terms" className="lp-legal-card">
          <h3>Terms of Service</h3>
          <p>The terms governing your use of QuikInsight.</p>
        </Link>
      </div>
    </LegalShell>
  );
}
