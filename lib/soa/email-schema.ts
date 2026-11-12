import { z } from "zod";

export const soaEmailSchema = z.object({
  to: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address")),
  subject: z.string().trim().min(1, "Please enter a subject").max(200),
  message: z.string().trim().min(1, "Please enter a message").max(5000),
});

export type SoaEmailValues = z.infer<typeof soaEmailSchema>;

/** The send dialog's starting text. */
export function defaultSoaEmail(soa: { soaNo: string; originalNo: string | null }) {
  const number = soa.originalNo ?? soa.soaNo;
  return {
    subject: `Statement of Account ${number} – TravelSentro`,
    message: `Please find attached your Statement of Account (${number}).\n\nIf you have any questions, just reply to this email or message us on WhatsApp or Facebook.\n\nThank you!`,
  };
}
