import { format, parseISO } from "date-fns";

import { ContractEndChip } from "./contract-end-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LabeledValue } from "@/lib/crm/contact-schema";

function LabeledList({
  title,
  entries,
}: {
  title: string;
  entries: LabeledValue[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{title}</span>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry, index) => (
          <li key={`${entry.value}-${index}`}>
            {entry.value}
            {entry.label ? (
              <span className="text-muted-foreground"> · {entry.label}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A B2B client's representative, extra contact details and contract dates. */
export function ContactB2bCard({
  repName,
  repPosition,
  otherEmails,
  otherPhones,
  contractStart,
  contractEnd,
}: {
  repName: string | null;
  repPosition: string | null;
  otherEmails: LabeledValue[];
  otherPhones: LabeledValue[];
  contractStart: string | null;
  contractEnd: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          <span className="text-muted-foreground">
            Authorized representative:{" "}
          </span>
          {repName ?? "—"}
          {repName && repPosition ? (
            <span className="text-muted-foreground"> · {repPosition}</span>
          ) : null}
        </p>

        <LabeledList title="Other emails" entries={otherEmails} />
        <LabeledList title="Other numbers" entries={otherPhones} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p>
            <span className="text-muted-foreground">Contract start: </span>
            {contractStart ? format(parseISO(contractStart), "MMM d, yyyy") : "—"}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Contract end:</span>
            <ContractEndChip end={contractEnd} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
