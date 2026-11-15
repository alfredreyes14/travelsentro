import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { can, type Action, type Module } from "@/lib/auth/permissions";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

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

/**
 * Throws unless the caller may do `action` (or any of `action`, when an
 * array) in `module`. Admins pass every check. RLS enforces the same rules
 * independently (has_module_permission()).
 */
export async function requireModule(
  module: Module,
  action: Action | readonly Action[]
): Promise<Profile> {
  const profile = await getProfile();

  if (!can(profile, module, action)) {
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

/**
 * redirect()-based counterpart to requireModule(), for use in Server
 * Component page renders (not Server Actions). Mirrors getProfile()'s
 * existing redirect("/admin/login") pattern above -- redirect() is called
 * as a bare statement, never inside a try/catch, so Next's internal
 * NEXT_REDIRECT signal is never swallowed. requireModule() itself throws
 * instead, since Server Action call sites depend on the throw being a
 * catchable rejection.
 */
export async function requireModuleOrRedirect(
  module: Module,
  action: Action | readonly Action[] = "read"
): Promise<Profile> {
  const profile = await getProfile();

  if (!can(profile, module, action)) {
    redirect("/admin/forbidden");
  }

  return profile;
}

/**
 * redirect()-based counterpart to requireAdmin(), for use in Server
 * Component page renders (not Server Actions). See
 * requireModuleOrRedirect() above for rationale.
 */
export async function requireAdminOrRedirect(): Promise<Profile> {
  const profile = await getProfile();

  if (profile.role !== "admin") {
    redirect("/admin/forbidden");
  }

  return profile;
}
