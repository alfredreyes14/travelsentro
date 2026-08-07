"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from "@/components/ui/form";
import type { Profile } from "@/lib/auth/dal";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

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
      canManagePackages: false,
      canMessageCustomers: false,
      canEditCrm: false,
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
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormSection title="Permissions">
          <FormField
            control={form.control}
            name="canManagePackages"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Manage Packages
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canMessageCustomers"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Message Customers
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canEditCrm"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">Edit CRM Data</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-start"
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
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormSection title="Permissions">
          <FormField
            control={form.control}
            name="canManagePackages"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Manage Packages
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canMessageCustomers"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Message Customers
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canEditCrm"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">Edit CRM Data</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-start"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}
