"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Database } from "@/types/database";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * action never uses realtime features. Polyfill from `undici` (already
 * present via Next.js's dependency tree), matching scripts/seed-admin.ts's
 * existing safeguard for the exact same client construction.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type AccountInput = {
  name: string;
  role: "admin" | "staff";
  canManagePackages: boolean;
  canMessageCustomers: boolean;
  canEditCrm: boolean;
};

export async function createAccount(
  values: AccountInput & { email: string; password: string }
): Promise<ActionResult> {
  // AUTH-05 — gate independent of D-13's nav hiding.
  await requireAdmin();

  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  await ensureWebSocketPolyfill();

  // Service-role client — constructed inline, only inside this server-only
  // action, never imported into any "use client" module or exported
  // (T-02-13), matching scripts/seed-admin.ts's existing safeguard.
  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: created, error: createError } =
    await serviceRoleClient.auth.admin.createUser({
      email: values.email,
      password: values.password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  // The on_auth_user_created trigger (02-01) already auto-created a
  // Staff/no-permissions profiles row for this user — update it with the
  // admin-chosen name/role/permissions via the calling Admin's own
  // RLS-scoped session (the 02-01 profiles UPDATE policy permits this since
  // the caller is role='admin').
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      name: values.name,
      role: values.role,
      can_manage_packages: values.canManagePackages,
      can_message_customers: values.canMessageCustomers,
      can_edit_crm: values.canEditCrm,
    })
    .eq("id", created.user.id);

  if (updateError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateAccount(
  id: string,
  values: AccountInput
): Promise<ActionResult> {
  // T-02-14 — requireAdmin() here, and the profiles UPDATE RLS policy
  // (admin-only, no self-referential clause) independently rejects any
  // non-admin write at the database layer regardless of this check.
  const caller = await requireAdmin();

  // AUTH-03 — reject self-demotion unconditionally, regardless of how many
  // other admins exist, mirroring deactivateAccount()'s T-02-40 self-check.
  // Without this, an ordinary "Edit Account" role change on the caller's own
  // row (reachable unconditionally per components/admin/users-table.tsx)
  // could silently lock the caller out of every admin-gated request.
  if (values.role !== "admin" && caller.id === id) {
    return { ok: false, error: "You can't remove your own admin role." };
  }

  const supabase = await createClient();

  // AUTH-03 — reject removing the last remaining active admin's admin role,
  // mirroring deactivateAccount()'s T-02-41 last-admin check, so the panel
  // is never left with zero admins able to log in.
  if (values.role !== "admin") {
    const { count: otherActiveAdminCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", id);

    if (!otherActiveAdminCount) {
      return {
        ok: false,
        error: "Can't remove the last remaining admin's admin role.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: values.name,
      role: values.role,
      can_manage_packages: values.canManagePackages,
      can_message_customers: values.canMessageCustomers,
      can_edit_crm: values.canEditCrm,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deactivateAccount(id: string): Promise<ActionResult> {
  const caller = await requireAdmin();

  // T-02-40 — reject self-deactivation unconditionally, regardless of how
  // many other admins exist. Without this, an admin could sign themselves
  // out of the entire panel on their next request (D-05) with no recovery.
  if (caller.id === id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const supabase = await createClient();

  // T-02-41 — reject deactivating the last remaining active admin, so the
  // panel is never left with zero admins able to log in.
  const { count: otherActiveAdminCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("id", id);

  if (!otherActiveAdminCount) {
    return { ok: false, error: "Can't deactivate the last remaining admin." };
  }

  // D-05 — is_active is re-checked in lib/auth/dal.ts's getProfile() on
  // every request, so flipping this flag kills the account's session
  // immediately, not just at next login.
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
