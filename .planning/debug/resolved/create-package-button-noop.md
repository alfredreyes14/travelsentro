---
status: resolved
trigger: "Investigate issue: create-package-button-noop -- On the package creation form (/admin/packages/new), clicking \"Create Package\" does nothing -- no error is shown, no navigation happens, and no package is persisted."
created: 2026-07-19T00:00:00Z
updated: 2026-07-19T06:30:00Z
resolved_by: "02-11-PLAN.md (onInvalid handler + controlled Tabs auto-switch + keepMounted) -- all automated acceptance criteria + npm run lint/build passed. Live browser retest of 02-UAT.md Test 5/6 not yet confirmed by the developer; deferred to end-of-phase human verification per human_verify_mode: end-of-phase."
---

## Current Focus

hypothesis: CONFIRMED -- see Resolution.root_cause
test: n/a (root cause confirmed, goal is find_root_cause_only)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller

## Symptoms

expected: Admin/Staff with "manage packages" permission can create a tour package via the package-form UI. A successful create should redirect to the new package's edit page (per STATE.md decision log for 02-05).
actual: User reported (verbatim): "There is no save or publish button. Just create package, nothing happens when I click it." Photo upload (Test 6) is also blocked because it requires an existing package, and none can be created.
errors: None reported by the user -- no console error, no toast, no navigation.
reproduction: /admin/packages/new -> fill fields across Details/Itinerary/Inclusions & FAQ tabs -> click "Create Package". Reliably reproduces whenever any required field is left empty AND the user is not currently viewing the tab that contains that field when they click submit.
started: First real end-to-end browser exercise of this form since 02-05-PLAN.md implemented it; prior verification rounds didn't drive the form live.

## Eliminated

- hypothesis: The "Create Package" submit button doesn't actually get type="submit" because shadcn's Button wraps Base UI's <Button> primitive, which might force type="button" and swallow the explicit prop.
  evidence: Traced Base UI's prop-merging pipeline (node_modules/@base-ui/react/button/Button.mjs -> internals/use-button/useButton.mjs's getButtonProps -> merge-props/mergeProps.mjs -> internals/useRenderElement.mjs's renderTag). mergeProps is right-most-wins for non-handler props; the explicitly-passed `type="submit"` flows through elementProps -> is passed as `externalProps` into `getButtonProps` -> lands in `otherExternalProps`, which is merged LAST, after the internal `{type:'button'}` default. Confirmed the final rendered `<button>` keeps `type="submit"`.
  timestamp: 2026-07-19T00:00:00Z

