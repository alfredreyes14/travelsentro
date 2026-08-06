/**
 * Shared Server Action result shape for every actions/*.ts file this and
 * later plans add (mirrors lib/formspree.ts's FormspreeResult convention).
 */
export type ActionResult = { ok: true } | { ok: false; error: string };
