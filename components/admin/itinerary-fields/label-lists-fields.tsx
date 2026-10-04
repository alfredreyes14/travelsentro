"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

type LabelListName = "inclusions" | "exclusions" | "bringItems";

function LabelList({
  name,
  heading,
  itemLabel,
  addLabel,
  onRequestRemove,
}: {
  name: LabelListName;
  heading: string;
  itemLabel: string;
  addLabel: string;
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const listArray = useFieldArray({ control: form.control, name });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
        {heading}
      </h3>
      {listArray.fields.map((field, index) => (
        <div key={field.id} className="flex items-end gap-2">
          <span className="pt-2 self-start text-sm text-muted-foreground">
            {index + 1}.
          </span>
          <FormField
            control={form.control}
            name={`${name}.${index}.label`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input {...field} type="text" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              onRequestRemove(
                Boolean(form.getValues(`${name}.${index}.label`)),
                `${itemLabel} ${index + 1}`,
                () => listArray.remove(index)
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => listArray.append({ label: "" })}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/** Included / Excluded / What to Bring -- the Inclusions tab body. */
export function LabelListsFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  return (
    <>
      <LabelList
        name="inclusions"
        heading="Included"
        itemLabel="Included item"
        addLabel="Add included item"
        onRequestRemove={onRequestRemove}
      />
      <LabelList
        name="exclusions"
        heading="Excluded"
        itemLabel="Excluded item"
        addLabel="Add excluded item"
        onRequestRemove={onRequestRemove}
      />
      <LabelList
        name="bringItems"
        heading="What to Bring"
        itemLabel="Item to bring"
        addLabel="Add item to bring"
        onRequestRemove={onRequestRemove}
      />
    </>
  );
}
