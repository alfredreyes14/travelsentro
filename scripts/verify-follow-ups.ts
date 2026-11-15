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
  FOLLOW_UP_GAP_DAYS,
  EXTRA_ANGLES,
  FOLLOW_UP_STEP_COUNT,
  followUpAngle,
  followUpSmsTemplate,
  LOST_AFTER_DAYS,
  followUpEmailTemplate,
  trackedLinkLength,
} from "../lib/follow-ups/templates";
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

// ---------------------------------------------------------------- templates
check("gaps: 1, 3, 5, 10 days", FOLLOW_UP_GAP_DAYS, [1, 3, 5, 10]);
check("emails land on day 1, 4, 9, 19", FOLLOW_UP_GAP_DAYS.reduce<number[]>((acc, gap) => [...acc, (acc.at(-1) ?? 0) + gap], []), [1, 4, 9, 19]);
check("4 steps", FOLLOW_UP_STEP_COUNT, 4);
check("lost 3 days after the last email", LOST_AFTER_DAYS, 3);
check("last step says it's the last", followUpEmailTemplate(4).body.includes("last check-in"), true);
const step1 = followUpEmailTemplate(1, "Palawan Escape");
check("step 1 names the package", step1.body.includes("your Palawan Escape trip"), true);
check("step 1 subject has the name tag", applyNameTemplate(step1.subject, "Ana"), "Ana, let's plan your Palawan Escape trip");
check("no package -> generic trip", followUpEmailTemplate(2, null).body.includes("your next trip"), true);
// Every follow-up has its own angle: no two in a row share a subject or SMS,
// and the first 8 (4 automatic + 4 extra) are all different.
const subjects = Array.from({ length: 12 }, (_, i) => followUpEmailTemplate(i + 1).subject);
const smsTexts = Array.from({ length: 12 }, (_, i) => followUpSmsTemplate(i + 1));
check("first 8 email subjects all different", new Set(subjects.slice(0, 8)).size, 8);
check("first 8 SMS texts all different", new Set(smsTexts.slice(0, 8)).size, 8);
check("no two follow-ups in a row repeat", subjects.every((s, i) => i === 0 || s !== subjects[i - 1]), true);
check("follow-up 5 is the first extra angle", followUpAngle(5).label, EXTRA_ANGLES[0].label);
check("extras rotate after the last", followUpAngle(5 + EXTRA_ANGLES.length).label, EXTRA_ANGLES[0].label);
check("every SMS + link fits 2 segments", smsTexts.every((t) => t.length + 15 + trackedLinkLength("https://travelsentro.com") <= 320), true);
check("step 0 clamps to the first", followUpEmailTemplate(0).subject, followUpEmailTemplate(1).subject);

// ---------------------------------------------------------------- funnel
check("B2C has a Follow-up stage after New", B2C_STAGES.indexOf("follow_up"), B2C_STAGES.indexOf("new") + 1);

let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
}
console.log(
  `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
);
if (!allPass) process.exit(1);
