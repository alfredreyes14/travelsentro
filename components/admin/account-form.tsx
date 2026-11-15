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
import { Switch } from "@/components/ui/switch";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from "@/components/ui/form";
import type { Profile } from "@/lib/auth/dal";
import {
  NO_PERMISSIONS,
  PERMISSION_ITEMS,
} from "@/components/admin/account-permissions";

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
      ...NO_PERMISSIONS,
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

        <PermissionFields control={form.control} />

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
      canManagePackages: account.can_manage_packages,
      canMessageCustomers: account.can_message_customers,
      canEditCrm: account.can_edit_crm,
      canManageVouchers: account.can_manage_vouchers,
      canManageQuotes: account.can_manage_quotes,
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

        <PermissionFields control={form.control} />

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
 * Permission switches shared by both forms. Admins always have every
 * permission (lib/auth/dal.ts, has_permission()), so for the Admin role the
 * switches show on and locked; actions/users.ts saves them all as true.
 */
function PermissionFields<T extends EditAccountFormValues>({
  control,
}: {
  control: Control<T>;
}) {
  const isAdmin = useWatch({ control, name: "role" as Path<T> }) === "admin";

  return (
    <FormSection title="Permissions">
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? "Admins have every permission, plus user management."
          : "Staff can view Leads. Turn on only what this person needs."}
      </p>
      {PERMISSION_ITEMS.map((item) => (
        <FormField
          key={item.field}
          control={control}
          name={item.field as Path<T>}
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border border-input p-3">
              <div className="flex flex-col gap-1">
                <FormLabel className="cursor-pointer">{item.label}</FormLabel>
                <FormDescription className="text-xs">
                  {item.covers}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={isAdmin || field.value === true}
                  disabled={isAdmin}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      ))}
    </FormSection>
  );
}
