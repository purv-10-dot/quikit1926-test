/**
 * Generic notification email — used as the email half of every in-app
 * notification (allocation, repayment, vote settled, term sheet generated, etc.).
 *
 * Single template intentionally — the in-app row already carries title/body/href,
 * and per-type bespoke emails would explode template count without adding value.
 * If a specific event needs a richer email later, build a dedicated template for
 * that event and route to it from the call site.
 */
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr,
} from "@react-email/components";

interface Props {
  /** Notification title — also the email subject (caller may override). */
  title: string;
  /** Optional body text shown above the CTA. */
  body?: string | null;
  /** Optional deep-link target — if absent, the dashboard is used. */
  href?: string | null;
  /** Recipient first name, used for the salutation. */
  recipientName?: string;
  /** Tenant display name, shown in the header. Defaults to "QuikVC". */
  tenantName?: string;
  /** Absolute origin (https://app.quikvc.test). Combined with href. */
  appUrl: string;
}

export default function NotificationEmail({
  title,
  body,
  href,
  recipientName,
  tenantName,
  appUrl,
}: Props) {
  const cta = href ? `${appUrl}${href.startsWith("/") ? href : `/${href}`}` : appUrl;

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>{tenantName ?? "QuikVC"}</Heading>
          {recipientName && <Text style={styles.text}>Hi {recipientName},</Text>}
          <Heading as="h2" style={styles.h2}>{title}</Heading>
          {body && <Text style={styles.text}>{body}</Text>}
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={cta} style={styles.button}>
              Open in QuikVC
            </Button>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            This is an automated update. You&apos;re receiving it because you have
            an active membership in {tenantName ?? "this fund"}. To stop receiving
            these, update your notification preferences in the app.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: { backgroundColor: "#f5f5f7", fontFamily: "Helvetica, Arial, sans-serif" },
  container: { maxWidth: "600px", margin: "32px auto", backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px" },
  h1: { color: "#0a0a0a", fontSize: "20px", fontWeight: 700, margin: "0 0 24px 0" },
  h2: { color: "#0a0a0a", fontSize: "16px", fontWeight: 600, margin: "0 0 12px 0" },
  text: { color: "#374151", fontSize: "14px", lineHeight: "22px", margin: "0 0 12px 0" },
  button: { backgroundColor: "#0f172a", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontSize: "14px", fontWeight: 600 },
  hr: { borderColor: "#e5e7eb", margin: "24px 0" },
  footer: { color: "#9ca3af", fontSize: "12px", lineHeight: "18px" },
};
