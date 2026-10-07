import { z } from "zod";

export const bookingTermsFormSchema = z.object({
  content: z.string(),
});

export type BookingTermsFormValues = z.infer<typeof bookingTermsFormSchema>;
