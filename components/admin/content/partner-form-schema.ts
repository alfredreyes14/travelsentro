import { z } from "zod";

/**
 * Deliberately excludes the partner-type discriminator field -- which
 * section a partner belongs to is always a fixed prop passed to
 * PartnerForm by the caller (determined by which button, "Add Partner" or
 * "Add Client", opened the dialog), never a form field the user selects
 * (D-07's two-independent-buttons UI). See partner-form.tsx.
 */
export const partnerFormSchema = z.object({
  logoStoragePath: z.string().min(1, "Please upload a logo"),
  linkUrl: z.string().optional(),
});

export type PartnerFormValues = z.infer<typeof partnerFormSchema>;
