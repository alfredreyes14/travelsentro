import { z } from "zod";

import {
  EMPTY_ITINERARY_CONTENT,
  itineraryContentSchema,
} from "./itinerary-content-schema";

export const packageFormSchema = itineraryContentSchema.extend({
  name: z.string().min(1, "Please enter a package name"),
  destinationId: z.string().min(1, "Please select a destination"),
});

export type PackageFormValues = z.infer<typeof packageFormSchema>;

/**
 * The form's reset baseline -- also PackageForm's default `useForm` values
 * and the shape poster imports get merged onto (`{ ...EMPTY_DEFAULTS,
 * ...values }`). Lives here rather than in package-form.tsx because this
 * module has no React dependency, so scripts/verify-poster-extraction.ts
 * (a plain tsx script, not a Next.js runtime) can import it directly instead
 * of hand-duplicating it -- importing package-form.tsx itself would pull in
 * actions/packages.ts -> lib/auth/dal.ts -> the `server-only` package,
 * which fails outside Next.js.
 */
export const EMPTY_DEFAULTS: PackageFormValues = {
  ...EMPTY_ITINERARY_CONTENT,
  name: "",
  destinationId: "",
};
