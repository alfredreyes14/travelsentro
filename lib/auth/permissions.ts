/**
 * Per-module read / create / update / delete permissions.
 *
 * Stored in profiles.permissions as
 *   { "packages": { "read": true, "create": true }, ... }
 * A missing module or action means "no". Admins bypass every check; the
 * Users page stays admin-only and isn't a module here.
 *
 * The database enforces the same rules through has_module_permission()
 * (supabase/migrations/20261119120000_module_crud_permissions.sql). Keep the
 * module keys here and in that migration in sync.
 *
 * Shared by server and client code -- no server-only imports.
 */

export const ACTIONS = ["read", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  read: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
};

export type ModuleDefinition = {
  key: string;
  label: string;
  /** Admin page the module lives on; absent for modules without a page. */
  href?: string;
  /** Actions this module supports; the others show as "--" in the UI. */
  actions: readonly Action[];
  /** What each supported action allows, shown in the account form. */
  help: Partial<Record<Action, string>>;
};

export const MODULES = [
  {
    key: "leads",
    label: "Leads",
    href: "/admin/crm",
    actions: ["read", "create", "update", "delete"],
    help: {
      read: "See leads, notes, documents, message history and Messenger chats",
      create: "Add leads, add leads from Messenger chats, sync Meta leads",
      update: "Edit leads and stages, add notes and documents, link chats, saved replies",
      delete: "Delete notes, documents and saved replies",
    },
  },
  {
    key: "messages",
    label: "Messages",
    actions: ["create"],
    help: {
      create: "Send emails, SMS and follow-ups to leads",
    },
  },
  {
    key: "quotes",
    label: "Quotes",
    href: "/admin/quotes",
    actions: ["read", "create", "update", "delete"],
    help: {},
  },
  {
    key: "soa",
    label: "Statements (SOA)",
    href: "/admin/soa",
    actions: ["read", "create", "update", "delete"],
    help: { update: "Also covers emailing a statement" },
  },
  {
    key: "vouchers",
    label: "Vouchers",
    href: "/admin/vouchers",
    actions: ["read", "create", "update"],
    help: {},
  },
  {
    key: "packages",
    label: "Packages",
    href: "/admin/packages",
    actions: ["read", "create", "update", "delete"],
    help: { update: "Also publishing and featuring" },
  },
  {
    key: "destinations",
    label: "Destinations",
    href: "/admin/packages/destinations",
    actions: ["read", "create", "update", "delete"],
    help: {},
  },
  {
    key: "content",
    label: "Site Content",
    href: "/admin/content",
    actions: ["read", "create", "update", "delete"],
    help: {
      read: "Hero slides, testimonials, FAQs, visa services, add-ons, booking terms",
    },
  },
  {
    key: "events",
    label: "Events",
    href: "/admin/events",
    actions: ["read", "create", "update", "delete"],
    help: {},
  },
  {
    key: "partners",
    label: "Partners",
    href: "/admin/partners",
    actions: ["read", "create", "update", "delete"],
    help: {},
  },
] as const satisfies readonly ModuleDefinition[];

export type Module = (typeof MODULES)[number]["key"];

export type ModulePermissions = Partial<Record<Action, boolean>>;
export type PermissionMap = Partial<Record<Module, ModulePermissions>>;

/** What permission checks need from a profile. */
export type PermissionSubject = {
  role: string;
  permissions: unknown;
};

const MODULE_KEYS = new Set<string>(MODULES.map((m) => m.key));

export function moduleSupports(module: Module, action: Action): boolean {
  const def = MODULES.find((m) => m.key === module);
  return !!def && (def.actions as readonly Action[]).includes(action);
}

/**
 * Normalizes the stored jsonb: drops unknown modules/actions and anything
 * that isn't `true`, and turns View on wherever another action is on (you
 * can't edit what you can't see).
 */
export function normalizePermissions(raw: unknown): PermissionMap {
  const result: PermissionMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

  for (const [moduleKey, value] of Object.entries(raw)) {
    if (!MODULE_KEYS.has(moduleKey) || !value || typeof value !== "object") continue;
    const key = moduleKey as Module;
    const granted: ModulePermissions = {};
    for (const action of ACTIONS) {
      if (moduleSupports(key, action) && (value as Record<string, unknown>)[action] === true) {
        granted[action] = true;
      }
    }
    if (Object.keys(granted).length === 0) continue;
    if (moduleSupports(key, "read") && !granted.read) granted.read = true;
    result[key] = granted;
  }

  return result;
}

export function isAdmin(subject: PermissionSubject): boolean {
  return subject.role === "admin";
}

/**
 * True when the subject may do `action` (or any of `actions`) in `module`.
 * Admins may do everything.
 */
export function can(
  subject: PermissionSubject,
  module: Module,
  action: Action | readonly Action[]
): boolean {
  if (isAdmin(subject)) return true;
  const granted = normalizePermissions(subject.permissions)[module];
  if (!granted) return false;
  const wanted = typeof action === "string" ? [action] : action;
  return wanted.some((a) => granted[a] === true);
}

/** First admin page the subject can open, for the post-login landing. */
export function firstReadableHref(subject: PermissionSubject): string | null {
  if (isAdmin(subject)) return "/admin/packages";
  for (const m of MODULES) {
    if ("href" in m && m.href && can(subject, m.key, "read")) return m.href;
  }
  return null;
}
