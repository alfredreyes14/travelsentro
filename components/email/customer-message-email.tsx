import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";

/**
 * Outbound customer-message email template (MSG-01/MSG-03) -- mirrors
 * auto-reply-email.tsx's exact import source, inline brand-token style
 * shape, and Preview/Heading/Text component set. Kept visually simple per
 * 04-UI-SPEC.md's Scope Note (navy/marigold/sand accents, no pixel-level
 * contract enforced).
 */
export function CustomerMessageEmail({
  name,
  body,
  unsubscribeUrl,
}: {
  name: string;
  body: string;
  unsubscribeUrl?: string;
}) {
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
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>{body}</Text>
          {unsubscribeUrl ? (
            <Text style={{ color: "#6B7280", fontSize: "12px" }}>
              <a href={unsubscribeUrl} style={{ color: "#6B7280" }}>
                Unsubscribe
              </a>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export default CustomerMessageEmail;
