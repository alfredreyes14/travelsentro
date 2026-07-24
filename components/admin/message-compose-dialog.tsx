"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  sendBulkEmail,
  sendBulkSms,
  sendIndividualEmail,
  sendIndividualSms,
  getRemainingEmailQuota,
} from "@/actions/messages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ComposeContact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  opted_out: boolean;
};

type ActiveTab = "email" | "sms";

/**
 * Shared individual/bulk Email+SMS compose UI (D-06/UI-SPEC's explicit "one
 * shared component" instruction). `contacts` has length 1 for individual
 * mode. Individual sends are awaited inline (never fire-and-forget, Pitfall
 * 4) -- failure keeps the dialog open and re-enables the submit button so
 * staff can retry without re-typing. Bulk sends go through a confirmation
 * AlertDialog, and bulk email additionally checks the rolling-24h quota
 * before that confirmation ever opens (D-07).
 */
export function MessageComposeDialog({
  contacts,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: {
  contacts: ComposeContact[];
  mode: "individual" | "bulk";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("email");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [quotaBanner, setQuotaBanner] = useState<string | null>(null);

  const primaryContact = contacts[0];
  const title =
    mode === "individual"
      ? `Message ${primaryContact?.name ?? ""}`
      : `Message ${contacts.length} contacts`;

  const smsDisabled = mode === "individual" && !primaryContact?.phone;
  const noPhoneCount = contacts.filter((c) => !c.phone).length;
  const smsSegments = Math.max(1, Math.ceil(smsBody.length / 160));

  function resetForm() {
    setSubject("");
    setEmailBody("");
    setSmsBody("");
    setQuotaBanner(null);
    setIsConfirmOpen(false);
    setActiveTab("email");
  }

  function handleDialogOpenChange(next: boolean) {
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  }

  async function handleIndividualSubmit() {
    setIsSubmitting(true);
    try {
      const result =
        activeTab === "email"
          ? await sendIndividualEmail(primaryContact.id, {
              subject,
              body: emailBody,
            })
          : await sendIndividualSms(primaryContact.id, { body: smsBody });

      if (result.ok) {
        toast.success(
          activeTab === "email"
            ? `Email sent to ${primaryContact.name}.`
            : `Text sent to ${primaryContact.name}.`
        );
        resetForm();
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkSubmitAttempt() {
    if (activeTab === "email") {
      setIsSubmitting(true);
      try {
        const remaining = await getRemainingEmailQuota();
        if (contacts.length > remaining) {
          setQuotaBanner(
            `Sending to ${contacts.length} contacts would exceed today's email limit (${remaining} left). Try again tomorrow or select fewer contacts.`
          );
          return;
        }
      } finally {
        setIsSubmitting(false);
      }
    }
    setQuotaBanner(null);
    setIsConfirmOpen(true);
  }

  async function handleBulkConfirm() {
    setIsSubmitting(true);
    try {
      const contactIds = contacts.map((c) => c.id);
      const result =
        activeTab === "email"
          ? await sendBulkEmail(contactIds, { subject, body: emailBody })
          : await sendBulkSms(contactIds, { body: smsBody });

      if (result.ok) {
        const { sent, failed, total } = result;
        if (failed === 0) {
          toast.success(`Message sent to ${sent} contacts.`);
        } else if (sent > 0) {
          toast.error(
            `Sent to ${sent} of ${total} contacts — ${failed} failed. Check Activity for details.`
          );
        } else {
          toast.error(
            "Something went wrong sending your messages. Please try again."
          );
        }
        resetForm();
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error);
        setIsConfirmOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {mode === "individual" && primaryContact?.opted_out ? (
          <p className="text-sm text-muted-foreground">
            This contact has opted out of bulk messages. Individual messages
            are still delivered normally.
          </p>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
        >
          <TabsList>
            <TabsTrigger value="email">Email</TabsTrigger>
            {smsDisabled ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <TabsTrigger value="sms" disabled>
                    SMS
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  This contact has no phone number on file
                </TooltipContent>
              </Tooltip>
            ) : (
              <TabsTrigger value="sms">SMS</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="email" className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="message-subject"
                className="text-sm font-medium"
              >
                Subject
              </label>
              <Input
                id="message-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="message-email-body"
                className="text-sm font-medium"
              >
                Message
              </label>
              <Textarea
                id="message-email-body"
                rows={5}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{name}}"} to insert the contact&apos;s name.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="flex flex-col gap-3 pt-2">
            {mode === "bulk" && noPhoneCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {noPhoneCount} selected contact(s) have no phone number and
                will be skipped.
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="message-sms-body"
                className="text-sm font-medium"
              >
                Message
              </label>
              <Textarea
                id="message-sms-body"
                rows={5}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {smsBody.length}/160 characters · {smsSegments} segment(s)
              </p>
              {mode === "bulk" ? (
                <p className="text-xs text-muted-foreground">
                  Bulk SMS sends the same message to everyone —{" "}
                  {"{{name}}"} isn&apos;t supported for text messages.
                </p>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>

        {quotaBanner ? (
          <p className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
            {quotaBanner}
          </p>
        ) : null}

        <Button
          onClick={
            mode === "individual"
              ? handleIndividualSubmit
              : handleBulkSubmitAttempt
          }
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Sending..."
            : activeTab === "email"
              ? "Send Email"
              : "Send SMS"}
        </Button>
      </DialogContent>

      {mode === "bulk" ? (
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Send to {contacts.length} contacts?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {activeTab === "email"
                  ? `This will send ${contacts.length} separate emails. This can't be undone.`
                  : `This will send ${contacts.length} text messages via SMS, charged per message. This can't be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSubmitting}
                onClick={handleBulkConfirm}
              >
                {isSubmitting ? "Sending..." : "Send"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </Dialog>
  );
}
