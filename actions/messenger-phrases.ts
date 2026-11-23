"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { requireModule } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Saved-reply rules for the Messenger sync: when a staff message in a
 * linked chat contains `phrase`, the lead moves forward to `stage`
 * (record_messenger_staff_message() in the meta_stage_sync migration).
 */

const phraseSchema = z.object({
  phrase: z.string().trim().min(10, "Use at least 10 characters so it only matches that saved reply.").max(300),
  stage: z.enum(["inquiry", "quotation", "confirmation"]),
});

export async function addStagePhrase(values: {
  phrase: string;
  stage: string;
}): Promise<ActionResult> {
  const profile = await requireModule("leads", "update");

  const parsed = phraseSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the phrase and stage." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("messenger_stage_phrases").insert({
    phrase: parsed.data.phrase,
    stage: parsed.data.stage,
    created_by_name: profile.name,
  });
  if (error?.code === "23505") return { ok: false, error: "That phrase is already a rule." };
  if (error) {
    console.error("addStagePhrase failed:", error.message);
    return { ok: false, error: "Couldn't save the rule. Please try again." };
  }

  revalidatePath("/admin/crm/messenger");
  return { ok: true };
}

export async function deleteStagePhrase(id: string): Promise<ActionResult> {
  await requireModule("leads", "delete");

  const supabase = await createClient();
  const { error } = await supabase.from("messenger_stage_phrases").delete().eq("id", id);
  if (error) {
    console.error("deleteStagePhrase failed:", error.message);
    return { ok: false, error: "Couldn't delete the rule. Please try again." };
  }

  revalidatePath("/admin/crm/messenger");
  return { ok: true };
}
