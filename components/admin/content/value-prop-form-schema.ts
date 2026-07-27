import { z } from "zod";

export const valuePropFormSchema = z.object({
  title: z.string().min(1, "Please enter a title"),
  description: z.string().min(1, "Please enter a description"),
});

export type ValuePropFormValues = z.infer<typeof valuePropFormSchema>;
