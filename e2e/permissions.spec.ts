import { expect, test } from "@playwright/test";

import { db, unique } from "./helpers";

const PASSWORD = "e2e-Staff-Password-1!";

test("admin grants per-module permissions and staff only get those", async ({ page, browser }) => {
  const name = unique("Perm Staff");
  const email = `${name.replace(/\s+/g, "-").toLowerCase()}@example.com`;

  // --- Admin creates the account with Leads Edit and Quotes View ---------
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add Staff Account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(PASSWORD);

  // New accounts start with nothing ticked.
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);

  // Edit implies View.
  await dialog.getByRole("checkbox", { name: "Leads: Edit" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Leads: View" })).toBeChecked();
  await dialog.getByRole("checkbox", { name: "Quotes: View" }).click();

  // Switching to Admin locks every box on; switching back restores the grid.
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Packages: Delete" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Packages: Delete" })).toBeDisabled();
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Staff" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Packages: Delete" })).not.toBeChecked();

  await dialog.getByRole("button", { name: "Add Staff Account" }).click();
  await expect(page.getByText("Staff account created.")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toContainText("Leads: View, Edit");
  await expect(row).toContainText("Quotes: View");

  const { data: profile } = await db().from("profiles").select("id, permissions").eq("email", email).single();
  expect(profile?.permissions).toEqual({
    leads: { read: true, update: true },
    quotes: { read: true },
  });

  // --- Staff sees only what was granted ----------------------------------
  const staff = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const staffPage = await staff.newPage();
  try {
    await staffPage.goto("/admin/login");
    await staffPage.getByLabel("Email").fill(email);
    await staffPage.getByLabel("Password").fill(PASSWORD);
    await staffPage.getByRole("button", { name: "Log In" }).click();

    // Lands on the first page they can open.
    await staffPage.waitForURL(/\/admin\/crm$/);
    await expect(staffPage.getByRole("button", { name: "Add Lead" })).toHaveCount(0);

    const nav = staffPage.locator("[data-sidebar='content']");
    await expect(nav.getByRole("link", { name: "Leads" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Quotes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Packages" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);

    await staffPage.goto("/admin/quotes");
    await expect(staffPage.getByRole("link", { name: /new quote/i })).toHaveCount(0);

    for (const path of ["/admin/packages", "/admin/quotes/new", "/admin/users"]) {
      await staffPage.goto(path);
      await expect(staffPage.getByRole("heading", { name: "Permission Denied" })).toBeVisible();
    }
  } finally {
    await staff.close();
    if (profile?.id) await db().auth.admin.deleteUser(profile.id);
  }
});
