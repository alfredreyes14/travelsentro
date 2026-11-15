import { expect, test } from "@playwright/test";

import { unique } from "./helpers";

test("Messenger settings: add and delete a saved-reply rule", async ({ page }) => {
  await page.goto("/admin/crm");
  await page.getByRole("link", { name: "Messenger settings" }).click();
  await expect(page.getByRole("heading", { name: "Messenger settings" })).toBeVisible();
  await expect(page.getByText("here po yung available namin")).toBeVisible(); // a starting rule

  const phrase = unique("here are your travel options");
  await page.getByLabel("Add a rule").fill(phrase);
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Rule added.")).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: phrase });
  await expect(row).toContainText("Quotation");
  await row.getByRole("button", { name: "Delete rule" }).click();
  await expect(page.getByText("Rule deleted.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: phrase })).toHaveCount(0);
});
