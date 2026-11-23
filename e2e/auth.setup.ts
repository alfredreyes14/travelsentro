import { expect, test as setup } from "@playwright/test";

import { ADMIN, db } from "./helpers";

/** Creates the test admin (if needed) and logs in once for every test. */
setup("log in as admin", async ({ page }) => {
  const supabase = db();
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: ADMIN.email,
    password: ADMIN.password,
    email_confirm: true,
  });
  let userId = created.user?.id;
  if (error) {
    const { data: list } = await supabase.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === ADMIN.email)?.id;
  }
  expect(userId, "test admin user").toBeTruthy();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "admin", is_active: true, name: "E2E Admin" })
    .eq("id", userId!);
  expect(profileError).toBeNull();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL(/\/admin\/(?!login)/);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
