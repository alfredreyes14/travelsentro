import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "react-email";

import { SITE_URL } from "@/lib/constants";
import { splitParagraphs } from "@/lib/text/split-paragraphs";

// Always the production site: mail clients fetch the image long after the
// send, and preview/staging URLs can sit behind Vercel's login.
const LOGO_URL = `${SITE_URL}/logo.png`;

/**
 * Lead follow-up email, styled as a personal note rather than a newsletter
 * so Gmail is more likely to file it under Primary than Promotions: plain
 * paragraphs, text links instead of coloured buttons, no card or banner,
 * and a sign-off with only a small logo. Both chat links go through
 * /go/<token> (lib/follow-ups/links.ts), which logs the click and moves the
 * lead in the funnel before opening the chat.
 */
export function FollowUpEmail({
  name,
  body,
  signature,
  messengerUrl,
  whatsappUrl,
  unsubscribeUrl,
}: {
  name: string;
  body: string;
  /** The staff member who sent it; null signs as the business. */
  signature?: string | null;
  messengerUrl: string;
  whatsappUrl: string;
  unsubscribeUrl: string;
}) {
  const text = { color: "#1F2937", fontSize: "15px", lineHeight: "1.6", margin: "0 0 16px" };
  const link = { color: "#1A56DB", textDecoration: "underline" };

  return (
    <Html>
      <Head />
      <Preview>{body.slice(0, 100)}</Preview>
      <Body style={{ backgroundColor: "#FFFFFF", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "560px", padding: "8px 0", margin: "0" }}>
          <Text style={text}>Hi {name},</Text>
          {splitParagraphs(body).map((paragraph, i) => (
            <Text key={i} style={text}>
              {paragraph}
            </Text>
          ))}
          <Text style={text}>
            Chat with us on{" "}
            <Link href={messengerUrl} style={link}>
              Messenger
            </Link>{" "}
            or{" "}
            <Link href={whatsappUrl} style={link}>
              WhatsApp
            </Link>
            .
          </Text>
          <Text style={{ ...text, margin: "0 0 8px" }}>
            Thanks,
            <br />
            {signature ? (
              <>
                {signature}
                <br />
                TravelSentro
              </>
            ) : (
              "The TravelSentro team"
            )}
          </Text>
          <Img
            src={LOGO_URL}
            alt="TravelSentro"
            width="120"
            height="29"
            style={{ display: "block", margin: "0 0 24px" }}
          />
          <Text style={{ color: "#9CA3AF", fontSize: "12px", lineHeight: "1.5", margin: "0" }}>
            You&apos;re receiving this because you asked TravelSentro about a
            trip.{" "}
            <Link href={unsubscribeUrl} style={{ color: "#9CA3AF" }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default FollowUpEmail;
