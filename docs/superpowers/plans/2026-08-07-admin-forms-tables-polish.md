# Admin Forms & Tables UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish and unify the visual/UX consistency of the admin panel's forms and data tables without changing their underlying behavior or data flow.

**Architecture:** Build four small shared primitives (`FormSection`, `Input` prefix/suffix support, `FormActionBar`, `DataTableToolbar`) in `components/ui/` and `components/admin/`, then apply them across `package-form.tsx`, `account-form.tsx`, `crm-table.tsx`, and `users-table.tsx`. No new dependencies, no schema/action changes.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, shadcn/ui (`data-slot` convention + `cn()` from `@/lib/utils`), `@base-ui/react` primitives, `react-hook-form` + `zod`, `@tanstack/react-table`, `lucide-react` icons, `sonner` toasts.

## Global Constraints

- No new npm dependencies — everything is built from existing primitives already in `package.json`.
- Follow the existing shadcn `data-slot="..."` attribute convention on every new primitive (see `components/ui/table.tsx`, `components/ui/form.tsx`).
- All new/modified client components that use hooks or event handlers keep the `"use client"` directive at the top of the file, matching every existing file in `components/ui/` and `components/admin/`.
- Use `cn()` from `@/lib/utils` for all conditional/merged className logic — never string-concatenate classes.
- The existing mobile/desktop breakpoint is Tailwind's `md:` (768px) — every table already renders a `hidden md:block` desktop table alongside a `md:hidden` mobile card list. New UI must fit inside that existing pattern, not introduce a new breakpoint.
- Every task that changes rendered UI must be manually verified in a running dev server at **both** a mobile width (375px) and a desktop width (1280px) before being marked done — this was an explicit requirement from the project owner ("make sure everything is responsive").
- Run `npm run lint` after every task and fix any new warnings/errors it reports before committing.
- Destructive-styled buttons use the existing `variant="destructive"` on `<Button>`/`<AlertDialogAction>` (defined in `components/ui/button.tsx:18-19` — a soft `bg-destructive/10` style, not a solid red button) — do not invent a new variant name.
- Toast messages, "Saving..." button-label pattern, and the `GENERIC_ERROR_MESSAGE` constant convention already used in every form must be preserved exactly as-is; this plan does not touch submit/error handling logic.

---

### Task 1: `Input` prefix/suffix support

**Files:**
- Modify: `components/ui/input.tsx`

**Interfaces:**
- Produces: `Input` now accepts optional `prefix?: React.ReactNode` and `suffix?: React.ReactNode` props in addition to all existing `React.ComponentProps<"input">`. When neither is passed, the rendered DOM is byte-for-byte identical to today (same single `<input>` element, same classes) — every existing call site (`components/admin/*.tsx`, public site) is unaffected.

- [ ] **Step 1: Replace the component with a prefix/suffix-aware version**

Read the current file first (`components/ui/input.tsx`) to confirm the base classes below match exactly before editing — copy them verbatim, don't re-derive them.

