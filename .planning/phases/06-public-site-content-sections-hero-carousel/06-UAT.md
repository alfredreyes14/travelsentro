---
status: testing
phase: 06-public-site-content-sections-hero-carousel
source: [06-VERIFICATION.md]
started: 2026-07-27T15:00:00.000Z
updated: 2026-07-27T15:00:00.000Z
---

## Current Test

number: 1
name: Promo hero slide save (live CR-01 confirmation)
expected: |
  In /admin/content's Hero Slides tab, create a new Promo-type slide (headline, subheading, optional CTA, no package selected) and save. It should save successfully with no "invalid input syntax for type uuid" error. Also re-save an existing promo slide unchanged to confirm edits don't break either.
awaiting: user response

## Tests

### 1. Promo hero slide save (live CR-01 confirmation)
expected: Creating and editing a promo-type hero slide succeeds with no database error. This is the live confirmation of code-review fix CR-01 (packageId "" vs null coercion).
result: [pending]

### 2. Admin list live-refresh (live CR-02 confirmation)
expected: Add or edit an item in any of the 4 admin content tabs (Hero Slides, Why Choose Us, Testimonials, Partners & Clients) and confirm the new/changed item appears in the list immediately after the success toast, without needing a hard page reload.
result: [pending]

### 3. Hero carousel runtime behavior
expected: On the homepage, the hero carousel autoplays every ~5 seconds, pauses on mouse hover, stops auto-advancing after a manual interaction (stopOnInteraction), and does not autoplay at all when the OS/browser's reduced-motion setting is enabled.
result: [pending]

### 4. Hero slide drag-reorder
expected: In /admin/content's Hero Slides tab, drag-reorder slides and confirm the new order persists after a page refresh. If a reorder save fails, the list should roll back to the previous order.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
