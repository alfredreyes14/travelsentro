"use client";

import { useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
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

/** Price per pax, discount, duration and remarks -- shared by packages and quotes. */
export function PricingFields() {
  const form = useFormContext<ItineraryContentValues>();

  return (
    <>
      <FormField
        control={form.control}
        name="pricePerPax"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price per pax (PHP)</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="number"
                min={1}
                prefix="₱"
                onChange={(event) =>
                  field.onChange(event.target.valueAsNumber)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="discountAmount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Discount (PHP, optional)</FormLabel>
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
              Added on top of the price per pax to show a struck-through
              &quot;was&quot; price (e.g. ₱100 price + ₱50 discount
              shows as ₱150 crossed out, ₱100 charged).
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="durationLabel"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="text"
                placeholder="3 days, 2 nights"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="remarks"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Remarks (optional)</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
