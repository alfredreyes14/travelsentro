import { z } from "zod";

export const testimonialFormSchema = z.object({
  customerName: z.string().min(1, "Please enter a customer name"),
  quote: z.string().min(1, "Please enter a quote"),
  rating: z
    .number()
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  photoStoragePath: z.string().optional(),
});

export type TestimonialFormValues = z.infer<typeof testimonialFormSchema>;
