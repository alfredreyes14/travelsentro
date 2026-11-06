import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";

/**
 * The email an SOA is sent with -- same brand styling as
 * customer-message-email.tsx. The SOA itself travels as an attachment.
 * white-space: pre-line keeps the staff member's line breaks.
 */
export function SoaEmail({ name, message }: { name: string; message: string }) {
  return (
    <Html>
      <Head />
      <Preview>{message.slice(0, 100)}</Preview>
      <Body style={{ backgroundColor: "#FAF7F2", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            padding: "32px",
            borderRadius: "8px",
          }}
        >
          <Heading style={{ color: "#021F4A", fontSize: "24px" }}>Hi {name},</Heading>
          <Text style={{ color: "#021F4A", fontSize: "16px", whiteSpace: "pre-line" }}>
            {message}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: "14px" }}>— TravelSentro</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SoaEmail;
