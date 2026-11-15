/**
 * Pure-logic proof for lib/follow-ups: tracked link building, token and
 * target parsing, bot filtering, chat redirects, and the follow-up
 * templates/cadence. Same CheckResult/PASS-FAIL shape as
 * scripts/verify-contact-helpers.ts. No network or Supabase access.
 *
 * The SQL side (stage moves, click recording, who is due) lives in
 * supabase/migrations/20261115120000_lead_follow_ups.sql.
 *
 * Run via `npm run verify:follow-ups`.
 */
import { randomBytes } from "node:crypto";

import {
  buildChatUrl,
  buildTrackedUrl,
  isLikelyBot,
  isTrackingToken,
  toChatTarget,
} from "../lib/follow-ups/links";
import {
  FOLLOW_UP_COPY,
  FOLLOW_UP_GAP_DAYS,
  FOLLOW_UP_SEQUENCES,
  FOLLOW_UP_STEP_COUNT,
  followUpAngle,
  followUpEmailTemplate,
  followUpMessengerTemplate,
  followUpSequenceFor,
  followUpSmsTemplate,
  MESSENGER_FOLLOW_UP_GAP_DAYS,
  trackedLinkLength,
} from "../lib/follow-ups/templates";
import { followUpBadge } from "../lib/follow-ups/progress";
import { applyNameTemplate } from "../lib/crm/messages";
import { B2C_STAGES } from "../lib/crm/stage";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, pass: a === e, detail: `expected=${e} actual=${a}` });
}

// ---------------------------------------------------------------- tokens
const token = randomBytes(12).toString("base64url");
check("generated token is 16 chars", token.length, 16);
check("generated token is accepted", isTrackingToken(token), true);
check("short token rejected", isTrackingToken("abc"), false);
check("token with slash rejected", isTrackingToken("abcdefgh/ijklmno"), false);

// ---------------------------------------------------------------- targets
check("to=whatsapp", toChatTarget("whatsapp"), "whatsapp");
check("to=messenger", toChatTarget("messenger"), "messenger");
check("missing to -> messenger", toChatTarget(null), "messenger");
check("unknown to -> messenger", toChatTarget("telegram"), "messenger");

// ---------------------------------------------------------------- tracked URLs
check(
  "tracked URL with target",
  buildTrackedUrl("https://travelsentro.com", "AbCdEfGhIjKlMnOp", "whatsapp"),
  "https://travelsentro.com/go/AbCdEfGhIjKlMnOp?to=whatsapp"
);
check(
  "tracked URL without target, trailing slash origin",
  buildTrackedUrl("https://travelsentro.com/", "AbCdEfGhIjKlMnOp"),
  "https://travelsentro.com/go/AbCdEfGhIjKlMnOp"
);
check(
  "SMS link length estimate matches",
  trackedLinkLength("https://travelsentro.com"),
  (" " + buildTrackedUrl("https://travelsentro.com", token)).length
);

// ---------------------------------------------------------------- bots
const chrome =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
check("real phone browser counted", isLikelyBot(chrome), false);
check("missing UA is a bot", isLikelyBot(null), true);
check("facebook preview is a bot", isLikelyBot("facebookexternalhit/1.1"), true);
check("whatsapp preview is a bot", isLikelyBot("WhatsApp/2.23.20.0 A"), true);
check("curl is a bot", isLikelyBot("curl/8.4.0"), true);
check("Google image proxy is a bot", isLikelyBot("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"), true);

// ---------------------------------------------------------------- chat URLs
check(
  "messenger with package -> m.me ref",
  buildChatUrl("messenger", { packageSlug: "TSP-000001" }),
  "https://m.me/travelsentroph?ref=TSP-000001"
);
check(
  "messenger without package -> general ref",
  buildChatUrl("messenger", {}),
  "https://m.me/travelsentroph?ref=general"
);
const wa = new URL(buildChatUrl("whatsapp", { name: "Ana", channel: "sms" }));
check("whatsapp host", wa.host, "wa.me");
check(
  "whatsapp prefill names the lead and the channel",
  wa.searchParams.get("text"),
  "Hi TravelSentro! This is Ana. I got your follow-up text and I'd like to continue my inquiry."
);
check(
  "whatsapp prefill without a name",
  new URL(buildChatUrl("whatsapp", {})).searchParams.get("text"),
  "Hi TravelSentro! I got your follow-up email and I'd like to continue my inquiry."
);

// ---------------------------------------------------------------- cadence
check("gaps: 1, 3, 5, 10 days", [...FOLLOW_UP_GAP_DAYS], [1, 3, 5, 10]);
check("emails land on day 1, 4, 9, 19", FOLLOW_UP_GAP_DAYS.reduce<number[]>((acc, gap) => [...acc, (acc.at(-1) ?? 0) + gap], []), [1, 4, 9, 19]);
check("4 steps", FOLLOW_UP_STEP_COUNT, 4);
check("Messenger-only leads: day 1 and day 4 (Meta's 7-day limit)", [...MESSENGER_FOLLOW_UP_GAP_DAYS], [1, 3]);

