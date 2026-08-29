/**
 * Configures the Page's Messenger Profile -- specifically the "Get Started"
 * button, without which the auto-greeting cannot fire for first-time
 * visitors.
 *
 * WHY THIS EXISTS
 * ---------------
 * Meta delivers an m.me link's `ref` differently depending on whether the
 * person has messaged the Page before:
 *
 *   existing thread -> `messaging_referrals` event fires on the click
 *   brand-new thread -> NO event fires on the click. The ref is held and
 *                       delivered inside the `messaging_postbacks` event
 *                       ONLY when the visitor taps "Get Started".
 *
 * If no Get Started button is configured, that second path has nothing to
 * tap, so a first-time visitor lands in an empty thread, no webhook event
 * is ever delivered, and they get no greeting. The webhook route already
 * handles the postback shape (`postback.referral` in
 * app/api/messenger/webhook/route.ts) -- the button being absent from the
 * Page was the only missing piece.
 *
 * This is Page-level config living on Meta's servers, not in this repo, so
 * it survives deploys but is invisible in code review -- hence this script,
 * so the setup is reproducible and reviewable rather than a one-off curl
 * someone ran once and forgot.
 *
 * HARD PLATFORM LIMIT (not fixable here): Meta forbids a Page from sending
 * to someone who has never contacted it. There is no way to auto-send a
 * message to a brand-new visitor who clicks the link and taps nothing.
 * Get Started reduces that to a single tap, which is the closest the
 * platform allows.
 *
 * Run via `npm run setup:messenger-profile`. Idempotent -- re-running just
 * overwrites the same fields with the same values.
 */
import { GENERAL_MESSENGER_REF } from "../lib/messenger/link";

const GRAPH_API_VERSION = "v25.0";

/**
 * Payload delivered in `postback.payload` when Get Started is tapped. The
 * webhook keys off `postback.referral`, not this value, so it is only ever
 * read by a human debugging a raw event.
 */
const GET_STARTED_PAYLOAD = "GET_STARTED";

/**
 * NOTE -- no `greeting` field here on purpose. The Messenger Profile API no
 * longer supports it; posting one is silently discarded. Verified against
 * the live API: sending `greeting` alone is rejected with
 *
 *   (#100) Requires one of the params: get_started, persistent_menu,
 *   whitelisted_domains, account_linking_url, home_url, ice_breakers,
 *   platform, description, commands
 *
 * -- `greeting` is absent from that list, on v25.0 and v19.0 alike.
 *
 * The dangerous part is that posting `greeting` ALONGSIDE a valid field
 * returns {"result":"success"} while dropping it, so a write-only script
 * would report success and configure nothing. That is exactly why this
 * script reads the profile back instead of trusting the write -- the
 * read-back is what caught it.
 *
 * To put text on the blank thread, the supported options are `ice_breakers`
 * (tappable starter questions, via this API) or the Instant Reply /
 * Greeting automation in Meta Business Suite -> Inbox -> Automations, which
 * is a dashboard-only setting with no API equivalent.
 */

type CheckResult = { name: string; pass: boolean; detail: string };

function requireToken(): string {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "\nMESSENGER_PAGE_ACCESS_TOKEN is unset. Run with --env-file=.env.local\n"
    );
    process.exit(1);
  }
  return token;
}

async function writeProfile(token: string): Promise<CheckResult> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messenger_profile?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        get_started: { payload: GET_STARTED_PAYLOAD },
      }),
    }
  );

  const body = await res.text();
  return {
    name: "Write get_started",
    pass: res.ok,
    detail: res.ok ? body : `HTTP ${res.status}: ${body}`,
  };
}

async function readBackProfile(token: string): Promise<CheckResult[]> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messenger_profile?fields=get_started&access_token=${encodeURIComponent(token)}`
  );
  const body = await res.text();

  if (!res.ok) {
    return [
      {
        name: "Read back profile",
        pass: false,
        detail: `HTTP ${res.status}: ${body}`,
      },
    ];
  }

  const parsed = JSON.parse(body) as {
    data?: Array<{ get_started?: { payload?: string } }>;
  };
  const entry = parsed.data?.[0];
  const hasGetStarted = Boolean(entry?.get_started);

  return [
    {
      name: "Get Started button is live (unblocks new-thread greetings)",
      pass: hasGetStarted,
      detail: hasGetStarted
        ? `payload "${entry?.get_started?.payload}"`
        : "still absent -- first-time visitors will get no greeting",
    },
  ];
}

async function main() {
  const token = requireToken();

  console.log("\nsetup-messenger-profile\n");
  const results: CheckResult[] = [await writeProfile(token)];
  results.push(...(await readBackProfile(token)));

  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }

  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (allPass) {
    console.log(
      `Test it with a NEVER-BEFORE-USED Facebook account:\n` +
        `  https://m.me/travelsentroph?ref=${GENERAL_MESSENGER_REF}\n` +
        `Expect a Get Started button, and the greeting after tapping it.\n` +
        `Re-testing on an account that has already messaged the Page will\n` +
        `NOT exercise this path -- that thread already exists.\n`
    );
  } else {
    process.exit(1);
  }
}

main();