```tsx
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const INPUT_BASE_CLASSES =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

function Input({
  className,
  type,
  prefix,
  suffix,
  ...props
}: React.ComponentProps<"input"> & {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}) {
  if (prefix || suffix) {
    return (
      <div
        data-slot="input-wrapper"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:bg-input/30",
          className
        )}
      >
        {prefix ? (
          <span className="pl-2.5 text-base text-muted-foreground select-none md:text-sm">
            {prefix}
          </span>
        ) : null}
        <InputPrimitive
          type={type}
          data-slot="input"
          className="h-full w-full min-w-0 border-0 bg-transparent px-2.5 py-1 text-base outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...props}
        />
        {suffix ? (
          <span className="pr-2.5 text-base text-muted-foreground select-none md:text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(INPUT_BASE_CLASSES, className)}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 2: Verify no regressions across existing usages**

Run: `npm run lint`
Expected: no new errors/warnings.

Run: `npm run dev`, then in a browser open `/admin/packages/new` (any admin form with plain `Input` fields, e.g. "Name") and confirm every plain (no prefix/suffix) input still looks and behaves exactly as before, at both 375px and 1280px widths.

- [ ] **Step 3: Commit**

```bash
git add components/ui/input.tsx
git commit -m "feat(ui): add prefix/suffix support to Input"
```

---

### Task 2: `FormSection` primitive

**Files:**
- Modify: `components/ui/form.tsx`

**Interfaces:**
- Produces: `FormSection` — `{ title: string } & React.ComponentProps<"div">`, exported from `@/components/ui/form` alongside the existing `Form`, `FormItem`, `FormLabel`, etc. Renders a heading (matching the existing `font-heading text-[16px] leading-[1.2] font-semibold` style already used for sub-headings in `package-form.tsx`) above a `flex flex-col gap-3` wrapper around its children.

- [ ] **Step 1: Add the component to `components/ui/form.tsx`**

Insert this new function above the final `export { ... }` block (after `FormMessage`, around line 155 of the current file):

```tsx
function FormSection({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { title: string }) {
  return (
    <div
      data-slot="form-section"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Add `FormSection` to the exports**

Update the export block at the bottom of `components/ui/form.tsx`:

```tsx
export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  FormSection,
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: no new errors. `FormSection` is unused until Task 7, so lint must not flag it as an unused export (it won't — it's a named export, not a local unused variable).

- [ ] **Step 4: Commit**

```bash
git add components/ui/form.tsx
git commit -m "feat(ui): add FormSection primitive for grouping related fields"
```

---

### Task 3: `FormActionBar` primitive

**Files:**
- Create: `components/admin/form-action-bar.tsx`

**Interfaces:**
- Produces: `FormActionBar` — `React.ComponentProps<"div">`, a sticky bottom bar meant to wrap a form's submit button(s). Exported as a named export from `@/components/admin/form-action-bar`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { cn } from "@/lib/utils";

export function FormActionBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-action-bar"
      className={cn(
        "sticky bottom-0 z-10 flex items-center gap-3 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: no new errors. This component has no usages until Task 5, so there's nothing to visually verify yet — confirm it type-checks:

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/form-action-bar.tsx
git commit -m "feat(admin): add sticky FormActionBar for long forms"
```

---

### Task 4: `DataTableToolbar` primitive

**Files:**
- Create: `components/admin/data-table-toolbar.tsx`

**Interfaces:**
- Produces: `DataTableToolbar` — `React.ComponentProps<"div">`, a `flex flex-col gap-2 sm:flex-row sm:items-center` row layout, identical to the toolbar row `crm-table.tsx` already renders inline. Exported as a named export from `@/components/admin/data-table-toolbar`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { cn } from "@/lib/utils";

export function DataTableToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-table-toolbar"
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Run: `npx tsc --noEmit`
Expected: no new errors from either.

- [ ] **Step 3: Commit**

```bash
git add components/admin/data-table-toolbar.tsx
git commit -m "feat(admin): add DataTableToolbar layout primitive"
```

---

### Task 5: Apply prefix/suffix and sticky action bar to `package-form.tsx`

**Files:**
- Modify: `components/admin/package-form.tsx`

**Interfaces:**
- Consumes: `Input` with `prefix`/`suffix` props (Task 1); `FormActionBar` from `@/components/admin/form-action-bar` (Task 3).
- Produces: no new exports — `PackageForm`'s public props (`packageId`, `defaultValues`, `initialPhotos`, `destinations`) are unchanged.

- [ ] **Step 1: Add the `FormActionBar` import**

In `components/admin/package-form.tsx`, add this import alongside the existing `Form`/`FormField`/etc. import block (currently lines 31-38):

```tsx
import { FormActionBar } from "@/components/admin/form-action-bar";
```

- [ ] **Step 2: Add `prefix="₱"` to the "From Price" field**

Find the `fromPrice` `FormField` block (currently around lines 243-262):

```tsx
            <FormField
              control={form.control}
              name="fromPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Price (PHP)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

Replace the `<Input .../>` element with:

```tsx
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      prefix="₱"
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
```

(Leave the `<FormLabel>From Price (PHP)</FormLabel>` text as-is — the `(PHP)` qualifier stays useful even with the ₱ prefix shown inline, since it clarifies the currency unambiguously.)

- [ ] **Step 3: Add `suffix="days"` to the "Duration (days)" field**

Find the `durationDays` `FormField` block (currently around lines 264-283):

```tsx
            <FormField
              control={form.control}
              name="durationDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (days)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

Replace the `<Input .../>` element with:

```tsx
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      suffix="days"
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
```

- [ ] **Step 4: Wrap the submit button in `FormActionBar`**

Find the closing block of the form (currently around lines 559-571):

```tsx
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-start"
        >
          {isSubmitting
            ? "Saving..."
            : packageId
              ? "Save Changes"
              : "Create Package"}
        </Button>
      </form>
    </Form>
  );
}
```

Replace it with:

```tsx
        <FormActionBar>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving..."
              : packageId
                ? "Save Changes"
                : "Create Package"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
```

(`className="self-start"` is dropped — the button no longer needs to self-align within a flex column since `FormActionBar` now controls its own `flex items-center` layout.)

- [ ] **Step 5: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expect no new errors.

Run: `npm run dev`, open `/admin/packages/new` in a browser:
- At 1280px: confirm the "From Price (PHP)" field shows a ₱ prefix inside the input box, and "Duration (days)" shows a "days" suffix.
- Scroll the page down while on the "Itinerary" tab (add a few days via "Add day" to make the form tall enough to scroll) and confirm the submit button bar stays stuck to the bottom of the viewport with a visible top border and translucent background, remaining clickable.
- Switch to 375px width and repeat both checks — confirm the sticky bar doesn't overflow horizontally and the prefix/suffix inputs don't clip their text.

- [ ] **Step 6: Commit**

```bash
git add components/admin/package-form.tsx
git commit -m "feat(admin): add price/duration affordances and sticky save bar to package form"
```

---

### Task 6: Field-array polish in `package-form.tsx` (numbering, styling, confirm-before-remove)

**Files:**
- Modify: `components/admin/package-form.tsx`

**Interfaces:**
- Consumes: `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog` (same API already used in `components/admin/users-table.tsx:20-29` for the deactivate-account confirmation).
- Produces: no new exports.

- [ ] **Step 1: Add the `AlertDialog` import**

Add alongside the other imports in `components/admin/package-form.tsx`:

```tsx
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
```

- [ ] **Step 2: Add pending-removal state and a shared `requestRemove` helper**

Inside the `PackageForm` function body, right after the existing `bringItemsArray` declaration (currently ends around line 133), add:

```tsx
  const [pendingRemoval, setPendingRemoval] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

  function requestRemove(
    hasContent: boolean,
    label: string,
    onConfirm: () => void
  ) {
    if (hasContent) {
      setPendingRemoval({ label, onConfirm });
    } else {
      onConfirm();
    }
  }
```

- [ ] **Step 3: Restructure the itinerary field array**

Find the itinerary `TabsContent` block (currently lines 330-388):

```tsx
          <TabsContent
            value="itinerary"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            {itineraryArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input p-3"
              >
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day {index + 1} Title</FormLabel>
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
                      <FormLabel>Day {index + 1} Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => itineraryArray.remove(index)}
                >
                  Remove day
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                itineraryArray.append({ title: "", description: "" })
              }
            >
              Add day
            </Button>
          </TabsContent>
```

Replace the whole block with:

```tsx
          <TabsContent
            value="itinerary"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
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
                      requestRemove(
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
              onClick={() =>
                itineraryArray.append({ title: "", description: "" })
              }
            >
              Add day
            </Button>
          </TabsContent>
```

(The per-field labels drop the redundant "Day N" prefix since the card header now carries that context.)

- [ ] **Step 4: Restructure the inclusions/exclusions/bringItems arrays**

Find each of the three near-identical blocks inside the `inclusions` `TabsContent` (currently lines 412-449 for "Included", 451-488 for "Excluded", 490-527 for "What to Bring"). Each follows this shape — using "Included" as the example (lines 412-449):

```tsx
            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Included
              </h3>
              {inclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <FormField
                    control={form.control}
                    name={`inclusions.${index}.label`}
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
                    variant="outline"
                    size="sm"
                    onClick={() => inclusionsArray.remove(index)}
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
                onClick={() => inclusionsArray.append({ label: "" })}
              >
                Add included item
              </Button>
            </div>
```

Replace it with (numbered items, styled remove button, confirm-before-remove):

```tsx
            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Included
              </h3>
              {inclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pb-1.5 text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`inclusions.${index}.label`}
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
                      requestRemove(
                        Boolean(form.getValues(`inclusions.${index}.label`)),
                        `Included item ${index + 1}`,
                        () => inclusionsArray.remove(index)
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
                onClick={() => inclusionsArray.append({ label: "" })}
              >
                Add included item
              </Button>
            </div>
```

Apply the identical transformation to the "Excluded" block — swap `inclusionsArray` → `exclusionsArray`, `inclusions.${index}.label` → `exclusions.${index}.label`, and the confirm label to `` `Excluded item ${index + 1}` ``.

Apply the identical transformation to the "What to Bring" block — swap `inclusionsArray` → `bringItemsArray`, `inclusions.${index}.label` → `bringItems.${index}.label`, and the confirm label to `` `Item to bring ${index + 1}` ``.

- [ ] **Step 5: Render the shared confirm dialog**

Immediately after the closing `</Tabs>` tag and before the `<FormActionBar>` block added in Task 5 (i.e., as a sibling inside the `<form>`), add:

```tsx
        <AlertDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => !open && setPendingRemoval(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {pendingRemoval?.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete its content. This can&apos;t be undone once
                you save the package.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  pendingRemoval?.onConfirm();
                  setPendingRemoval(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expect no new errors.

Run: `npm run dev`, open `/admin/packages/new`:
- Itinerary tab: click "Add day" twice, type text into one day's title, leave the other blank. Click "Remove day" on the blank one — it should remove immediately with no dialog. Click "Remove day" on the one with text — a confirm dialog titled "Remove Day 1?" (or whichever number) should appear; clicking "Cancel" keeps the day, clicking "Remove" deletes it.
- Inclusions & FAQ tab: repeat the same empty-vs-filled removal check for "Included", "Excluded", and "What to Bring" items, confirming each shows its own numbered label (e.g. "1.", "2.") to the left of the input and the correct item description (e.g. "Excluded item 2") in the confirm dialog.
- Check both at 375px and 1280px widths — confirm the numbered card headers and remove buttons don't wrap awkwardly or overflow on mobile.

- [ ] **Step 7: Commit**

```bash
git add components/admin/package-form.tsx
git commit -m "feat(admin): numbered field-array cards and confirm-before-remove in package form"
```

---

### Task 7: Group permission switches with `FormSection` in `account-form.tsx`

**Files:**
- Modify: `components/admin/account-form.tsx`

**Interfaces:**
- Consumes: `FormSection` from `@/components/ui/form` (Task 2).
- Produces: no new exports — `AccountForm`'s public props are unchanged.

- [ ] **Step 1: Add `FormSection` to the existing form import**

In `components/admin/account-form.tsx`, update the import block (currently lines 26-33):

```tsx
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
```

to:

```tsx
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from "@/components/ui/form";
```

- [ ] **Step 2: Wrap the three permission switches in `CreateAccountForm`**

Find the three `FormField` blocks for `canManagePackages`, `canMessageCustomers`, `canEditCrm` inside `CreateAccountForm` (currently lines 179-229):

```tsx
        <FormField
          control={form.control}
          name="canManagePackages"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">
                Manage Packages
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="canMessageCustomers"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">
                Message Customers
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="canEditCrm"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">Edit CRM Data</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
```

Replace it with (same three `FormField`s, now wrapped):

```tsx
        <FormSection title="Permissions">
          <FormField
            control={form.control}
            name="canManagePackages"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Manage Packages
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canMessageCustomers"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Message Customers
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="canEditCrm"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">Edit CRM Data</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>
```

- [ ] **Step 3: Apply the identical wrap in `EditAccountForm`**

Find the same three `FormField` blocks inside `EditAccountForm` (currently lines 346-396 — byte-identical to the `CreateAccountForm` ones above) and apply the exact same `<FormSection title="Permissions">...</FormSection>` wrap.

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expect no new errors.

Run: `npm run dev`, open `/admin/users`, click "Add Staff Account" to open the create dialog:
- At 1280px and 375px: confirm a "Permissions" heading now appears above the three switch rows, and the dialog still fits/scrolls correctly at `sm:max-w-md`.
- Edit an existing account and confirm the same "Permissions" heading appears in the edit dialog.

- [ ] **Step 5: Commit**

```bash
git add components/admin/account-form.tsx
git commit -m "feat(admin): group permission switches under a Permissions FormSection"
```

---

### Task 8: Add search to `users-table.tsx` via `DataTableToolbar`

**Files:**
- Modify: `components/admin/users-table.tsx`

**Interfaces:**
- Consumes: `DataTableToolbar` from `@/components/admin/data-table-toolbar` (Task 4).
- Produces: no new exports — `UsersTable`'s public props (`profiles: Profile[]`) are unchanged.

- [ ] **Step 1: Add new imports**

In `components/admin/users-table.tsx`, update the React import (currently line 3):

```tsx
import { useState, useTransition } from "react";
```

to:

```tsx
import { useMemo, useState, useTransition } from "react";
```

Add these imports alongside the existing `lucide-react`/`ui` imports:

```tsx
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";
```

(replacing the existing single-icon import `import { MoreHorizontalIcon } from "lucide-react";` on line 5)

```tsx
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 2: Add search state and client-side filtering**

Inside `UsersTable`, right after the existing state declarations (currently lines 51-55), add:

```tsx
  const [search, setSearch] = useState("");

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (profile) =>
        (profile.name ?? "").toLowerCase().includes(q) ||
        profile.email.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const hasProfiles = profiles.length > 0;
  const hasNoMatches = hasProfiles && filteredProfiles.length === 0;

  function handleClearSearch() {
    setSearch("");
  }
```

- [ ] **Step 3: Replace the top action row with a `DataTableToolbar`**

Find the current top-of-render block (currently lines 84-97):

```tsx
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Add Staff Account
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Staff Account</DialogTitle>
            </DialogHeader>
            <AccountForm mode="create" onSuccess={handleMutationSuccess} />
          </DialogContent>
        </Dialog>
      </div>
```

Replace it with:

```tsx
      <DataTableToolbar>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts by name or email..."
            className="pl-8"
          />
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Add Staff Account
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Staff Account</DialogTitle>
            </DialogHeader>
            <AccountForm mode="create" onSuccess={handleMutationSuccess} />
          </DialogContent>
        </Dialog>
      </DataTableToolbar>
```

- [ ] **Step 4: Branch on `hasProfiles` / `hasNoMatches` and use `filteredProfiles`**

Find the existing conditional render (currently lines 99-262), which currently reads:

```tsx
      {profiles.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No accounts yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a Staff or Admin account to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-hidden rounded-xl border border-border">
            <Table>
              ...
              <TableBody>
                {profiles.map((profile) => (
```

Change the opening condition from `profiles.length === 0` to `!hasProfiles`, and insert a `hasNoMatches` branch between it and the existing table markup:

```tsx
      {!hasProfiles ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No accounts yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a Staff or Admin account to get started.
          </p>
        </div>
      ) : hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No accounts match your search
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different name or email.
          </p>
          <Button variant="secondary" onClick={handleClearSearch}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-hidden rounded-xl border border-border">
            <Table>
              ...
              <TableBody>
                {filteredProfiles.map((profile) => (
```

Then, still within that same `<>...</>` branch, find the mobile card list's `.map()` call (currently `{profiles.map((profile) => (` inside the `md:hidden` block, around line 198) and change it to `{filteredProfiles.map((profile) => (`.

(Leave every `TableHead`, `TableCell`, `Card`, dropdown-menu, dialog, and alert-dialog markup inside those two `.map()` calls completely unchanged — only the two `.map()` source arrays change, from `profiles` to `filteredProfiles`.)

- [ ] **Step 5: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expect no new errors.

Run: `npm run dev`, open `/admin/users`:
- At 1280px: confirm a search box now sits to the left of "Add Staff Account" in the same row. Type a name/email substring that matches one account — confirm the table filters to just that row. Type something that matches nothing — confirm the "No accounts match your search" card appears with a working "Clear search" button.
- At 375px: confirm the search box and "Add Staff Account" button stack vertically (search on top) matching the CRM table's existing mobile toolbar behavior, and that the filtered mobile card list also updates correctly.

- [ ] **Step 6: Commit**

```bash
git add components/admin/users-table.tsx
git commit -m "feat(admin): add search to users table via DataTableToolbar"
```

---

### Task 9: Add column sorting and `DataTableToolbar` to `crm-table.tsx`

**Files:**
- Modify: `components/admin/crm-table.tsx`

**Interfaces:**
- Consumes: `DataTableToolbar` from `@/components/admin/data-table-toolbar` (Task 4).
- Produces: no new exports — `CrmTable`'s public props (`contacts: AdminContactListItem[]`) are unchanged.

- [ ] **Step 1: Add sorting imports**

Update the `@tanstack/react-table` import (currently lines 7-15):

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
```

to:

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
```

Update the `lucide-react` import (currently line 6):

```tsx
import { SearchIcon } from "lucide-react";
```

to:

```tsx
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
```

Add the `DataTableToolbar` import alongside the other `@/components/admin` import:

```tsx
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
```

- [ ] **Step 2: Add a `SortableHeader` helper**

Add this function above the `columns` array declaration (currently line 64):

```tsx
function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<AdminContactListItem, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}
```

- [ ] **Step 3: Wire sortable headers into `name`, `status`, and `createdAt` columns**

Find the `name` column def (currently lines 101-105):

```tsx
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
  },
```

Replace with:

```tsx
  {
    accessorKey: "name",
    header: ({ column }) => <SortableHeader label="Name" column={column} />,
    cell: ({ row }) => row.original.name,
  },
```

Find the `status` column def's `header` (currently line 113, inside the block spanning lines 111-129):

```tsx
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, columnId, filterValue) => {
```

Replace just the `header: "Status",` line with:

```tsx
    header: ({ column }) => <SortableHeader label="Status" column={column} />,
```

Find the `createdAt` column def (currently lines 146-156):

```tsx
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
```

Replace the `header: "Created",` line with:

```tsx
    header: ({ column }) => <SortableHeader label="Created" column={column} />,
```

- [ ] **Step 4: Add sorting state to the table instance**

Find the state declarations inside `CrmTable` (currently lines 161-164):

```tsx
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isComposeOpen, setIsComposeOpen] = useState(false);
```

Add a `sorting` state alongside them:

```tsx
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
```

Find the `useReactTable` config (currently lines 166-184):

```tsx
  const table = useReactTable({
    data: contacts,
    columns,
    state: { globalFilter, columnFilters, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      return (
        row.original.name.toLowerCase().includes(q) ||
        row.original.tags.some((t) => t.toLowerCase().includes(q))
      );
    },
  });
```

Replace it with:

```tsx
  const table = useReactTable({
    data: contacts,
    columns,
    state: { globalFilter, columnFilters, rowSelection, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      return (
        row.original.name.toLowerCase().includes(q) ||
        row.original.tags.some((t) => t.toLowerCase().includes(q))
      );
    },
  });
```

- [ ] **Step 5: Replace the toolbar row with `DataTableToolbar`**

Find the current toolbar div (currently lines 203-233):

```tsx
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search contacts by name or tag..."
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilterValue}
          onValueChange={(value) =>
            table
              .getColumn("status")
              ?.setFilterValue(value === STATUS_FILTER_ALL ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
```

Replace only the outer wrapping `<div className="flex flex-col gap-2 sm:flex-row sm:items-center">` / `</div>` with `<DataTableToolbar>` / `</DataTableToolbar>`, keeping everything inside identical:

```tsx
      <DataTableToolbar>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search contacts by name or tag..."
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilterValue}
          onValueChange={(value) =>
            table
              .getColumn("status")
              ?.setFilterValue(value === STATUS_FILTER_ALL ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableToolbar>
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expect no new errors.

Run: `npm run dev`, open `/admin/crm` with at least 3 contacts seeded:
- At 1280px: click the "Name" column header — rows should sort A→Z with an up-arrow shown; click again — Z→A with a down-arrow; click a third time — back to unsorted (default tanstack 3-state toggle) with the neutral up/down icon. Repeat for "Status" and "Created" headers, confirming only one column shows an active sort indicator at a time.
- Confirm existing search/status-filter/row-selection/bulk-message behavior still works unchanged after sorting is applied (e.g. sort by name, then search — results stay both filtered and sorted).
- At 375px: confirm the toolbar (search + status select) still stacks vertically as before, and the mobile card list (which doesn't show column headers) is unaffected by the sorting change.

- [ ] **Step 7: Commit**

```bash
git add components/admin/crm-table.tsx
git commit -m "feat(admin): add column sorting and DataTableToolbar to CRM table"
```

---

## Post-plan check

After all 9 tasks are committed, do one final pass:

- [ ] Run `npm run build` once to confirm the full production build still succeeds with no type or lint errors introduced across all changed files.
- [ ] Re-open every touched page (`/admin/packages/new`, `/admin/packages/[id]` for an existing package, `/admin/users`, `/admin/crm`) at both 375px and 1280px one more time in sequence, confirming nothing regressed between tasks (e.g. Task 9's `DataTableToolbar` swap didn't break Task 8's search box layout in an unrelated file, etc.).
