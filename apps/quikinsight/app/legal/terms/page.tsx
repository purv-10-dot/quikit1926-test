import LegalShell from "@/components/legal/LegalShell";

const APP_NAME = "QuikInsight";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="September 2, 2026">
      <h2>Agreement to terms</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of {APP_NAME}, operated by
        QuikIT (&quot;we&quot;, &quot;us&quot;). By signing in to {APP_NAME}, you agree to these Terms. If you do
        not agree, do not use {APP_NAME}.
      </p>

      <h2>The service</h2>
      <p>
        {APP_NAME} is a marketing analytics dashboard that aggregates data from the third-party
        accounts you choose to connect (Google Analytics, YouTube, Search Console, Google Ads,
        Meta, LinkedIn, and others as listed in our{" "}
        <a href="/legal/privacy">Privacy Policy</a>) and presents it in a unified dashboard, with
        AI-generated insights, grounded in rule-based analysis of your own data.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in to {APP_NAME} via QuikIT single sign-on. You are responsible for maintaining
        the security of your QuikIT account and for all activity that occurs under it.
      </p>

      <h2>Connected accounts</h2>
      <p>
        Connecting a third-party account (Google, Meta, LinkedIn, HubSpot, or any other supported
        provider) is optional and requires your explicit authorization via that provider&apos;s own
        OAuth consent screen. You may disconnect any account at any time. Your use of each
        connected provider remains subject to that provider&apos;s own terms of service.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You agree not to misuse {APP_NAME} — including attempting to access data you are not
        authorized to view, interfering with the service&apos;s operation, or using the service
        to violate any applicable law.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        {APP_NAME} is provided &quot;as is&quot;, without warranty of any kind. Insights and
        recommendations shown in the dashboard are generated from your connected data and are
        informational only — they do not constitute professional advice.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {APP_NAME} and QuikIT are not liable for any
        indirect, incidental, or consequential damages arising from your use of the service.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate your access to {APP_NAME} if you violate our acceptable use
        terms, if your account is inactive for an extended period, or at our discretion for other
        reasons. Where feasible, we will provide reasonable notice before suspending or
        terminating your access.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be reflected by
        updating the &quot;Last updated&quot; date above. Continued use of {APP_NAME} after changes
        take effect constitutes acceptance of the updated Terms.
      </p>

      <h2>Indemnification</h2>
      <p>
        You agree to indemnify and hold QuikIT harmless from any claims, damages, or expenses
        arising from your misuse of {APP_NAME} or your violation of these Terms.
      </p>

      <h2>Severability</h2>
      <p>
        If any provision of these Terms is found to be unenforceable, that provision will be
        limited or removed to the minimum extent necessary, and the remaining provisions will
        remain in full effect.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of India, with the courts of Madhya Pradesh having
        exclusive jurisdiction, without regard to conflict of law principles.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:support@quikit.ai">support@quikit.ai</a>.
      </p>
    </LegalShell>
  );
}
