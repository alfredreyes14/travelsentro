"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";

import { updateStage } from "@/actions/crm";
import { updateOptOut } from "@/actions/messages";
import {
  ContactActivity,
  type CrmDetailInquiry,
  type CrmDetailMessage,
} from "./contact-activity";
import { ContactB2bCard } from "./contact-b2b-card";
import { ContactConvertDialog } from "./contact-convert-dialog";
import { ContactEditForm } from "./contact-edit-form";
import { ContactStageChip } from "./contact-stage-chip";
import { MessageComposeDialog } from "./message-compose-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ContactFormValues, LabeledValue } from "@/lib/crm/contact-schema";
import { SERVICE_LABELS, type ServiceKey } from "@/lib/crm/services";
import {
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";
import { cn } from "@/lib/utils";

const STAGE_ERROR_MESSAGE =
  "Something went wrong updating the stage. Please try again.";
const OPT_OUT_ERROR_MESSAGE =
  "Something went wrong updating this contact's opt-out status. Please try again.";

export type CrmDetailContact = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  clientType: ClientType;
  stage: ContactStage;
  tags: string[];
  opted_out: boolean;
  servicesAvailed: ServiceKey[];
  servicesOther: string | null;
  repName: string | null;
  repPosition: string | null;
  otherEmails: LabeledValue[];
  otherPhones: LabeledValue[];
  contractStart: string | null;
  contractEnd: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

/**
 * The contact page's layout. Sections that need their own data (linked
 * quotes, documents) are rendered by the page and passed in as slots, so
 * this component stays a layout and never grows a section's logic.
 */
export function CrmDetail({
  contact,
  formValues,
  existingTags,
  inquiries,
  messages,
  canEdit,
  quotesSlot,
  documentsSlot,
}: {
  contact: CrmDetailContact;
  formValues: ContactFormValues;
  existingTags: string[];
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  canEdit: boolean;
  quotesSlot?: ReactNode;
  documentsSlot?: ReactNode;
}) {
  const router = useRouter();
  // Shows the picked stage at once; when the action settles it falls back
  // to contact.stage, which the action's revalidation has refreshed (or
  // left alone, on failure).
  const [stage, setOptimisticStage] = useOptimistic(contact.stage);
  const [optedOut, setOptedOut] = useState(contact.opted_out);
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);

  const isB2b = contact.clientType === "b2b";
  const otherType: ClientType = isB2b ? "b2c" : "b2b";
  const stageItems = Object.fromEntries(
    STAGES_BY_TYPE[contact.clientType].map((s) => [s, STAGE_LABELS[s]])
  );

  function handleStageChange(next: ContactStage) {
    startTransition(async () => {
      setOptimisticStage(next);
      try {
        const result = await updateStage(contact.id, next);
        if (!result.ok) toast.error(result.error);
      } catch {
        toast.error(STAGE_ERROR_MESSAGE);
      }
    });
  }

  function handleOptOutChange(checked: boolean) {
    const previous = optedOut;
    setOptedOut(checked);
    startTransition(async () => {
      try {
        const result = await updateOptOut(contact.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setOptedOut(previous);
        }
      } catch {
        toast.error(OPT_OUT_ERROR_MESSAGE);
        setOptedOut(previous);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[20px] leading-[1.2] font-semibold">
            {contact.name}
          </h1>
          <Badge variant="secondary">
            {CLIENT_TYPE_LABELS[contact.clientType]}
          </Badge>
          {canEdit ? (
            <Select
              items={stageItems}
              value={stage}
              onValueChange={(value) => handleStageChange(value as ContactStage)}
              disabled={isPending}
            >
              <SelectTrigger
                aria-label="Stage"
                className={cn("w-44", STAGE_CHIP_CLASSNAME[stage])}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES_BY_TYPE[contact.clientType].map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ContactStageChip stage={stage} />
          )}
          <Button onClick={() => setIsMessageOpen(true)}>
            <SendIcon className="size-4" />
            Message
          </Button>
          {canEdit ? (
            <Button variant="outline" onClick={() => setIsConvertOpen(true)}>
              Convert to {CLIENT_TYPE_LABELS[otherType]}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          {contact.created_by ? (
            <p>
              Added by {contact.created_by_name ?? "a staff member"} on{" "}
              {format(new Date(contact.created_at), "MMM d, yyyy")}
            </p>
          ) : (
            <p>Added {formatDistanceToNow(new Date(contact.created_at))} ago</p>
          )}
          {contact.updated_by ? (
            <p>
              Last updated by {contact.updated_by_name ?? "a staff member"}{" "}
              {formatDistanceToNow(new Date(contact.updated_at))} ago
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contact Info</CardTitle>
          {canEdit ? (
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger render={<Button variant="secondary" size="sm" />}>
                Edit Contact
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                </DialogHeader>
                <ContactEditForm
                  contactId={contact.id}
                  clientType={contact.clientType}
                  defaultValues={formValues}
                  existingTags={existingTags}
                  onSuccess={() => {
                    setIsEditOpen(false);
                    router.refresh();
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {contact.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Phone: </span>
            {contact.phone ?? "—"}
          </p>
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          {!isB2b ? (
            <div className="flex flex-col gap-1 pt-2">
              <span className="text-muted-foreground">Services availed</span>
              {contact.servicesAvailed.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {contact.servicesAvailed.map((key) => (
                    <Badge key={key} variant="secondary">
                      {SERVICE_LABELS[key]}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span>—</span>
              )}
              {contact.servicesAvailed.includes("other") &&
              contact.servicesOther ? (
                <p className="whitespace-pre-wrap">{contact.servicesOther}</p>
              ) : null}
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex items-center gap-2 pt-2">
              <Switch
                checked={optedOut}
                onCheckedChange={handleOptOutChange}
                disabled={isPending}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  Opted out of bulk messages
                </span>
                <span className="text-sm text-muted-foreground">
                  This contact won&apos;t receive bulk email or SMS sends.
                  Individual messages are still allowed.
                </span>
              </div>
            </div>
          ) : optedOut ? (
            <Badge variant="outline" className="w-fit">
              Opted out
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {isB2b ? (
        <>
          <ContactB2bCard
            repName={contact.repName}
            repPosition={contact.repPosition}
            otherEmails={contact.otherEmails}
            otherPhones={contact.otherPhones}
            contractStart={contact.contractStart}
            contractEnd={contact.contractEnd}
          />
          {documentsSlot}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Transaction history will appear here.
            </CardContent>
          </Card>
        </>
      ) : (
        quotesSlot
      )}

      <ContactActivity inquiries={inquiries} messages={messages} />

      <MessageComposeDialog
        contacts={[
          {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            opted_out: optedOut,
          },
        ]}
        mode="individual"
        open={isMessageOpen}
        onOpenChange={setIsMessageOpen}
        onSuccess={() => {
          setIsMessageOpen(false);
          router.refresh();
        }}
      />

      <ContactConvertDialog
        contactId={contact.id}
        contactName={contact.name}
        currentType={contact.clientType}
        open={isConvertOpen}
        onOpenChange={setIsConvertOpen}
      />
    </div>
  );
}
