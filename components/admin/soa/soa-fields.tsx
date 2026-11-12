"use client";

import {
  useFieldArray,
  useFormContext,
  useWatch,
  type ControllerRenderProps,
} from "react-hook-form";
import { Trash2Icon } from "lucide-react";

import type { SoaFormValues } from "./soa-form-schema";
import type { RequestRemove } from "@/components/admin/itinerary-fields/remove-confirmation";
import {
  computeSoaTotals,
  discountLabel,
  formatPeso,
} from "@/lib/soa/totals";
import type { SoaVoucherOption } from "@/lib/soa/soa-options";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";

/** New rows start with blank number inputs rather than a "0" to delete. */
export const BLANK_NUMBER = undefined as unknown as number;

/** Props for a money/quantity <Input>: "" while blank, a number otherwise. */
function numberInputProps(
  field: Pick<ControllerRenderProps, "name" | "ref" | "onBlur" | "onChange" | "value">
) {
  const value: unknown = field.value;
  return {
    name: field.name,
    ref: field.ref,
    onBlur: field.onBlur,
    value: typeof value === "number" && Number.isFinite(value) ? value : "",
    type: "number" as const,
    inputMode: "decimal" as const,
    step: "0.01",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      field.onChange(
        event.target.value === "" ? undefined : event.target.valueAsNumber
      ),
  };
}

function useLiveTotals() {
  const { control } = useFormContext<SoaFormValues>();
  const [lineItems, discounts, payments] = useWatch({
    control,
    name: ["lineItems", "discounts", "payments"],
  });
  return computeSoaTotals({
    lineItems: lineItems ?? [],
    discounts: discounts ?? [],
    payments: payments ?? [],
  });
}

function RowHeader({
  title,
  onRemove,
  removeLabel,
}: {
  title: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-heading text-[16px] leading-[1.2] font-semibold">
        {title}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <Trash2Icon className="size-4" />
        Remove
      </Button>
    </div>
  );
}

function ArrayError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

