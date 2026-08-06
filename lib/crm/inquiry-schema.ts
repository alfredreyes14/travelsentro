import { z } from "zod";

// Server-side validation for the /api/inquiries Route Handler's request body.
// Mirrors components/inquiry/inquiry-schema.ts's conventions (z.email() top-level
// validator, `_gotcha` honeypot field), but `_gotcha` here deliberately has NO
// `.max(0)` constraint: a filled honeypot must still pass validation so the
// Route Handler's own honeypot check can return a fake-success 200 instead of
// leaking bot detection via a 400 validation error.
export const inquiryRequestSchema = z.object({
  requestId: z.uuid(),
  name: z.string().min(1).max(200),
  email: z.email(),
  phone: z.string().min(7).max(30),
  message: z.string().min(1).max(5000),
  packageId: z.uuid().nullable().optional(),
  packageName: z.string().max(200).optional(),
  _gotcha: z.string().optional(),
});

export type InquiryRequestValues = z.infer<typeof inquiryRequestSchema>;