// ---------------------------------------------------------------- sequences
check("New -> no_reply", followUpSequenceFor("b2c", "new"), "no_reply");
check("Quotation -> quote", followUpSequenceFor("b2c", "quotation"), "quote");
check("Inquiry -> no_reply copy", followUpSequenceFor("b2c", "inquiry"), "no_reply");
check("B2B never quote", followUpSequenceFor("b2b", "quotation"), "no_reply");
check("B2C funnel has no Follow-up stage", B2C_STAGES, ["new", "inquiry", "quotation", "confirmation", "lost"]);

// ---------------------------------------------------------------- copy
for (const sequence of FOLLOW_UP_SEQUENCES) {
  check(`${sequence}: one angle per automatic step`, FOLLOW_UP_COPY[sequence].steps.length, FOLLOW_UP_STEP_COUNT);
  check(`${sequence}: step 4 is the last check-in`, followUpAngle(sequence, 4).label, "Last check-in");

  // Every follow-up has its own angle: the first 8 (4 automatic + 4 extra)
  // are all different, and no two in a row repeat.
  const subjects = Array.from({ length: 12 }, (_, i) => followUpEmailTemplate(sequence, i + 1).subject);
  const smsTexts = Array.from({ length: 12 }, (_, i) => followUpSmsTemplate(sequence, i + 1));
  check(`${sequence}: first 8 email subjects all different`, new Set(subjects.slice(0, 8)).size, 8);
  check(`${sequence}: first 8 SMS texts all different`, new Set(smsTexts.slice(0, 8)).size, 8);
  check(`${sequence}: no two in a row repeat`, subjects.every((s, i) => i === 0 || s !== subjects[i - 1]), true);
  check(`${sequence}: extras rotate`, followUpAngle(sequence, 5).label, followUpAngle(sequence, 9).label);
  // Longest real name budget: 15 characters.
  check(`${sequence}: every SMS + link fits 2 segments`, smsTexts.every((t) => t.length + 15 + trackedLinkLength("https://travelsentro.com") <= 320), true);
  const messengerTexts = Array.from({ length: 8 }, (_, i) => followUpMessengerTemplate(sequence, i + 1));
  check(`${sequence}: 8 different Messenger messages`, new Set(messengerTexts).size, 8);
  check(`${sequence}: Messenger messages have no links`, messengerTexts.some((t) => /https?:|tap below/i.test(t)), false);
  check(`${sequence}: Messenger messages greet by name`, messengerTexts.every((t) => t.startsWith("Hi {{name}}")), true);
  check(`${sequence}: step 0 clamps to the first`, followUpEmailTemplate(sequence, 0).subject, followUpEmailTemplate(sequence, 1).subject);
}

const first = followUpEmailTemplate("no_reply", 1, "Palawan Escape");
check("no_reply 1 names the package", applyNameTemplate(first.subject, "Ana"), "Ana, let's check dates for your Palawan Escape trip");
check("no_reply 1 asks for group size and dates", first.body.includes("how many people") && first.body.includes("travel dates"), true);
check("quote 1 asks for passport copies", followUpEmailTemplate("quote", 1).body.includes("passport"), true);
check("quote without package says 'your trip'", followUpEmailTemplate("quote", 1).subject, "Ready to reserve your trip?");
check("no_reply without package says 'your next trip'", followUpEmailTemplate("no_reply", 3).body.includes("your next trip"), true);
check(
  "the two sequences never share a subject",
  FOLLOW_UP_COPY.no_reply.steps.every((a) => FOLLOW_UP_COPY.quote.steps.every((b) => a.email("x").subject !== b.email("x").subject)),
  true
);

// ---------------------------------------------------------------- badges
const progress = (sentCount: number, clicked = false) => ({ sequence: "no_reply" as const, sentCount, clicked });
check("no follow-ups -> no badge", followUpBadge(progress(0), "b2c", "new"), null);
check("2 sent at New", followUpBadge(progress(2), "b2c", "new")?.label, "Following up 2 of 4");
check("4 sent at New", followUpBadge(progress(4), "b2c", "new")?.label, "All 4 follow-ups sent");
check("clicked", followUpBadge(progress(1, true), "b2c", "new")?.label, "Clicked to chat");
check("manual at Inquiry", followUpBadge(progress(1), "b2c", "inquiry")?.label, "1 follow-up sent");
check("manual for B2B", followUpBadge(progress(3), "b2b", "contacted")?.label, "3 follow-ups sent");

let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
}
console.log(
  `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
);
if (!allPass) process.exit(1);
