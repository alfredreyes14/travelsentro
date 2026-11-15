import { z } from "zod";

export const resetPasswordSchema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
