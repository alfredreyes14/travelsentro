import { z } from "zod";

/**
 * Fields shared by both create and edit forms. Email/password are
 * intentionally NOT part of this shared shape — email is set once at
 * creation (disabled in edit mode) and password changes are out of scope
 * here (handled by the account owner's own forgot-password flow, 02-02).
 */
const baseAccountFields = {
  name: z.string().min(1, "Please enter a name"),
  role: z.enum(["admin", "staff"]),
  canManagePackages: z.boolean(),
  canMessageCustomers: z.boolean(),
  canEditCrm: z.boolean(),
};

export const createAccountSchema = z.object({
  ...baseAccountFields,
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const editAccountSchema = z.object(baseAccountFields);

export type CreateAccountFormValues = z.infer<typeof createAccountSchema>;
export type EditAccountFormValues = z.infer<typeof editAccountSchema>;
