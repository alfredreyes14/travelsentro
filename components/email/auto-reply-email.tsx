import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";

import { FACEBOOK_URL } from "@/lib/constants";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/**
 * Customer-facing auto-reply email (AUTO-01) -- first React Email template
 * in this project. Kept visually simple per 03-UI-SPEC.md's Scope Note
 * (navy/marigold/sand accents, no pixel-level contract enforced).
 */
export function AutoReplyEmail({
  name,
  packageName,
}: {
  name: string;
  packageName?: string;
}) {
  const whatsappLink = buildWhatsAppLink(packageName ?? "my trip");

  return (
    <Html>
      <Head />
      <Preview>
        Thanks for reaching out to TravelSentro -- we&apos;ll be in touch
        soon.
      </Preview>
      <Body style={{ backgroundColor: "#FAF7F2", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            padding: "32px",
            borderRadius: "8px",
          }}
        >
          <Heading style={{ color: "#021F4A", fontSize: "24px" }}>
            Thanks, {name}!
          </Heading>
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>
            We&apos;ve received your inquiry
            {packageName ? ` about ${packageName}` : ""} and a member of our
            team will follow up with you soon.
          </Text>
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>
            Want a faster reply? Message us directly on{" "}
            <a href={whatsappLink} style={{ color: "#F49314" }}>
              WhatsApp
            </a>{" "}
            or{" "}
            <a href={FACEBOOK_URL} style={{ color: "#F49314" }}>
              Facebook
            </a>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default AutoReplyEmail;
