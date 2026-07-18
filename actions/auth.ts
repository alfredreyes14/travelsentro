"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

export async function login(values: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword(values);

  if (error) {
    return {
      ok: false,
      error: "Incorrect email or password. Please try again.",
    };
  }

  // redirect() throws a special NEXT_REDIRECT error — this must stay outside
  // the try/catch above (there is none) so it's never swallowed (Task 2/
  // T-02-10).
  redirect("/admin/packages");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
