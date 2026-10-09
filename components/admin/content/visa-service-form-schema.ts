import { z } from "zod";

export const visaServiceFormSchema = z.object({
  country: z.string().trim().min(1, "Please enter a country"),
  description: z.string().optional(),
  processingTime: z.string().optional(),
  price: z
    .number({ error: "Price must be a positive number" })
    .int("Price must be a positive number")
    .positive("Price must be a positive number")
    .optional(),
  requirements: z.string().optional(),
  photoStoragePath: z.string().optional(),
  isPublished: z.boolean(),
});

export type VisaServiceFormValues = z.infer<typeof visaServiceFormSchema>;
