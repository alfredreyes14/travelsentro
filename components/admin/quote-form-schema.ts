import { z } from "zod";

import {
  EMPTY_ITINERARY_CONTENT,
  itineraryContentSchema,
} from "./itinerary-content-schema";

// customerName/contactId are plain optional strings, not .nullable() --
// same convention as voucher-form-schema.ts: "" means unset in the form,
// converted to null at the lib/quotes/quote-row.ts boundary.
export const quoteFormSchema = itineraryContentSchema.extend({
  title: z.string().trim().min(1, "Please enter a quote title"),
  customerName: z.string().optional(),
  contactId: z.string().optional(),
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export const EMPTY_QUOTE_VALUES: QuoteFormValues = {
  ...EMPTY_ITINERARY_CONTENT,
  title: "",
  customerName: "",
  contactId: "",
};
