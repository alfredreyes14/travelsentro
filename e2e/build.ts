/**
 * Builds the app for the end-to-end tests: NEXT_PUBLIC_* values are baked
 * in at build time, so the build needs the same settings the tests run
 * with (e2e/env.ts).
 */
import { spawnSync } from "node:child_process";

import { E2E_ENV } from "./env";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, ...E2E_ENV },
});
process.exit(result.status ?? 1);
