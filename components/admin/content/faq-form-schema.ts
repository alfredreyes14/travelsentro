import { z } from "zod";

export const faqFormSchema = z.object({
  question: z.string().trim().min(1, "Please enter a question"),
  answer: z.string().trim().min(1, "Please enter an answer"),
  isPublished: z.boolean(),
});

export type FaqFormValues = z.infer<typeof faqFormSchema>;
