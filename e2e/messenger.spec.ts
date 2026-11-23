import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  PAGE_ID,
  chat,
  contact,
  daysAgo,
  db,
  resetMock,
  rewindMessengerSync,
  runCron,
  seedLead,
  setConversations,
  unique,
} from "./helpers";

const newPsid = () => `psid_${randomUUID().slice(0, 12)}`;
const chatUrl = (psid: string) => `https://www.facebook.com/${PAGE_ID}/inbox/${psid}/?section=messages`;

test.beforeEach(async () => {
  await resetMock();
});

test("the Messenger check links a Facebook lead, adds their phone, and tracks reply and quote", async ({ page, request }) => {
  const lead = await seedLead({ phone: null, daysOld: 1 });
  const psid = newPsid();
  await setConversations([
    chat(psid, lead.name, [
      {
        from: "customer",
        text: `Hello! I filled out your form and would like to know more about your business.\nEmail: ${lead.email}\nPhone number: 0917 555 1234`,
        minutesAgo: 50,
      },
      { from: "customer", text: "Morning. 4 pax.", minutesAgo: 40 },
      { from: "page", image: true, minutesAgo: 30 }, // the package poster
    ]),
  ]);
  await rewindMessengerSync(60);

  const { status, body } = await runCron(request, "/api/cron/messenger-sync");
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body).toMatchObject({ linked: 1, movedToInquiry: 1, quoteSuggestions: 1, errors: 0 });

  const after = await contact(lead.id);
  expect(after.messenger_psid).toBe(psid);
  expect(after.phone).toBe("09175551234");
  expect(after.stage).toBe("inquiry");
  expect(after.quote_suggested_at).not.toBeNull();

  await test.step("staff confirm the quote from the Leads page", async () => {
    await page.goto("/admin/crm");
    const todo = page.getByTestId("messenger-todo");
    await todo.getByRole("tab", { name: /Mark as Quotation\?/ }).click();
    const row = todo.getByTestId("quote-suggestion").filter({ hasText: lead.name });
    await row.getByRole("button", { name: "Yes, Quotation" }).click();
    await expect(page.getByText(`${lead.name} moved to Quotation.`)).toBeVisible();
    await expect.poll(async () => (await contact(lead.id)).stage).toBe("quotation");
  });

  await page.goto(`/admin/crm/${lead.id}`);
  await expect(page.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", chatUrl(psid));
});

test("a saved-reply phrase moves a linked lead straight to Quotation", async ({ request }) => {
  const psid = newPsid();
  const lead = await seedLead({ stage: "inquiry", messengerPsid: psid, daysOld: 1 });
  await setConversations([
    chat(psid, lead.name, [
      { from: "page", text: "Hello Ma'am, here po yung available namin for Beijing + Shanghai.", minutesAgo: 5 },
    ]),
  ]);
  await rewindMessengerSync(30);

  const { body } = await runCron(request, "/api/cron/messenger-sync");
  expect(body.movedBySavedReply).toBe(1);
  expect((await contact(lead.id)).stage).toBe("quotation");
});

test("someone who messaged the Page directly can be added as a new lead", async ({ page, request }) => {
  const psid = newPsid();
  const name = unique("Walk-in");
  await setConversations([
    chat(psid, name, [{ from: "customer", text: "Hi po, how much for Boracay?", minutesAgo: 10 }]),
  ]);
  await rewindMessengerSync(30);
  await runCron(request, "/api/cron/messenger-sync");

  await page.goto("/admin/crm");
  const todo = page.getByTestId("messenger-todo");
  await todo.getByRole("tab", { name: /Chats not matched yet/ }).click();
  const row = todo.getByTestId("unmatched-chat").filter({ hasText: name });
  await expect(row).toContainText("Hi po, how much for Boracay?");
  await row.getByRole("button", { name: "Add as new lead" }).click();
  await expect(page.getByText(`${name} added as a new lead.`)).toBeVisible();

  const { data: created } = await db()
    .from("contacts")
    .select("id, stage, email, phone, tags")
    .eq("messenger_psid", psid)
    .single();
  expect(created).toMatchObject({ stage: "inquiry", email: null, phone: null });
  expect(created!.tags).toContain("Messenger");

  await test.step("their email is picked up when they type it in the chat", async () => {
    const email = `${psid}@example.com`;
    await setConversations([
      chat(psid, name, [
        { from: "customer", text: "Hi po, how much for Boracay?", minutesAgo: 10 },
        { from: "customer", text: `Sure, my email is ${email}`, minutesAgo: 1 },
      ]),
    ]);
    await rewindMessengerSync(5);
    await runCron(request, "/api/cron/messenger-sync");
    expect((await contact(created!.id)).email).toBe(email);
  });
});

