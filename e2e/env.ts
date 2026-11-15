/** Settings shared by playwright.config.ts and the tests. */
export const PORT = 3100;
export const MOCK_URL = "http://127.0.0.1:4010";
const MOCK = MOCK_URL;

export const E2E_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
  // Production behaviour (Meta lead/Messenger syncs only run there), but
  // every outside service is the fake one.
  VERCEL_ENV: "production",
  CRON_SECRET: "e2e-cron-secret",
  UNSUBSCRIBE_TOKEN_SECRET: "e2e-unsubscribe-secret",
  RESEND_API_KEY: "re_e2e_fake",
  RESEND_BASE_URL: `${MOCK}/resend`,
  RESEND_FROM_EMAIL: "TravelSentro <test@example.com>",
  SEMAPHORE_API_KEY: "e2e-fake",
  SEMAPHORE_SENDER_NAME: "TEST",
  SEMAPHORE_ENDPOINT: `${MOCK}/semaphore`,
  META_GRAPH_URL: `${MOCK}/graph`,
  MESSENGER_PAGE_ACCESS_TOKEN: "e2e-fake-page-token",
  MESSENGER_APP_SECRET: "e2e-fake-app-secret",
};

