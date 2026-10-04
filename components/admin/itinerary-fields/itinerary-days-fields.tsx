"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

export function ItineraryDaysFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const itineraryArray = useFieldArray({
    control: form.control,
    name: "itinerary",
  });

  return (
    <>
      {itineraryArray.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-[16px] leading-[1.2] font-semibold">
              Day {index + 1}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                onRequestRemove(
                  Boolean(
                    form.getValues(`itinerary.${index}.title`) ||
                      form.getValues(`itinerary.${index}.description`)
                  ),
                  `Day ${index + 1}`,
                  () => itineraryArray.remove(index)
                )
              }
            >
              Remove day
            </Button>
          </div>
          <FormField
            control={form.control}
            name={`itinerary.${index}.title`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} type="text" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`itinerary.${index}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => itineraryArray.append({ title: "", description: "" })}
      >
        Add day
      </Button>
    </>
  );
}
