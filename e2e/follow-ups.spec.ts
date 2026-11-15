import { expect, test } from "@playwright/test";

import {
  contact,
  daysAgo,
  db,
  resetMock,
  runCron,
  seedLead,
  sentEmails,
} from "./helpers";

const PHONE_BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.beforeEach(async () => {
  await resetMock();
});

test("staff send a follow-up email, and tapping its button moves the lead to Inquiry", async ({ page }) => {
  const lead = await seedLead();

  await test.step("send from the lead's page", async () => {
    await page.goto(`/admin/crm/${lead.id}`);
    await page.getByRole("button", { name: "Follow Up", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("No reply yet · follow-up 1 · Group size and dates")).toBeVisible();
    await dialog.getByRole("button", { name: "Send Follow-up Email" }).click();
    await expect(page.getByText(`Follow-up email sent to ${lead.name}.`)).toBeVisible();
    await expect(page.getByText("No reply yet · 1 of 4")).toBeVisible();
    await expect(page.getByText("Chat link not clicked yet")).toBeVisible();
  });

  const email = (await sentEmails()).find((e) => e.to === lead.email);
  expect(email, "email reached the (fake) email service").toBeTruthy();
  expect(email!.subject).toContain(lead.name);
  expect(email!.html).toContain("Chat with us on Messenger");
  expect(email!.from).toMatch(/^"Almira from TravelSentro" </);
  expect(email!.html).toMatch(/\/go\/[A-Za-z0-9_-]{16}\?to=messenger/);
  expect(email!.html).toMatch(/\/go\/[A-Za-z0-9_-]{16}\?to=whatsapp/);

  const { data: message } = await db()
    .from("messages")
    .select("tracking_token, follow_up_sequence, follow_up_step")
    .eq("contact_id", lead.id)
    .eq("kind", "follow_up")
    .single();
  expect(message).toMatchObject({ follow_up_sequence: "no_reply", follow_up_step: 1 });
  const token = message!.tracking_token as string;

  await test.step("a link scanner's visit isn't counted", async () => {
    const res = await page.request.get(`/go/${token}?to=messenger`, {
      maxRedirects: 0,
      headers: { "user-agent": "curl/8.4.0" },
    });
    expect(res.status()).toBe(302);
    expect((await contact(lead.id)).stage).toBe("new");
  });

  await test.step("the lead taps Chat on Messenger", async () => {
    const res = await page.request.get(`/go/${token}?to=messenger`, {
      maxRedirects: 0,
      headers: { "user-agent": PHONE_BROWSER },
    });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe(`https://m.me/travelsentroph?ref=fu_${token}`);
    expect((await contact(lead.id)).stage).toBe("inquiry");
  });

  await test.step("WhatsApp opens with their name typed in", async () => {
    const res = await page.request.get(`/go/${token}?to=whatsapp`, {
      maxRedirects: 0,
      headers: { "user-agent": PHONE_BROWSER },
    });
    const location = new URL(res.headers().location);
    expect(location.host).toBe("wa.me");
    expect(location.searchParams.get("text")).toContain(lead.name);
  });

  await page.goto(`/admin/crm/${lead.id}`);
  await expect(page.getByText("Clicked to chat on Messenger and WhatsApp")).toBeVisible();
});

test("a quote created in the CRM moves the lead to Quotation and switches to quote follow-ups", async ({ page }) => {
  const lead = await seedLead({ stage: "inquiry" });
  const { error } = await db()
    .from("quotes")
    .insert({ title: "E2E Palawan", price_per_pax: 15000, duration_label: "3D2N", contact_id: lead.id });
  expect(error).toBeNull();
  expect((await contact(lead.id)).stage).toBe("quotation");

  await page.goto(`/admin/crm/${lead.id}`);
  await page.getByRole("button", { name: "Follow Up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Quote follow-up · follow-up 1 · Ready to reserve")).toBeVisible();
  await expect(dialog.locator("#message-email-body")).toHaveValue(/passport/);
});

test("the daily run only emails leads from the last 3 weeks on its first run", async ({ request, page }) => {
  // Follow-ups "go live" now; these leads were already waiting.
  await db().from("follow_up_settings").update({ launched_at: new Date().toISOString() }).eq("id", true);
  const recent = await seedLead({ daysOld: 5 });
  const old = await seedLead({ daysOld: 30 });

  const { status, body } = await runCron(request, "/api/cron/follow-ups");
  expect(status, JSON.stringify(body)).toBe(200);

  const to = (await sentEmails()).map((e) => e.to);
  expect(to).toContain(recent.email);
  expect(to).not.toContain(old.email);

  await page.goto(`/admin/crm/${recent.id}`);
  await expect(page.getByText("Sent by Automated follow-up")).toBeVisible();
  await expect(page.getByText("Following up 1 of 4")).toBeVisible();
});

test("a lead who never responds stays put after all 4 follow-ups, for staff to move by hand", async ({ request, page }) => {
  const lead = await seedLead({ daysOld: 25 });
  const sentDaysAgo = [24, 21, 16, 6];
  const { error } = await db()
    .from("messages")
    .insert(
      sentDaysAgo.map((days, i) => ({
        contact_id: lead.id,
        channel: "email",
        body: "E2E follow-up",
        status: "sent",
        kind: "follow_up",
        follow_up_sequence: "no_reply",
        follow_up_step: i + 1,
        created_at: daysAgo(days),
      }))
    );
  expect(error).toBeNull();

  const { status, body } = await runCron(request, "/api/cron/follow-ups");
  expect(status, JSON.stringify(body)).toBe(200);
  expect((await contact(lead.id)).stage).toBe("new");
  expect((await sentEmails()).map((e) => e.to)).not.toContain(lead.email); // no 5th email

  await page.goto(`/admin/crm/${lead.id}`);
  await expect(page.getByText("All 4 follow-ups sent")).toBeVisible();
});
