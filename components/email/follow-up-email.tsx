import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import { splitParagraphs } from "@/lib/text/split-paragraphs";

/**
 * Lead follow-up email: the message plus two tracked chat buttons. Both
 * button URLs go through /go/<token> (lib/follow-ups/links.ts), which logs
 * the click and moves the lead in the funnel before opening the chat.
 * Same brand tokens as customer-message-email.tsx.
 */
export function FollowUpEmail({
  name,
  body,
  messengerUrl,
  whatsappUrl,
  unsubscribeUrl,
}: {
  name: string;
  body: string;
  messengerUrl: string;
  whatsappUrl: string;
  unsubscribeUrl: string;
}) {
  const buttonStyle = {
    display: "inline-block",
    borderRadius: "8px",
    padding: "12px 20px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#FFFFFF",
    textDecoration: "none",
    margin: "0 8px 8px 0",
  };

  return (
    <Html>
      <Head />
      <Preview>{body.slice(0, 100)}</Preview>
      <Body style={{ backgroundColor: "#FAF7F2", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            padding: "32px",
            borderRadius: "8px",
          }}
        >
          <Heading style={{ color: "#021F4A", fontSize: "24px" }}>
            Hi {name},
          </Heading>
          {splitParagraphs(body).map((paragraph, i) => (
            <Text key={i} style={{ color: "#021F4A", fontSize: "16px" }}>
              {paragraph}
            </Text>
          ))}
          <Section style={{ padding: "8px 0 16px" }}>
            <Button
              href={messengerUrl}
              style={{ ...buttonStyle, backgroundColor: "#021F4A" }}
            >
              Chat with us on Messenger
            </Button>
            <Button
              href={whatsappUrl}
              style={{ ...buttonStyle, backgroundColor: "#F49314" }}
            >
              Chat on WhatsApp
            </Button>
          </Section>
          <Text style={{ color: "#6B7280", fontSize: "12px" }}>
            You&apos;re receiving this because you asked TravelSentro about a
            trip.{" "}
            <a href={unsubscribeUrl} style={{ color: "#6B7280" }}>
              Unsubscribe
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default FollowUpEmail;
