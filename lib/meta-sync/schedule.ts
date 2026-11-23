import "server-only";

import { after } from "next/server";

import { flushMetaOutbox } from "./flush";

/**
 * Sends queued Meta sync jobs after the current request or Server Action
 * has responded, so a stage change reaches Messenger and Meta Ads within
 * seconds instead of at the next daily cron. Never throws.
 */
export function scheduleMetaSync(): void {
  after(flushMetaOutboxSafely);
}

/** flushMetaOutbox(), logging instead of throwing. */
export async function flushMetaOutboxSafely(): Promise<void> {
  try {
    await flushMetaOutbox();
  } catch (err) {
    console.error("Meta stage sync failed:", err);
  }
}
