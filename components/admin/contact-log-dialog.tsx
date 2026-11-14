"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

import { logContact } from "@/actions/contact-logs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_LOG_CHANNELS,
  CONTACT_LOG_CHANNEL_LABELS,
  type ContactLogChannel,
} from "@/lib/crm/contact-logs";

const LOG_ERROR_MESSAGE = "Something went wrong logging this contact. Please try again.";

/** <input type="datetime-local"> value for a moment, in the browser's time zone. */
function toLocalInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Logs a contact made outside the panel (a call, a WhatsApp chat, a
 * meeting), which updates the lead's "Last contact" date. Emails and SMS
 * sent from the panel are tracked without this.
 */
export function ContactLogDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<ContactLogChannel>("call");
  const [contactedAt, setContactedAt] = useState("");
  const [maxContactedAt, setMaxContactedAt] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset to "now" each time the dialog opens, not at first render.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const now = toLocalInputValue(new Date());
      setChannel("call");
      setContactedAt(now);
      setMaxContactedAt(now);
      setNote("");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const when = new Date(contactedAt);
    if (!contactedAt || Number.isNaN(when.getTime())) {
      toast.error("Pick when you contacted this lead.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await logContact(contactId, {
        channel,
        contactedAt: when.toISOString(),
        note,
      });
      if (result.ok) {
        toast.success("Contact logged.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(LOG_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Log contact</DialogTitle>
            <DialogDescription>
              Record a call, chat or meeting with {contactName}. Emails and SMS
              sent from here are tracked automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-log-channel" className="text-sm font-medium">
              How
            </label>
            <Select
              items={CONTACT_LOG_CHANNEL_LABELS}
              value={channel}
              onValueChange={(value) => setChannel(value as ContactLogChannel)}
            >
              <SelectTrigger id="contact-log-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_LOG_CHANNELS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CONTACT_LOG_CHANNEL_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-log-when" className="text-sm font-medium">
              When
            </label>
            <Input
              id="contact-log-when"
              type="datetime-local"
              value={contactedAt}
              max={maxContactedAt}
              onChange={(event) => setContactedAt(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-log-note" className="text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="contact-log-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Sent Bali rates, will decide by Friday"
              maxLength={2000}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Log contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
