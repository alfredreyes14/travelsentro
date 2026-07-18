"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * Derives the site origin for building the password-reset redirect URL:
 * NEXT_PUBLIC_SITE_URL if set, else the incoming request's own host, else a
 * http://localhost:3000 fallback for local dev.
 */
async function getSiteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  try {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") ?? "http";
    if (host) {
      return `${protocol}://${host}`;
    }
  } catch {
    // headers() is only available within a request scope — fall through.
  }

  return "http://localhost:3000";
}

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

export async function requestPasswordReset(values: {
  email: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  // Always return ok:true regardless of whether the email exists — never
  // leak account existence via a different response for unknown emails
  // (T-02-09).
  await supabase.auth.resetPasswordForEmail(values.email, {
    redirectTo: `${origin}/admin/auth/confirm`,
  });

  return { ok: true };
}

export async function updatePassword(values: {
  password: string;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: values.password,
  });

  if (error) {
    return {
      ok: false,
      error: "Something went wrong saving your changes. Please try again.",
    };
  }

  // redirect() outside the try/catch — same caution as login() (T-02-10).
  redirect("/admin/login");
}
