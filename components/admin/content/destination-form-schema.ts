import { z } from "zod";

export const destinationFormSchema = z.object({
  name: z.string().min(1, "Please enter a destination name"),
  slug: z
    .string()
    .min(1, "Please enter a slug")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only"
    ),
  region: z.enum(["local", "international"], {
    error: "Please select a region",
  }),
  photoStoragePath: z.string().optional(),
});

export type DestinationFormValues = z.infer<typeof destinationFormSchema>;
