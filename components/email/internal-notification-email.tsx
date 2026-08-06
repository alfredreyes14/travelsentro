import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "react-email";

/**
 * Internal staff notification email (AUTO-02) -- sent bcc'd to every
 * active Admin/Staff with can_message_customers=true, per D-06/T-03-09.
 */
export function InternalNotificationEmail({
  name,
  email,
  phone,
  message,
  packageName,
  crmUrl,
}: {
  name: string;
  email: string;
  phone: string;
  message: string;
  packageName?: string;
  crmUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>New inquiry from {name}</Preview>
      <Body style={{ backgroundColor: "#FAF7F2", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            padding: "32px",
            borderRadius: "8px",
          }}
        >
          <Heading style={{ color: "#021F4A", fontSize: "24px" }}>
            New inquiry from {name}
          </Heading>
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>
            Email: {email}
            <br />
            Phone: {phone}
            <br />
            Package: {packageName ?? "General inquiry"}
          </Text>
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>
            {message}
          </Text>
          <Button
            href={crmUrl}
            style={{
              backgroundColor: "#F49314",
              color: "#FFFFFF",
              padding: "12px 20px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            View in CRM
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

export default InternalNotificationEmail;
