import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (e2e/). They run the built app against a local Supabase
 * (`supabase start`) and a fake email/SMS/Meta server (e2e/mock-server.ts).
 * CI: .github/workflows/e2e.yml. Locally:
 *
 *   supabase start
 *   eval "$(supabase status -o env --override-name api.url=SUPABASE_URL \
 *     --override-name auth.anon_key=SUPABASE_ANON_KEY \
 *     --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY)"
 *   npm run e2e:build && npm run e2e
 *
 * Tests share one database, so they run one at a time and each makes its
 * own uniquely named leads.
 */

import { E2E_ENV, MOCK_URL, PORT } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "npx tsx e2e/mock-server.ts",
      url: `${MOCK_URL}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/admin/login`,
      env: E2E_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
