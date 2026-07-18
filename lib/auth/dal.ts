import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

export type Permission =
  | "can_manage_packages"
  | "can_message_customers"
  | "can_edit_crm";

/**
 * Server-only Data Access Layer (DAL) — re-validates the session (getUser(),
 * never getSession()) and the caller's profiles row before any Server Action
 * or Server Component proceeds. See RESEARCH.md Pattern 2.
 */
export const verifySession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  return user;
});

export const getProfile = cache(async (): Promise<Profile> => {
  const user = await verifySession();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Re-checking is_active here (not just at login) on every request is what
  // makes D-05's "kills session immediately" true (Pitfall 3).
  if (error || !profile || !profile.is_active) {
    redirect("/admin/login");
  }

  return profile;
});

export async function requirePermission(
  perm: Permission
): Promise<Profile> {
  const profile = await getProfile();

  if (profile.role !== "admin" && !profile[perm]) {
    throw new Error("Forbidden");
  }

  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();

  if (profile.role !== "admin") {
    throw new Error("Forbidden");
  }

  return profile;
}
