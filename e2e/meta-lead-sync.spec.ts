import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { db, metaLead, mockRequests, resetMock, runCron, sentEmails, setLeadForms } from "./helpers";

/**
 * Meta lead ads -> CRM sync (lib/meta-leads), through the nightly cron and
 * the "Sync Meta leads" button, with Meta faked by e2e/mock-server.ts.
 *
 * Each test uses its own lead IDs, so leads other tests left in the shared
 * database don't change the counts.
 */

test.beforeEach(async () => {
  await resetMock();
});

function leadsFor(run: string, formId: string, from: number, count: number) {
  return Array.from({ length: count }, (_, i) => metaLead(`${run}-${from + i}`, formId, `E2E Meta ${run} ${from + i}`));
}

async function savedLeads(run: string) {
  const { count, error } = await db()
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .like("external_id", `${run}-%`);
  if (error) throw error;
  return count ?? 0;
}

async function latestSyncRun() {
  const { data, error } = await db()
    .from("meta_lead_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

test("the nightly sync saves a busy week of leads quickly and only saves new ones after", async ({ request }) => {
  const run = randomUUID().slice(0, 8);
  // ~140 leads a week reach the China form; 200 gives headroom. More than
  // one page of Meta results.
  const china = { id: `${run}-china`, name: "E2E China Form", leads: leadsFor(run, `${run}-china`, 0, 195) };
  const japan = { id: `${run}-japan`, name: "E2E Japan Form", leads: leadsFor(run, `${run}-japan`, 1000, 5) };
  await setLeadForms([china, japan]);

  await test.step("a call without the cron secret is refused", async () => {
    const res = await request.get("/api/cron/meta-leads");
    expect(res.status()).toBe(401);
  });

  await test.step("first run saves all 200 within the time limit", async () => {
    const started = Date.now();
    const { status, body } = await runCron(request, "/api/cron/meta-leads");
    const seconds = (Date.now() - started) / 1000;
    expect(status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ status: "success", pulled: 200, added: 200, existing: 0, failed: 0 });
    // The route gets 60 s on Vercel; the old one-at-a-time sync ran past it.
    expect(seconds).toBeLessThan(30);
    expect(await savedLeads(run)).toBe(200);

    const logged = await latestSyncRun();
    expect(logged).toMatchObject({ trigger: "cron", status: "success", pulled: 200, added: 200 });
    expect(logged.finished_at).not.toBeNull();
  });

  await test.step("staff get one alert per new lead (capped at 20), sent in one batch", async () => {
    const batches = (await mockRequests()).filter((r) => r.path.startsWith("/resend/emails/batch"));
    expect(batches).toHaveLength(1);
    const alerts = (await sentEmails()).filter((e) => e.subject.startsWith(`New inquiry from E2E Meta ${run}`));
    expect(alerts).toHaveLength(20);
  });

  await test.step("next run saves only the 3 new leads", async () => {
    await resetMock();
    china.leads.push(...leadsFor(run, china.id, 2000, 3));
    await setLeadForms([china, japan]);
    const { status, body } = await runCron(request, "/api/cron/meta-leads");
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "success", added: 3, existing: 200 });
    expect(await savedLeads(run)).toBe(203);
    // Only the new leads are emailed about.
    const alerts = (await sentEmails()).filter((e) => e.subject.startsWith(`New inquiry from E2E Meta ${run}`));
    expect(alerts).toHaveLength(3);
  });

  await test.step("ad details Meta returns later are filled in", async () => {
    china.leads[0] = { ...china.leads[0], ad_name: "E2E Carousel", campaign_name: "E2E China Nov" };
    await setLeadForms([china, japan]);
    const { body } = await runCron(request, "/api/cron/meta-leads");
    expect(body).toMatchObject({ status: "success", added: 0, existing: 203 });
    const { data } = await db().from("inquiries").select("source_details").eq("external_id", china.leads[0].id).single();
    expect(data?.source_details).toMatchObject({ ad_name: "E2E Carousel", campaign_name: "E2E China Nov", form_name: "E2E China Form" });
  });
});

test("staff sync from the Leads page and see the run in the sync log", async ({ page }) => {
  const run = randomUUID().slice(0, 8);
  const formId = `${run}-form`;
  await setLeadForms([{ id: formId, name: "E2E Button Form", leads: leadsFor(run, formId, 0, 2) }]);

  await page.goto("/admin/crm");
  await page.getByRole("button", { name: "Sync Meta leads" }).click();
  await expect(page.getByText("Meta leads synced")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 new/)).toBeVisible();
  expect(await savedLeads(run)).toBe(2);

  const logged = await latestSyncRun();
  expect(logged).toMatchObject({ trigger: "manual", status: "success", added: 2, triggered_by_name: "E2E Admin" });

  await page.goto("/admin/crm/sync-log");
  await expect(page.getByText("Manual sync by E2E Admin").first()).toBeVisible();
  await expect(page.getByText("SUCCESS", { exact: true }).first()).toBeVisible();
});

test("an expired Meta token fails the run with a reason staff can act on", async ({ page, request }) => {
  await setLeadForms([], {
    status: 400,
    body: {
      error: {
        message: "Error validating access token: Session has expired",
        type: "OAuthException",
        code: 190,
        error_subcode: 463,
      },
    },
  });

  const { status } = await runCron(request, "/api/cron/meta-leads");
  expect(status).toBe(500);
  const logged = await latestSyncRun();
  expect(logged.status).toBe("failed");
  expect(logged.error).toContain("Meta rejected the access token: it has expired");

  await page.goto("/admin/crm/sync-log");
  await expect(page.getByText("Meta rejected the access token: it has expired").first()).toBeVisible();
});
