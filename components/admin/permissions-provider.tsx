"use client";

import { createContext, useContext } from "react";

import {
  can,
  type Action,
  type Module,
  type PermissionSubject,
} from "@/lib/auth/permissions";

const PermissionsContext = createContext<PermissionSubject>({
  role: "staff",
  permissions: {},
});

/**
 * Makes the signed-in account's permissions available to client components
 * under the admin shell (set in app/admin/(dashboard)/layout.tsx). Only hides
 * or shows controls -- every action and RLS policy re-checks on the server.
 */
export function PermissionsProvider({
  subject,
  children,
}: {
  subject: PermissionSubject;
  children: React.ReactNode;
}) {
  return <PermissionsContext value={subject}>{children}</PermissionsContext>;
}

/** True when the signed-in account may do `action` (or any of them) in `module`. */
export function useCan(module: Module, action: Action | readonly Action[]): boolean {
  return can(useContext(PermissionsContext), module, action);
}
