import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  normalizePermissions,
  type Action,
  type Module,
  type PermissionMap,
  type PermissionSubject,
} from "@/lib/auth/permissions";

/**
 * The account form's permission grid: every module with every action it
 * supports, each true/false. Unsupported actions are left out.
 */
export type PermissionGrid = Record<Module, Partial<Record<Action, boolean>>>;

export function permissionGrid(raw: unknown = {}): PermissionGrid {
  const granted = normalizePermissions(raw);
  return Object.fromEntries(
    MODULES.map((m) => [
      m.key,
      Object.fromEntries(
        (m.actions as readonly Action[]).map((a) => [a, granted[m.key]?.[a] === true])
      ),
    ])
  ) as PermissionGrid;
}

/** Grid -> what gets stored in profiles.permissions (only granted actions). */
export function gridToPermissions(grid: unknown): PermissionMap {
  return normalizePermissions(grid);
}

/**
 * Applies one checkbox change and keeps the row consistent: turning on
 * Create/Edit/Delete also turns on View, and turning View off turns the
 * whole row off.
 */
export function toggleGridCell(
  row: Partial<Record<Action, boolean>>,
  action: Action,
  checked: boolean
): Partial<Record<Action, boolean>> {
  const next = { ...row, [action]: checked };
  if (action === "read" && !checked) {
    for (const a of ACTIONS) if (a in next) next[a] = false;
  }
  if (action !== "read" && checked && "read" in next) next.read = true;
  return next;
}

/** One short label per module the account can use, for the users table. */
export function permissionSummary(subject: PermissionSubject): string[] {
  const granted = normalizePermissions(subject.permissions);
  return MODULES.flatMap((m) => {
    const actions = (m.actions as readonly Action[]).filter((a) => granted[m.key]?.[a]);
    if (actions.length === 0) return [];
    if (actions.length === m.actions.length && m.actions.length > 1) {
      return [`${m.label}: All`];
    }
    if (m.key === "messages") return ["Send messages"];
    return [`${m.label}: ${actions.map((a) => ACTION_LABELS[a]).join(", ")}`];
  });
}
