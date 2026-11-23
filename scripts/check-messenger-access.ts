/**
 * Answers one question before anyone starts Meta App Review: can our Meta
 * app already read and label Messenger chats with real customers?
 *
 *   npm run check:messenger-access
 *
 * Run it with the live tokens in .env.local (the same ones the Meta lead
 * sync uses). It only reads. It never prints customer names, IDs or
 * messages -- just counts, times and Meta's error messages.
 *
 * Why it can't simply say YES: with Meta's default (Standard) access, Meta
 * doesn't refuse the request, it quietly leaves out chats with people who
 * have no role on the app. So the script shows how many chats it sees and
 * how recent the newest one is, and you compare that with your inbox.
 */
import { FACEBOOK_PAGE_ID } from "../lib/constants";
import { getPageAccessToken } from "../lib/meta-leads/graph";

const GRAPH = "https://graph.facebook.com/v25.0";

type Conversation = {
  updated_time: string;
  participants?: { data: { id: string }[] };
};

async function get<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } }).error;
    // Meta's errors can quote a customer's ID: hide every long number.
    const message = (err?.message ?? `HTTP ${res.status}`).replace(/\d{6,}/g, "<id>");
    return { ok: false, error: `${message}${err?.code ? ` (code ${err.code})` : ""}` };
  }
  return { ok: true, data: body as T };
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour(s) ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

function tokenSource(): string {
  if (process.env.META_SYSTEM_USER_TOKEN) return "META_SYSTEM_USER_TOKEN";
  if (process.env.META_LEADS_ACCESS_TOKEN) return "META_LEADS_ACCESS_TOKEN";
  if (process.env.MESSENGER_PAGE_ACCESS_TOKEN) return "MESSENGER_PAGE_ACCESS_TOKEN";
  return "none";
}

async function main() {
  console.log("\nCan our Meta app see real customers' Messenger chats?\n");

  if (tokenSource() === "none") {
    console.log("NO TOKEN -- put the live META_SYSTEM_USER_TOKEN (or MESSENGER_PAGE_ACCESS_TOKEN) in .env.local and run again.\n");
    process.exit(1);
  }
  console.log(`Using the Page token from ${tokenSource()}.\n`);

  let token: string;
  try {
    token = await getPageAccessToken(FACEBOOK_PAGE_ID);
  } catch (err) {
    console.log(`Couldn't get a Page token: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  // 1. Chats Meta lets this app see.
  const chats = await get<{ data: Conversation[] }>(
    `${FACEBOOK_PAGE_ID}/conversations?platform=messenger&fields=updated_time,participants&limit=100`,
    token
  );
  if (!chats.ok) {
    console.log("1. Reading chats ............ BLOCKED");
    console.log(`   Meta said: ${chats.error}`);
    console.log("\nRESULT: NO -- the app can't read Messenger chats yet.");
    console.log("If Meta's message mentions a permission, App Review (Advanced Access to pages_messaging) is needed.\n");
    process.exit(1);
  }
  const conversations = chats.data.data ?? [];
  const newest = conversations[0];
  console.log(`1. Reading chats ............ OK: ${conversations.length}${conversations.length === 100 ? "+" : ""} chat(s) visible`);
  if (newest) console.log(`   Newest one was active ${ago(newest.updated_time)}.`);

  // 2. Reading labels on the newest customer chat (the label sync needs this).
  const customer = newest?.participants?.data.find((p) => p.id !== FACEBOOK_PAGE_ID);
  let labelsOk = false;
  if (customer) {
    const labels = await get<{ data: unknown[] }>(
      `${encodeURIComponent(customer.id)}/custom_labels?fields=page_label_name`,
      token
    );
    labelsOk = labels.ok;
    console.log(`2. Reading chat labels ...... ${labels.ok ? "OK" : "BLOCKED"}`);
    if (!labels.ok) console.log(`   Meta said: ${labels.error}`);
  } else {
    console.log("2. Reading chat labels ...... skipped (no chats visible)");
  }

  console.log("");
  if (conversations.length === 0) {
    console.log("RESULT: NO -- Meta shows this app no chats at all, so customer chats are being hidden.");
    console.log("App Review (Advanced Access to pages_messaging) is needed.\n");
    process.exit(1);
  }
  if (!labelsOk) {
    console.log("RESULT: PARTLY.");
    console.log("  - Reading chats works, so replies and contact details can be picked up");
    console.log("    by checking chats regularly, without App Review.");
    console.log("  - Labels on a customer's chat are blocked: inbox label sync needs App Review");
    console.log("    (Advanced Access to pages_messaging).\n");
    process.exit(1);
  }
  console.log("RESULT: PROBABLY YES -- one last check, by eye:");
  console.log("  Open the Facebook inbox (Meta Business Suite -> Inbox -> Messenger).");
  console.log(`  - Is your newest customer chat about ${newest ? ago(newest.updated_time) : "?"}?`);
  console.log(`  - Do you have roughly ${conversations.length}${conversations.length === 100 ? " or more" : ""} chats in total?`);
  console.log("  If both match, no App Review is needed. If the inbox has newer or many more");
  console.log("  chats, Meta is hiding customer chats and App Review is needed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
