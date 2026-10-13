"use client";

import Link from "next/link";
import {
  useFieldArray,
  useFormContext,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { ContactTagPicker } from "./contact-tag-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { ContactFormValues } from "@/lib/crm/contact-schema";
import { SERVICE_KEYS, SERVICE_LABELS } from "@/lib/crm/services";

/**
 * Field groups shared by ContactEditForm and ContactAddDialog. Each reads
 * the form from context, so it must render inside a <Form> built on
 * ContactFormValues.
 */

/**
 * The first validation message anywhere in a form's errors. Passed to
 * handleSubmit's invalid callback so Save never fails silently: an error on
 * one tag among several, or on a field hidden for this client type, has no
 * field on screen to show it.
 */
export function firstErrorMessage(errors: FieldErrors): string | null {
  for (const [key, value] of Object.entries(errors)) {
    // `ref` is the field's DOM element, not a nested error.
    if (key === "ref" || !value || typeof value !== "object") continue;
    if ("message" in value && typeof value.message === "string") {
      if (value.message) return value.message;
      continue;
    }
    const nested = firstErrorMessage(value as FieldErrors);
    if (nested) return nested;
  }
  return null;
}

/** Name, email, phone and tags -- the fields every contact has. */
export function ContactCoreFields({
  nameLabel,
  existingTags,
  duplicateContactId,
}: {
  nameLabel: string;
  existingTags: string[];
  /** Set when the server reported another contact already uses this email. */
  duplicateContactId: string | null;
}) {
  const form = useFormContext<ContactFormValues>();

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{nameLabel}</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" autoComplete="off" />
              </FormControl>
              <FormMessage />
              {duplicateContactId ? (
                <Link
                  href={`/admin/crm/${duplicateContactId}`}
                  className="text-sm text-primary underline underline-offset-4"
                >
                  Open the existing contact
                </Link>
              ) : null}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} type="tel" autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tags</FormLabel>
            <ContactTagPicker
              value={field.value}
              onChange={field.onChange}
              existingTags={existingTags}
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/** B2C: what the customer availed, with a free-text box when Other is ticked. */
export function ContactServicesFields() {
  const form = useFormContext<ContactFormValues>();
  const services = useWatch({ control: form.control, name: "servicesAvailed" });

  return (
    <>
      <FormField
        control={form.control}
        name="servicesAvailed"
        render={({ field }) => (
          <FormItem>
            <p className="text-sm font-medium">Services availed</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value.includes(key)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...field.value, key]
                        : field.value.filter((k) => k !== key);
                      // Keep the stored order the same as the list's.
                      field.onChange(SERVICE_KEYS.filter((k) => next.includes(k)));
                    }}
                  />
                  {SERVICE_LABELS[key]}
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {services.includes("other") ? (
        <FormField
          control={form.control}
          name="servicesOther"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Other services</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe what else this customer availed"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}

/** B2B: the authorized representative. */
export function ContactRepFields() {
  const form = useFormContext<ContactFormValues>();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="repName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authorized representative</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="repPosition"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Position</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function LabeledListField({
  name,
  title,
  addLabel,
  inputType,
}: {
  name: "otherEmails" | "otherPhones";
  title: string;
  addLabel: string;
  inputType: "email" | "tel";
}) {
  const form = useFormContext<ContactFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name,
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <FormField
            control={form.control}
            name={`${name}.${index}.label`}
            render={({ field }) => (
              <FormItem className="w-32 shrink-0">
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    aria-label="Label"
                    placeholder="Label"
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`${name}.${index}.value`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    type={inputType}
                    aria-label={title}
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove"
            onClick={() => remove(index)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {fields.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => append({ label: "", value: "" })}
        >
          <PlusIcon />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** B2B: extra emails and numbers, and the contract dates. */
export function ContactB2bDetailFields() {
  const form = useFormContext<ContactFormValues>();

  return (
    <>
      <LabeledListField
        name="otherEmails"
        title="Other emails"
        addLabel="Add email"
        inputType="email"
      />
      <LabeledListField
        name="otherPhones"
        title="Other numbers"
        addLabel="Add number"
        inputType="tel"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="contractStart"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contract start</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contractEnd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contract end</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormDescription>
                Turns yellow 3 months before and red 1 month before.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
