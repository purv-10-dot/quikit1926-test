import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr,
} from "@react-email/components";

/**
 * Email template — sent to the founder when their deal advances to a new stage.
 *
 * Brand-light, single CTA, plain prose. We deliberately keep this minimal —
 * deliverability + readability matter more than visual polish for transactional.
 */
interface Props {
  founderName: string;
  startupName: string;
  newStageLabel: string;
  appUrl: string;
}

export default function StageChangedEmail({
  founderName,
  startupName,
  newStageLabel,
  appUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{`Your application "${startupName}" advanced to ${newStageLabel}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>QuikVC</Heading>
          <Text style={text}>Hi {founderName},</Text>
          <Text style={text}>
            Good news — your application for <strong>{startupName}</strong> has
            moved to <strong>{newStageLabel}</strong>.
          </Text>
          <Text style={text}>
            You can view the latest status, upload pending documents, and answer
            any open questions from your dashboard.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={appUrl} style={button}>
              Open dashboard
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            This is an automated update from QuikVC. If you have questions,
            reply directly and your VC contact will follow up.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#f5f5f7", fontFamily: "Helvetica, Arial, sans-serif" };
const container = { maxWidth: "600px", margin: "32px auto", backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px" };
const h1 = { color: "#0a0a0a", fontSize: "20px", fontWeight: 700, margin: "0 0 16px 0" };
const text = { color: "#374151", fontSize: "14px", lineHeight: "22px", margin: "0 0 12px 0" };
const button = { backgroundColor: "#0f172a", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontSize: "14px", fontWeight: 600 };
const hr = { borderColor: "#e5e7eb", margin: "24px 0" };
const footer = { color: "#9ca3af", fontSize: "12px", lineHeight: "18px" };
