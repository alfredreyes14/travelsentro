"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { sendSoaEmail } from "@/actions/soa";
import type { SoaEmailDefaults } from "./soa-shared";
import { defaultSoaEmail, soaEmailSchema, type SoaEmailValues } from "@/lib/soa/email-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

function SendForm({
  soaId,
  defaults,
  onSent,
}: {
  soaId: string;
  defaults: SoaEmailDefaults;
  onSent: () => void;
}) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const form = useForm<SoaEmailValues>({
    resolver: zodResolver(soaEmailSchema),
    defaultValues: {
      to: defaults.contactEmail ?? "",
      ...defaultSoaEmail(defaults),
    },
  });

  async function onSubmit(values: SoaEmailValues) {
    setIsSending(true);
    try {
      const result = await sendSoaEmail(soaId, values);
      if (result.ok) {
        toast.success(`${defaults.soaNo} sent to ${values.to}.`);
        onSent();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't send the email. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField
          control={form.control}
          name="to"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To</FormLabel>
              <FormControl>
                <Input {...field} type="email" placeholder="customer@example.com" />
              </FormControl>
              {!defaults.contactEmail ? (
                <FormDescription>
                  No CRM email on file for {defaults.billToName} — type one in.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input {...field} type="text" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea {...field} rows={6} />
              </FormControl>
              <FormDescription>The SOA is attached to the email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={isSending} className="self-end">
          {isSending ? "Sending..." : "Send"}
        </Button>
      </form>
    </Form>
  );
}

export function SoaSendDialog({
  open,
  onOpenChange,
  soaId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  soaId: string;
  defaults: SoaEmailDefaults;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {defaults.soaNo}</DialogTitle>
          <DialogDescription>Sends the SOA as an attachment.</DialogDescription>
        </DialogHeader>
        {open ? (
          <SendForm soaId={soaId} defaults={defaults} onSent={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
