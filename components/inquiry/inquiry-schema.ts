import { z } from "zod";

export const inquirySchema = z.object({
  name: z.string().min(1, "Please enter your name"),
  email: z.email("Enter a valid email address"),
  phone: z.string().min(7, "Enter a valid phone number"),
  message: z.string().min(1, "Please add a short message"),
  // Honeypot — must stay empty. Never shown to real users.
  _gotcha: z.string().max(0).optional(),
});

export type InquiryFormValues = z.infer<typeof inquirySchema>;