test("an unmatched chat can be matched to an existing lead, or marked not a lead", async ({ page, request }) => {
  const lead = await seedLead({ name: unique("Existing Lead") });
  const matchPsid = newPsid();
  const supplierPsid = newPsid();
  const chatName = unique("FB Name");
  const supplierName = unique("Hotel Supplier");
  await setConversations([
    chat(matchPsid, chatName, [{ from: "customer", text: "Is the Dec 20 slot still available?", minutesAgo: 8 }]),
    chat(supplierPsid, supplierName, [{ from: "customer", text: "Invoice attached", minutesAgo: 6 }]),
  ]);
  await rewindMessengerSync(30);
  await runCron(request, "/api/cron/messenger-sync");

  await page.goto("/admin/crm");
  const todo = page.getByTestId("messenger-todo");
  await todo.getByRole("tab", { name: /Chats not matched yet/ }).click();

  await test.step("match to the existing lead", async () => {
    const row = todo.getByTestId("unmatched-chat").filter({ hasText: chatName });
    await row.getByLabel(`Lead for ${chatName}`).fill(lead.name);
    await page.getByRole("option", { name: new RegExp(lead.name) }).click();
    await row.getByRole("button", { name: "Match to lead" }).click();
    await expect(page.getByText(`Chat matched to ${lead.name}.`)).toBeVisible();
    await expect.poll(async () => (await contact(lead.id)).messenger_psid).toBe(matchPsid);
  });

  await test.step("mark the supplier's chat as not a lead", async () => {
    const row = todo.getByTestId("unmatched-chat").filter({ hasText: supplierName });
    await row.getByRole("button", { name: "Not a lead" }).click();
    await expect(page.getByText("Marked as not a lead.")).toBeVisible();
    await expect(todo.getByTestId("unmatched-chat").filter({ hasText: supplierName })).toHaveCount(0);
  });
});

test("leads without an email get Messenger follow-ups that staff send and mark sent", async ({ page }) => {
  const psid = newPsid();
  const lead = await seedLead({
    email: null,
    stage: "quotation",
    daysOld: 2,
    inquiry: false,
    messengerPsid: psid,
  });
  const { error } = await db().from("messenger_threads").insert({
    psid,
    name: lead.name,
    contact_id: lead.id,
    last_inbound_at: daysAgo(2),
    chat_link: `/${PAGE_ID}/inbox/${psid}/?section=messages`,
  });
  expect(error).toBeNull();

  await page.goto("/admin/crm");
  const todo = page.getByTestId("messenger-todo");
  await todo.getByRole("tab", { name: /Follow up today/ }).click();
  const item = todo.getByTestId("messenger-follow-up").filter({ hasText: lead.name });
  await expect(item).toContainText("Quote follow-up · 1 of 2");
  await expect(item).toContainText("passport");
  await expect(item.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", chatUrl(psid));

  await item.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText(`Marked as sent for ${lead.name}.`)).toBeVisible();
  await expect(todo.getByTestId("messenger-follow-up").filter({ hasText: lead.name })).toHaveCount(0);

  const { data: messages } = await db()
    .from("messages")
    .select("channel, kind, follow_up_sequence, follow_up_step")
    .eq("contact_id", lead.id);
  expect(messages).toEqual([
    { channel: "messenger", kind: "follow_up", follow_up_sequence: "quote", follow_up_step: 1 },
  ]);

  await page.goto(`/admin/crm/${lead.id}`);
  await expect(page.getByText("Messaged on Messenger")).toBeVisible();
});

test("the lead's page asks before moving to Quotation, and 'Not a quote' clears it", async ({ page }) => {
  const lead = await seedLead({ stage: "inquiry" });
  await db().from("contacts").update({ quote_suggested_at: new Date().toISOString() }).eq("id", lead.id);

  await page.goto(`/admin/crm/${lead.id}`);
  const banner = page.getByTestId("quote-suggestion-banner");
  await expect(banner).toContainText("Was it a quote?");
  await banner.getByRole("button", { name: "Not a quote" }).click();
  await expect(banner).toHaveCount(0);
  const after = await contact(lead.id);
  expect(after.stage).toBe("inquiry");
  expect(after.quote_suggested_at).toBeNull();
});
