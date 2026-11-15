"use client";

import { useState } from "react";
import { useForm, useWatch, type Control, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createAccount, updateAccount } from "@/actions/users";
import {
  createAccountSchema,
  editAccountSchema,
  type CreateAccountFormValues,
  type EditAccountFormValues,
} from "./account-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from "@/components/ui/form";
import type { Profile } from "@/lib/auth/dal";
import {
  permissionGrid,
  toggleGridCell,
  type PermissionGrid,
} from "@/components/admin/account-permissions";
import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  type Action,
} from "@/lib/auth/permissions";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const ROLE_ITEMS = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
] as const;

type AccountFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; account: Profile; onSuccess: () => void };

/**
 * Renders either the create or edit account form. Each mode is its own
 * fully self-contained component below (rather than one component
 * conditionally shaping a single useForm() call) so each keeps a single,
 * stable field-values type — CreateAccountFormValues includes email/password,
 * EditAccountFormValues intentionally omits both (see account-form-schema.ts).
 */
export function AccountForm(props: AccountFormProps) {
  if (props.mode === "create") {
    return <CreateAccountForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditAccountForm account={props.account} onSuccess={props.onSuccess} />
  );
}

function CreateAccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "staff",
      permissions: permissionGrid(),
    },
  });

  async function onSubmit(values: CreateAccountFormValues) {
    setIsSubmitting(true);
    try {
      const result = await createAccount(values);
      if (result.ok) {
        toast.success("Staff account created.");
        form.reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                items={ROLE_ITEMS}
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <PermissionFields
          control={form.control}
          setPermissions={(grid) =>
            form.setValue("permissions", grid, { shouldDirty: true })
          }
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : "Add Staff Account"}
        </Button>
      </form>
    </Form>
  );
}

function EditAccountForm({
  account,
  onSuccess,
}: {
  account: Profile;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditAccountFormValues>({
    resolver: zodResolver(editAccountSchema),
    defaultValues: {
      name: account.name ?? "",
      role: account.role === "admin" ? "admin" : "staff",
      permissions: permissionGrid(account.permissions),
    },
  });

  async function onSubmit(values: EditAccountFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updateAccount(account.id, values);
      if (result.ok) {
        toast.success("Account updated.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-2">
          <Label htmlFor="edit-account-email">Email</Label>
          {/* Not an RHF-managed field (no FormField wrapper) — email is set
              once at creation, so this is display-only here. Supabase
              password/email changes are out of scope in this form (handled
              by the account owner's own forgot-password flow, 02-02).
              FormLabel/FormControl are intentionally NOT used since both
              require a <FormField> ancestor providing field context. */}
          <Input
            id="edit-account-email"
            value={account.email}
            type="email"
            disabled
            readOnly
          />
        </div>

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                items={ROLE_ITEMS}
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <PermissionFields
          control={form.control}
          setPermissions={(grid) =>
            form.setValue("permissions", grid, { shouldDirty: true })
          }
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Module x View/Create/Edit/Delete grid shared by both forms. Admins have
 * every permission (lib/auth/permissions.ts, has_module_permission()), so
 * for the Admin role every box shows checked and locked, and nothing is
 * stored. Ticking Create/Edit/Delete also ticks View; unticking View clears
 * the row.
 */
function PermissionFields<T extends EditAccountFormValues>({
  control,
  setPermissions,
}: {
  control: Control<T>;
  setPermissions: (grid: PermissionGrid) => void;
}) {
  const isAdmin = useWatch({ control, name: "role" as Path<T> }) === "admin";
  const grid = useWatch({ control, name: "permissions" as Path<T> }) as PermissionGrid;

  function toggle(module: (typeof MODULES)[number]["key"], action: Action, checked: boolean) {
    setPermissions({ ...grid, [module]: toggleGridCell(grid[module] ?? {}, action, checked) });
  }

  return (
    <FormSection title="Permissions">
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? "Admins can do everything, including managing users."
          : "New staff start with nothing. Tick only what this person needs. Create, Edit and Delete also turn on View."}
      </p>
      <div className="overflow-x-auto rounded-lg border border-input">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-input bg-muted/50">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Module
              </th>
              {ACTIONS.map((action) => (
                <th key={action} scope="col" className="w-16 px-1 py-2 text-center font-medium">
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((module) => {
              const supported = module.actions as readonly Action[];
              const help = ACTIONS.flatMap((a) =>
                supported.includes(a) && module.help[a as keyof typeof module.help]
                  ? [`${ACTION_LABELS[a]}: ${module.help[a as keyof typeof module.help]}`]
                  : []
              );
              return (
                <tr key={module.key} className="border-b border-input last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                    <span className="font-medium">{module.label}</span>
                    {help.map((line) => (
                      <span key={line} className="block text-xs text-muted-foreground">
                        {line}
                      </span>
                    ))}
                  </th>
                  {ACTIONS.map((action) => (
                    <td key={action} className="px-1 py-2 text-center align-top">
                      {supported.includes(action) ? (
                        <Checkbox
                          className="mx-auto"
                          aria-label={`${module.label}: ${ACTION_LABELS[action]}`}
                          checked={isAdmin || grid?.[module.key]?.[action] === true}
                          disabled={isAdmin}
                          onCheckedChange={(checked) => toggle(module.key, action, checked === true)}
                        />
                      ) : (
                        <span className="text-muted-foreground" aria-hidden>
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FormSection>
  );
}
