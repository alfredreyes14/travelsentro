import { z } from "zod";

export const MAX_TESTIMONIAL_PHOTOS = 10;

export const testimonialFormSchema = z.object({
  customerName: z.string().min(1, "Please enter a customer name"),
  quote: z.string().min(1, "Please enter a quote"),
  rating: z
    .number()
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  photoStoragePaths: z
    .array(z.string())
    .max(
      MAX_TESTIMONIAL_PHOTOS,
      `You can attach up to ${MAX_TESTIMONIAL_PHOTOS} photos`
    ),
});

export type TestimonialFormValues = z.infer<typeof testimonialFormSchema>;
