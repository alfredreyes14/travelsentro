import { z } from "zod";

/**
 * tags here is the RAW comma-separated text input value, split into a
 * string[] at submit time (not by zod itself) — kept lenient per
 * 03-CONTEXT.md's "Claude's Discretion" note: a plain text[] column, no
 * strict format imposed on user-entered phone/tag text beyond what the
 * original inquiry already validated.
 */
export const contactEditSchema = z.object({
  name: z.string().min(1, "Please enter a name"),
  phone: z.string().optional(),
  tags: z.string().optional(),
});

export type ContactEditFormValues = z.infer<typeof contactEditSchema>;