export function SoaLineItemsFields({ onRequestRemove }: { onRequestRemove: RequestRemove }) {
  const form = useFormContext<SoaFormValues>();
  const items = useFieldArray({ control: form.control, name: "lineItems" });
  const totals = useLiveTotals();

  return (
    <div className="flex flex-col gap-3">
      {items.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <RowHeader
            title={`Item ${index + 1}`}
            removeLabel={`Remove item ${index + 1}`}
            onRemove={() =>
              onRequestRemove(
                Boolean(form.getValues(`lineItems.${index}.description`)),
                `Item ${index + 1}`,
                () => items.remove(index)
              )
            }
          />
          <FormField
            control={form.control}
            name={`lineItems.${index}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input {...field} type="text" placeholder="Boracay 3D2N package – Adult" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[110px_1fr_1fr]">
            <FormField
              control={form.control}
              name={`lineItems.${index}.quantity`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qty</FormLabel>
                  <FormControl>
                    <Input {...numberInputProps(field)} min={0} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`lineItems.${index}.unitPrice`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit price</FormLabel>
                  <FormControl>
                    <Input {...numberInputProps(field)} min={0} prefix="₱" placeholder="0.00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
              <span className="text-sm font-medium">Amount</span>
              <span className="flex h-8 items-center justify-end rounded-lg bg-muted px-2.5 text-sm font-medium tabular-nums">
                {formatPeso(totals.lineAmounts[index] ?? 0)}
              </span>
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() =>
          items.append({ description: "", quantity: 1, unitPrice: BLANK_NUMBER })
        }
      >
        Add line item
      </Button>
      <ArrayError
        message={
          form.formState.errors.lineItems?.message ??
          form.formState.errors.lineItems?.root?.message
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discounts & vouchers
// ---------------------------------------------------------------------------

const DISCOUNT_TYPE_ITEMS = [
  { value: "amount", label: "Fixed amount (₱)" },
  { value: "percent", label: "Percent of subtotal (%)" },
];

function voucherOptionLabel(voucher: SoaVoucherOption): string {
  return `${voucher.title} – ${voucher.valueLabel}${voucher.code ? ` (${voucher.code})` : ""}`;
}

export function SoaDiscountsFields({
  vouchers,
  onRequestRemove,
}: {
  vouchers: SoaVoucherOption[];
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<SoaFormValues>();
  const discounts = useFieldArray({ control: form.control, name: "discounts" });
  const watched = useWatch({ control: form.control, name: "discounts" }) ?? [];
  const contactId = useWatch({ control: form.control, name: "contactId" });
  const totals = useLiveTotals();

  // The linked contact's own vouchers first, then the rest.
  const sortedVouchers = [...vouchers].sort(
    (a, b) =>
      Number(b.contactId === contactId && !!contactId) -
      Number(a.contactId === contactId && !!contactId)
  );

  return (
    <div className="flex flex-col gap-3">
      {discounts.fields.map((field, index) => {
        const row = watched[index];
        const isVoucher = row?.source === "voucher";
        const selectedVoucher =
          vouchers.find((voucher) => voucher.id === row?.voucherId) ?? null;
        const title = isVoucher ? `Voucher ${index + 1}` : `Discount ${index + 1}`;

        return (
          <div
            key={field.id}
            className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
          >
            <RowHeader
              title={title}
              removeLabel={`Remove ${title}`}
              onRemove={() =>
                onRequestRemove(
                  Boolean(form.getValues(`discounts.${index}.label`)),
                  title,
                  () => discounts.remove(index)
                )
              }
            />

            {isVoucher && vouchers.length > 0 ? (
              <FormItem>
                <FormLabel>Pick from Vouchers (optional)</FormLabel>
                <Combobox
                  items={sortedVouchers}
                  value={selectedVoucher}
                  onValueChange={(voucher: SoaVoucherOption | null) => {
                    const opts = { shouldDirty: true, shouldValidate: false };
                    form.setValue(`discounts.${index}.voucherId`, voucher?.id ?? "", opts);
                    if (voucher) {
                      form.setValue(`discounts.${index}.label`, voucher.title, opts);
                      form.setValue(`discounts.${index}.voucherCode`, voucher.code ?? "", opts);
                    }
                  }}
                  itemToStringLabel={voucherOptionLabel}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput placeholder="Search vouchers..." />
                    {selectedVoucher ? <ComboboxClear /> : <ComboboxTrigger />}
                  </ComboboxInputGroup>
                  <ComboboxPortal>
                    <ComboboxPositioner>
                      <ComboboxPopup>
                        <ComboboxEmpty>No vouchers found.</ComboboxEmpty>
                        <ComboboxList>
                          {(voucher: SoaVoucherOption) => (
                            <ComboboxItem key={voucher.id} value={voucher}>
                              {voucherOptionLabel(voucher)}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxPopup>
                    </ComboboxPositioner>
                  </ComboboxPortal>
                </Combobox>
                {selectedVoucher ? (
                  <FormDescription>
                    Voucher value: <span className="font-medium">{selectedVoucher.valueLabel}</span>.
                    Enter the amount it takes off below.
                  </FormDescription>
                ) : null}
              </FormItem>
            ) : null}

            <div className={isVoucher ? "grid gap-3 sm:grid-cols-[1fr_200px]" : "grid gap-3"}>
              <FormField
                control={form.control}
                name={`discounts.${index}.label`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isVoucher ? "Voucher name" : "Discount name"}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder={isVoucher ? "Partner hotel voucher" : "Early bird discount"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isVoucher ? (
                <FormField
                  control={form.control}
                  name={`discounts.${index}.voucherCode`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} type="text" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
              <FormField
                control={form.control}
                name={`discounts.${index}.type`}
                render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Type</FormLabel>
                    <Select
                      items={DISCOUNT_TYPE_ITEMS}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DISCOUNT_TYPE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`discounts.${index}.value`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{row?.type === "percent" ? "Percent" : "Amount"}</FormLabel>
                    <FormControl>
                      <Input
                        {...numberInputProps(field)}
                        min={0}
                        prefix={row?.type === "percent" ? undefined : "₱"}
                        suffix={row?.type === "percent" ? "%" : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Less</span>
                <span className="flex h-8 items-center justify-end rounded-lg bg-muted px-2.5 text-sm font-medium text-destructive tabular-nums">
                  {formatPeso(-(totals.discountAmounts[index] ?? 0))}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            discounts.append({
              source: "discount",
              label: "",
              type: "amount",
              value: BLANK_NUMBER,
              voucherId: "",
              voucherCode: "",
            })
          }
        >
          Add discount
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            discounts.append({
              source: "voucher",
              label: "",
              type: "amount",
              value: BLANK_NUMBER,
              voucherId: "",
              voucherCode: "",
            })
          }
        >
          Add voucher
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments received
// ---------------------------------------------------------------------------

export function SoaPaymentsFields({
  onRequestRemove,
  defaultDate,
}: {
  onRequestRemove: RequestRemove;
  defaultDate: () => string;
}) {
  const form = useFormContext<SoaFormValues>();
  const payments = useFieldArray({ control: form.control, name: "payments" });

  return (
    <div className="flex flex-col gap-3">
      {payments.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <RowHeader
            title={`Payment ${index + 1}`}
            removeLabel={`Remove payment ${index + 1}`}
            onRemove={() =>
              onRequestRemove(
                Number.isFinite(form.getValues(`payments.${index}.amount`)),
                `Payment ${index + 1}`,
                () => payments.remove(index)
              )
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[160px_1fr_1fr]">
            <FormField
              control={form.control}
              name={`payments.${index}.date`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`payments.${index}.amount`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input {...numberInputProps(field)} min={0} prefix="₱" placeholder="0.00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`payments.${index}.label`}
              render={({ field }) => (
                <FormItem className="col-span-2 sm:col-span-1">
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="text"
                      placeholder="Downpayment via GCash"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() =>
          payments.append({ date: defaultDate(), label: "", amount: BLANK_NUMBER })
        }
      >
        Add payment
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live summary
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className ?? ""}`}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

export function SoaSummary() {
  const { control } = useFormContext<SoaFormValues>();
  const discounts = useWatch({ control, name: "discounts" }) ?? [];
  const totals = useLiveTotals();
  const isCredit = totals.balance < 0;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <SummaryRow label="Subtotal" value={formatPeso(totals.subtotal)} />
      {discounts.map((discount, index) => (
        <SummaryRow
          key={index}
          label={discountLabel(discount)}
          value={formatPeso(-(totals.discountAmounts[index] ?? 0))}
          className="text-destructive"
        />
      ))}
      <SummaryRow
        label="Total amount"
        value={formatPeso(totals.total)}
        className="border-t pt-1.5 font-semibold"
      />
      {totals.totalPaid > 0 ? (
        <SummaryRow label="Payments received" value={formatPeso(-totals.totalPaid)} />
      ) : null}
      <SummaryRow
        label={isCredit ? "Credit balance" : "Balance due"}
        value={formatPeso(Math.abs(totals.balance))}
        className="mt-1 rounded-lg bg-primary px-3 py-2 text-base font-semibold text-primary-foreground"
      />
    </div>
  );
}
