import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import { Nav } from "./_components/Nav";

// Reads the session per request to gate logged-in users straight to the app.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "confirmation_number",
    title: "Tickets & SLAs",
    body: "Capture requests across every product, auto-assign SLA targets by priority and category, and never miss a breach.",
  },
  {
    icon: "groups",
    title: "Agent queues",
    body: "Role-aware queues for agents, category leads and admins — overdue and at-risk tickets surface first.",
  },
  {
    icon: "insights",
    title: "Reports",
    body: "Live dashboards for ticket volume, agent performance and SLA compliance across your organization.",
  },
];

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access must see the landing + popup
  // even though they still hold a valid session — otherwise the redirect to
  // /dashboard would loop them straight back out. Mirrors quiktrack/quikscale.
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) redirect("/dashboard");

  return (
    <main className="qs-stage">
      <AppAccessDeniedPopup appName="QuikSupport" />
      <Nav />

      <section className="qs-hero">
        <span className="qs-eyebrow">QuikIT · Helpdesk</span>
        <h1 className="qs-hero-title">
          Support that keeps every<br />ticket on track.
        </h1>
        <p className="qs-hero-sub">
          QuikSupport is the multi-tenant helpdesk for the QuikIT platform — tickets,
          SLA tracking, categories and agent queues, with one sign-in across all your apps.
        </p>
        <div className="qs-hero-cta">
          <a className="qs-btn qs-btn-primary qs-btn-lg" href="/dashboard">
            Open the helpdesk
          </a>
        </div>
      </section>

      <section className="qs-features">
        {FEATURES.map((f) => (
          <div className="qs-feature" key={f.title}>
            <span className="material-symbols-outlined qs-feature-icon">{f.icon}</span>
            <h3 className="qs-feature-title">{f.title}</h3>
            <p className="qs-feature-body">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="qs-footer">
        <span>QuikSupport — part of the QuikIT platform.</span>
      </footer>
    </main>
  );
}
