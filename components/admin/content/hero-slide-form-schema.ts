import { z } from "zod";

/**
 * Package-type slide: shows an existing package's photo/name, CTA into that
 * package. packageId is required; headline/subheading/ctaLabel/externalLink
 * are all optional overrides (package slides default to the package's own
 * name/photo per RESEARCH.md Open Question 1). imageStoragePath is unused
 * for this branch (the photo comes from the linked package's own gallery).
 */
const packageSlideSchema = z.object({
  slideType: z.literal("package"),
  packageId: z.string().min(1, "Please select a package"),
  headline: z.string().optional(),
  subheading: z.string().optional(),
  ctaLabel: z.string().optional(),
  externalLink: z.string().optional(),
  imageStoragePath: z.string().optional(),
});

/**
 * Promo-type slide: general brand/promotional imagery not tied to a
 * specific package. headline and an uploaded image are both required;
 * packageId is unused for this branch.
 */
const promoSlideSchema = z.object({
  slideType: z.literal("promo"),
  packageId: z.string().optional(),
  headline: z.string().min(1, "Please enter a headline"),
  subheading: z.string().optional(),
  ctaLabel: z.string().optional(),
  externalLink: z.string().optional(),
  imageStoragePath: z.string().min(1, "Please upload an image"),
});

export const heroSlideFormSchema = z.discriminatedUnion("slideType", [
  packageSlideSchema,
  promoSlideSchema,
]);

export type HeroSlideFormValues = z.infer<typeof heroSlideFormSchema>;