- hypothesis: Tab triggers (Details/Itinerary/Photos/Inclusions & FAQ) default to native `type="submit"` (Base UI Tab doesn't set `type="button"` the way its dedicated Button does), causing the form to submit prematurely on every tab click with incomplete data.
  evidence: Read node_modules/@base-ui/react/tabs/tab/TabsTab.mjs -- it calls `useButton({disabled, native: nativeButton, focusableWhenDisabled: true})` the same way Button.mjs does, and merges `getButtonProps` last in its props array, which defaults `type: 'button'` and finds no conflicting explicit `type` prop from `<TabsTrigger>` usage. Confirmed tab triggers render `type="button"`.
  timestamp: 2026-07-19T00:00:00Z

- hypothesis: packageFormSchema / zodResolver has a defect (e.g. zod 4's `{error: "..."}` config key, or the plain z.number() + valueAsNumber wiring) that incorrectly rejects even fully-valid, fully-filled form data.
  evidence: Ran the actual packageFormSchema + zodResolver from @hookform/resolvers/zod via `npx tsx` against (a) EMPTY_DEFAULTS -- correctly produced per-field "too_small" errors for name/slug/fromPrice/durationDays/bestTimeToGo/groupSize, and (b) a fully-filled representative payload -- resolver returned `{errors: {}, values: {...}}` with zero errors, and a raw `.safeParse()` also returned `success: true`. Schema/resolver mechanics are correct.
  timestamp: 2026-07-19T00:00:00Z

- hypothesis: `components/ui/form.tsx`'s FormControl (using React.cloneElement instead of Radix Slot) breaks event wiring or otherwise blocks input interactivity.
  evidence: FormControl's cloneElement spreads `...children.props` after the computed a11y attrs (id/aria-describedby/aria-invalid), which only affects those 3 attributes' precedence -- not functional wiring (onChange/value/ref pass through untouched via `children.props`). No impact on submit-button click handling.
  timestamp: 2026-07-19T00:00:00Z

- hypothesis: Toaster isn't mounted, so error/success toasts from onSubmit silently do nothing.
  evidence: `<Toaster />` (components/ui/sonner.tsx, sonner-based) is rendered in the root layout (app/layout.tsx), which wraps every route including /admin/*. Toasts would be visible if `toast.success`/`toast.error` were ever called.
  timestamp: 2026-07-19T00:00:00Z

## Evidence

- timestamp: 2026-07-19T00:00:00Z
  checked: components/admin/package-form.tsx onSubmit + form.handleSubmit wiring
  found: "<form onSubmit={form.handleSubmit(onSubmit)} ...>" passes only the success handler -- no second `onInvalid` argument. react-hook-form's handleSubmit calls the success callback ONLY when zodResolver validation passes; on failure it just updates internal `formState.errors` and returns, with no visible side effect unless something renders the errors.
  implication: If validation fails, `setIsSubmitting(true)` (first line inside onSubmit) never runs, so the button never shows "Saving...", no toast fires, no router.push happens, and createPackage is never called -- literally zero observable feedback, matching "nothing happens when I click it" exactly.

- timestamp: 2026-07-19T00:00:00Z
  checked: node_modules/@base-ui/react/tabs/panel/TabsPanel.mjs (used by components/ui/tabs.tsx's TabsContent, which the project uses instead of Radix)
  found: "const shouldRender = keepMounted || mounted; if (!shouldRender) { return null; }" -- `keepMounted` defaults to `false`, and `components/ui/tabs.tsx`'s `TabsContent` wrapper does not override it. This means an inactive tab's panel -- and everything inside it, including every `<FormField>`/`<FormMessage>` for that tab's fields -- is fully unmounted from the DOM, not just CSS-hidden.
  implication: If a required field (e.g. `bestTimeToGo` or `groupSize`, both on the "Inclusions & FAQ" tab per package-form-schema.ts) is empty/invalid at submit time, and the user is NOT currently viewing that specific tab, its `<FormMessage>` error text does not exist anywhere in the DOM to be seen. Combined with the missing `onInvalid` handler above, and react-hook-form's default `shouldFocusError: true` behavior silently no-op'ing because there's no mounted element to focus, the failed submission produces no toast, no scroll-to-error, no visible red text -- nothing.

- timestamp: 2026-07-19T00:00:00Z
  checked: components/admin/package-form-schema.ts field layout vs components/admin/package-form.tsx tab layout
  found: "bestTimeToGo" (min(1), "Please enter the best time to go") and "groupSize" (min(1), "Please enter the typical group size") are both required string fields rendered at the very bottom of the "Inclusions & FAQ" tab, below three separate dynamic list sections (Included/Excluded/What to Bring). Test 5's own "expected" checklist in 02-UAT.md ("Itinerary days, inclusions, FAQ facts, price/photos") does not explicitly call these two fields out.
  implication: These are the most plausible fields to be left empty by a tester filling the form -- easy to overlook below three "Add item" list builders, and not part of the UAT's own mental checklist of what to verify. The "Create Package" button sits outside the `<Tabs>` (always visible below it regardless of active tab), so nothing about the UI prompts the user to return to the Inclusions & FAQ tab before submitting.

## Resolution

root_cause: |
  `PackageForm`'s submit wiring (`form.handleSubmit(onSubmit)`) has no `onInvalid` handler, so a failed Zod validation is entirely silent at the React level (react-hook-form only calls `onSubmit` -- which contains all the toast/redirect/persistence logic -- when validation passes). Compounding this, the shadcn-style `<Tabs>`/`<TabsContent>` wrapper in `components/ui/tabs.tsx` sits on top of Base UI's `Tabs.Panel`, whose `keepMounted` prop defaults to `false` (confirmed in node_modules/@base-ui/react/tabs/panel/TabsPanel.mjs) and is never overridden here -- so an inactive tab's content, including its `<FormField>`/`<FormMessage>` error text, is fully unmounted from the DOM, not merely hidden.

  The most likely concrete trigger is the two required fields `bestTimeToGo` and `groupSize` (package-form-schema.ts), which live at the bottom of the "Inclusions & FAQ" tab below three dynamic list-builder sections and aren't called out in the UAT test's own field checklist -- easy for a tester to miss filling in. Since the "Create Package" submit button lives outside the `<Tabs>` component (always visible, independent of active tab), a user can fill Details + Itinerary, skip past Best Time to Go/Group Size, land on a different tab (e.g. Photos, which is the natural next stop and where the blocked-photo-upload UAT note originates), and click "Create Package" -- validation fails on the now-unmounted Inclusions & FAQ tab, `onSubmit` never runs, and literally nothing observable happens: no toast (Toaster is mounted and works, confirmed by tracing app/layout.tsx, but toast.error/success are inside `onSubmit`, which never executes), no navigation, no DB row, no console error. This exactly matches the reported symptom "nothing happens when I click it."

  Ruled out via direct code/runtime tracing (not present in this codebase): the submit button's `type="submit"` is correctly forwarded through Base UI's Button primitive; tab triggers correctly default to `type="button"` (no premature submit-on-tab-click); the Zod schema + zodResolver correctly validate a fully-filled payload with zero errors (verified via `npx tsx` against the real schema); `<Toaster />` is mounted at the root layout.
fix: ""
verification: ""
files_changed: []
