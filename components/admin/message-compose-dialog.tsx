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
  sendBulkFollowUpEmail,
  sendBulkFollowUpText,
  sendFollowUpEmail,
  sendFollowUpText,
} from "@/actions/follow-ups";
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
import { withEmail } from "@/lib/crm/contact-label";
import { SITE_URL } from "@/lib/constants";
import {
  FOLLOW_UP_SMS_TEMPLATE,
  followUpEmailTemplate,
  trackedLinkLength,
} from "@/lib/follow-ups/templates";

type ComposeContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  opted_out: boolean;
};

type ActiveTab = "email" | "sms";

/**
 * Follow-up mode: drafts start from the follow-up templates, emails get
 * tracked chat buttons, texts a tracked link, and sending moves the lead
 * in the funnel (actions/follow-ups.ts). Parents key the dialog on `step`
 * so the draft refreshes after each send.
 */
export type ComposeFollowUp = { step: number; packageName?: string | null };

// The appended link's length, for the SMS counter (staging's host is a bit
// longer; close enough for a segment estimate).
const SMS_LINK_LENGTH = trackedLinkLength(SITE_URL);

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
  followUp,
}: {
  contacts: ComposeContact[];
  mode: "individual" | "bulk";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  followUp?: ComposeFollowUp;
}) {
  const draft = followUp
    ? {
        ...followUpEmailTemplate(followUp.step, followUp.packageName),
        sms: FOLLOW_UP_SMS_TEMPLATE,
      }
    : { subject: "", body: "", sms: "" };

  // null = staff haven't picked a tab yet, so the default below applies.
  const [tabChoice, setTabChoice] = useState<ActiveTab | null>(null);
  const [subject, setSubject] = useState(draft.subject);
  const [emailBody, setEmailBody] = useState(draft.body);
  const [smsBody, setSmsBody] = useState(draft.sms);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [quotaBanner, setQuotaBanner] = useState<string | null>(null);

  const primaryContact = contacts[0];
  const verb = followUp ? "Follow up with" : "Message";
  const title =
    mode === "individual"
      ? `${verb} ${primaryContact?.name ?? ""}`
      : `${verb} ${contacts.length} contacts`;

  const emailDisabled = mode === "individual" && !primaryContact?.email?.trim();
  const smsDisabled = mode === "individual" && !primaryContact?.phone;
  // A phone-only contact opens straight on SMS.
  const activeTab: ActiveTab = tabChoice ?? (emailDisabled ? "sms" : "email");
  const emailRecipientCount = withEmail(contacts).length;
  const noEmailCount = contacts.length - emailRecipientCount;
  const noPhoneCount = contacts.filter((c) => !c.phone).length;
  const smsLength = smsBody.length + (followUp ? SMS_LINK_LENGTH : 0);
  const smsSegments = Math.max(1, Math.ceil(smsLength / 160));

  function resetForm() {
    setSubject(draft.subject);
    setEmailBody(draft.body);
    setSmsBody(draft.sms);
    setQuotaBanner(null);
    setIsConfirmOpen(false);
    setTabChoice(null);
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
      const sendEmail = followUp ? sendFollowUpEmail : sendIndividualEmail;
      const sendSms = followUp ? sendFollowUpText : sendIndividualSms;
      const result =
        activeTab === "email"
          ? await sendEmail(primaryContact.id, { subject, body: emailBody })
          : await sendSms(primaryContact.id, { body: smsBody });

      if (result.ok) {
        const what = activeTab === "email" ? "Email" : "Text";
        toast.success(
          followUp
            ? `Follow-up ${what.toLowerCase()} sent to ${primaryContact.name}.`
            : `${what} sent to ${primaryContact.name}.`
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
      if (emailRecipientCount === 0) {
        setQuotaBanner("None of the selected contacts have an email address.");
        return;
      }
      setIsSubmitting(true);
      try {
        const remaining = await getRemainingEmailQuota();
        if (emailRecipientCount > remaining) {
          setQuotaBanner(
            `Sending to ${emailRecipientCount} contacts would exceed today's email limit (${remaining} left). Try again tomorrow or select fewer contacts.`
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
      const bulkEmail = followUp ? sendBulkFollowUpEmail : sendBulkEmail;
      const bulkSms = followUp ? sendBulkFollowUpText : sendBulkSms;
      const result =
        activeTab === "email"
          ? await bulkEmail(contactIds, { subject, body: emailBody })
          : await bulkSms(contactIds, { body: smsBody });

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

        {followUp ? (
          <p className="text-sm text-muted-foreground">
            {mode === "individual" ? `Follow-up #${followUp.step}. ` : ""}
            Emails get &ldquo;Chat on Messenger&rdquo; and &ldquo;Chat on
            WhatsApp&rdquo; buttons; texts get a chat link. Sending moves
            the lead to Follow-up, and a click moves them to Inquiry
            (Discovery for B2B).
          </p>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setTabChoice(value as ActiveTab)}
        >
          <TabsList>
            {emailDisabled ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <TabsTrigger value="email" disabled>
                    Email
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  This contact has no email address on file
                </TooltipContent>
              </Tooltip>
            ) : (
              <TabsTrigger value="email">Email</TabsTrigger>
            )}
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
            {mode === "bulk" && noEmailCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {noEmailCount} selected contact(s) have no email address and
                will be skipped.
              </p>
            ) : null}
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
                Use {"{{name}}"} to insert the contact&apos;s name
                {followUp ? " (in the subject too)" : ""}.
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
                {smsLength}/160 characters
                {followUp ? " (with link)" : ""} · {smsSegments} segment(s)
              </p>
              {followUp ? (
                <p className="text-xs text-muted-foreground">
                  A tracked Messenger link is added at the end. Use{" "}
                  {"{{name}}"} to insert the contact&apos;s name.
                </p>
              ) : null}
              {mode === "bulk" && !followUp ? (
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
            : `Send ${followUp ? "Follow-up " : ""}${activeTab === "email" ? "Email" : "SMS"}`}
        </Button>
      </DialogContent>

      {mode === "bulk" ? (
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Send to{" "}
                {activeTab === "email" ? emailRecipientCount : contacts.length}{" "}
                contacts?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {activeTab === "email"
                  ? `This will send ${emailRecipientCount} separate emails. This can't be undone.`
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
