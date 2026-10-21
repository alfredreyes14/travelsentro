/**
 * Pure-logic proof for lib/events/* (event types, Manila-date upcoming/past
 * split, homepage pick, date labels, slugs). Mirrors
 * scripts/verify-partner-helpers.ts's CheckResult/PASS-FAIL structure. No
 * network/Supabase access needed.
 *
 * Run via `npm run verify:event-helpers`.
 */
import { EVENT_TYPE_LABELS, isEventType } from "../lib/events/event-type";
import {
  formatEventDates,
  isUpcoming,
  manilaToday,
  pickHomepageEvents,
  splitEvents,
  type EventDateRange,
} from "../lib/events/event-dates";
import { slugifyEventName, uniqueSlug } from "../lib/events/slug";

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, pass: a === e, detail: `expected=${e} actual=${a}` });
}

type Named = EventDateRange & { name: string };
const names = (list: Named[]) => list.map((e) => e.name);

function helperChecks() {
  // manilaToday: Manila is UTC+8, so the day flips at 16:00 UTC.
  eq("manilaToday 15:59:59Z", manilaToday(new Date("2026-11-12T15:59:59Z")), "2026-11-12");
  eq("manilaToday 16:00:00Z", manilaToday(new Date("2026-11-12T16:00:00Z")), "2026-11-13");

  // isUpcoming
  eq("single-day event, today", isUpcoming({ startDate: "2026-11-12", endDate: null }, "2026-11-12"), true);
  eq("single-day event, day after", isUpcoming({ startDate: "2026-11-12", endDate: null }, "2026-11-13"), false);
  eq("multi-day event in progress", isUpcoming({ startDate: "2026-11-11", endDate: "2026-11-13" }, "2026-11-12"), true);
  eq("multi-day event ended", isUpcoming({ startDate: "2026-11-11", endDate: "2026-11-13" }, "2026-11-14"), false);

  // splitEvents
  const A: Named = { name: "A", startDate: "2026-11-20", endDate: null };
  const B: Named = { name: "B", startDate: "2026-11-15", endDate: null };
  const C: Named = { name: "C", startDate: "2026-10-01", endDate: "2026-10-05" };
  const D: Named = { name: "D", startDate: "2026-10-10", endDate: null };
  const split = splitEvents([A, B, C, D], "2026-11-12");
  eq("splitEvents upcoming soonest first", names(split.upcoming), ["B", "A"]);
  eq("splitEvents past newest first", names(split.past), ["D", "C"]);
  // Past sorts by end ?? start: E started earlier than F but ended later.
  const E: Named = { name: "E", startDate: "2026-09-01", endDate: "2026-09-30" };
  const F: Named = { name: "F", startDate: "2026-09-10", endDate: null };
  eq("splitEvents past by end date", names(splitEvents([F, E], "2026-11-12").past), ["E", "F"]);

  // pickHomepageEvents
  const U1: Named = { name: "U1", startDate: "2026-12-01", endDate: null };
  const U2: Named = { name: "U2", startDate: "2026-11-20", endDate: null };
  const U3: Named = { name: "U3", startDate: "2026-11-25", endDate: null };
  const P1: Named = { name: "P1", startDate: "2026-10-01", endDate: null };
  const P2: Named = { name: "P2", startDate: "2026-11-01", endDate: null };
  const P3: Named = { name: "P3", startDate: "2026-09-01", endDate: null };
  eq(
    "pickHomepageEvents 3 upcoming + 3 past, limit 4",
    names(pickHomepageEvents([P1, U1, P2, U2, P3, U3], "2026-11-12")),
    ["U2", "U3", "U1", "P2"]
  );
  eq("pickHomepageEvents empty", pickHomepageEvents([], "2026-11-12"), []);
  eq("pickHomepageEvents custom limit", names(pickHomepageEvents([U1, U2], "2026-11-12", 1)), ["U2"]);

  // formatEventDates
  eq("format single day", formatEventDates({ startDate: "2026-11-12", endDate: null }), "Nov 12, 2026");
  eq("format same start/end", formatEventDates({ startDate: "2026-11-12", endDate: "2026-11-12" }), "Nov 12, 2026");
  eq("format same month", formatEventDates({ startDate: "2026-11-12", endDate: "2026-11-14" }), "Nov 12–14, 2026");
  eq("format across months", formatEventDates({ startDate: "2026-11-30", endDate: "2026-12-02" }), "Nov 30 – Dec 2, 2026");
  eq("format across years", formatEventDates({ startDate: "2026-12-30", endDate: "2027-01-02" }), "Dec 30, 2026 – Jan 2, 2027");

  // slugifyEventName
  eq("slugify plain", slugifyEventName("PTAA Travel Fair 2026"), "ptaa-travel-fair-2026");
  eq("slugify punctuation", slugifyEventName("  Golf Cup — Sponsored by TravelSentro! "), "golf-cup-sponsored-by-travelsentro");
  eq("slugify diacritics", slugifyEventName("Pañuelo Expo"), "panuelo-expo");
  eq("slugify emoji only", slugifyEventName("🎉🎉"), "event");
  eq("slugify max length", slugifyEventName("a".repeat(200)).length <= 80, true);
  eq("slugify no trailing dash after cut", slugifyEventName(`${"a".repeat(79)} b`).endsWith("-"), false);

  // uniqueSlug
  eq("uniqueSlug free", uniqueSlug("fair", new Set()), "fair");
  eq("uniqueSlug taken", uniqueSlug("fair", new Set(["fair"])), "fair-2");
  eq("uniqueSlug taken twice", uniqueSlug("fair", new Set(["fair", "fair-2"])), "fair-3");

  // isEventType / labels
  eq("isEventType booth", isEventType("booth"), true);
  eq("isEventType concert", isEventType("concert"), false);
  eq("EVENT_TYPE_LABELS", EVENT_TYPE_LABELS, {
    sponsorship: "Sponsorship",
    exhibit: "Exhibit",
    booth: "Booth",
    other: "Other",
  });
}

function main() {
  helperChecks();

  console.log(`\nverify-event-helpers\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main();
