import { z } from "zod";

import { normalizePartnerLink } from "@/lib/partners/link";

export const partnerFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter a name"),
  logoStoragePath: z.string().min(1, "Please upload a logo"),
  linkUrl: z
    .string()
    .optional()
    .refine((value) => normalizePartnerLink(value ?? "").ok, {
      message: "Enter a valid website address, e.g. https://example.com",
    }),
  isPublished: z.boolean(),
});

export type PartnerFormValues = z.infer<typeof partnerFormSchema>;
