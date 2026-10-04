"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

export function TravelDatesFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const travelDatesArray = useFieldArray({
    control: form.control,
    name: "travelDates",
  });

  return (
    <>
      {travelDatesArray.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-[16px] leading-[1.2] font-semibold">
              Date {index + 1}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                onRequestRemove(
                  Boolean(
                    form.getValues(`travelDates.${index}.dateFrom`) ||
                      form.getValues(`travelDates.${index}.dateTo`) ||
                      form.getValues(`travelDates.${index}.additionalFee`)
                  ),
                  `Date ${index + 1}`,
                  () => travelDatesArray.remove(index)
                )
              }
            >
              Remove date
            </Button>
          </div>
          <FormField
            control={form.control}
            name={`travelDates.${index}.dateFrom`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>From</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`travelDates.${index}.dateTo`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>To</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`travelDates.${index}.additionalFee`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional fee (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={1}
                    prefix="₱"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? undefined
                          : event.target.valueAsNumber
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  e.g. a peak-season surcharge for this date.
                </FormDescription>
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
        onClick={() =>
          travelDatesArray.append({
            dateFrom: "",
            dateTo: "",
            additionalFee: undefined,
          })
        }
      >
        Add travel date
      </Button>
      {form.formState.errors.travelDates?.message ? (
        <p className="text-sm text-destructive">
          {form.formState.errors.travelDates.message}
        </p>
      ) : null}
    </>
  );
}
