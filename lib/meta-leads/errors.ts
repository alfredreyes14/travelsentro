import { GraphApiError } from "./graph";
import { MetaLeadSyncError } from "./sync";

/**
 * Turns a failed Meta lead sync into a sentence staff can act on, for the
 * sync log and the "Sync Meta leads" toast. The raw error is kept
 * separately (errorDetail) for debugging.
 *
 * Graph API error codes: https://developers.facebook.com/docs/graph-api/guides/error-handling
 */

export type DescribedSyncError = {
  /** Plain-language explanation and what to do about it. */
  message: string;
  /** The raw error text. */
  detail: string;
};

type GraphErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

function parseGraphError(err: GraphApiError): GraphErrorBody {
  try {
    const parsed = JSON.parse(err.body) as { error?: GraphErrorBody };
    return parsed.error ?? {};
  } catch {
    return {};
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

function describeGraphError(err: GraphApiError): string {
  const { message, code, error_subcode: subcode } = parseGraphError(err);
  const metaSaid = message ? ` Meta said: "${message}"` : "";

  if (code === 190) {
    const reason =
      subcode === 463
        ? "it has expired"
        : subcode === 460
          ? "the password of the account that created it was changed"
          : subcode === 458 || subcode === 459
            ? "the app is no longer authorized on that account"
            : "it is invalid or was revoked";
    return (
      `Meta rejected the access token: ${reason}. Generate a new System User token ` +
      "in Meta Business settings and update META_SYSTEM_USER_TOKEN in Vercel." +
      metaSaid
    );
  }
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return (
      "The access token is missing a permission Meta requires to read leads " +
      "(leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_ads), " +
      "or the System User isn't assigned to the Facebook Page." +
      metaSaid
    );
  }
  if (
    (code !== undefined && RATE_LIMIT_CODES.has(code)) ||
    (code !== undefined && code >= 80000 && code < 80100)
  ) {
    return (
      "Meta's API rate limit was reached, so Meta refused further requests for now. " +
      "The next sync will pick up any leads missed." +
      metaSaid
    );
  }
  if (code === 100) {
    return (
      "Meta rejected the request as invalid. The Facebook Page ID or a lead form " +
      "may be wrong, or the token can't see that Page." +
      metaSaid
    );
  }
  if (code === 1 || code === 2 || err.status >= 500) {
    return (
      `Meta's API had a temporary problem (HTTP ${err.status}). ` +
      "Try again in a few minutes; the next sync will catch up." +
      metaSaid
    );
  }
  return `Meta returned an error (HTTP ${err.status}${code !== undefined ? `, code ${code}` : ""}).${metaSaid}`;
}

function describeCause(cause: unknown): string {
  if (cause instanceof GraphApiError) return describeGraphError(cause);
  if (cause instanceof TypeError && /fetch failed|network/i.test(cause.message)) {
    return "Couldn't connect to Meta (network error or Meta is unreachable). Try again in a few minutes.";
  }
  if (cause instanceof Error) {
    if (/SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/.test(cause.message)) {
      return `The database connection isn't configured on this deployment: ${cause.message}`;
    }
    // Config errors from getPageAccessToken() are already written for staff.
    return cause.message;
  }
  return String(cause);
}

function rawDetail(err: unknown): string {
  if (err instanceof MetaLeadSyncError) return rawDetail(err.cause);
  if (err instanceof GraphApiError) return `HTTP ${err.status}: ${err.body}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** For a run that threw. */
export function describeSyncError(err: unknown): DescribedSyncError {
  if (err instanceof MetaLeadSyncError) {
    return {
      message: `Failed while ${err.step}. ${describeCause(err.cause)}`,
      detail: rawDetail(err),
    };
  }
  return { message: describeCause(err), detail: rawDetail(err) };
}

/** For a run that finished but couldn't save some leads. */
export function describeLeadFailures(
  failures: { error: string }[],
  pulled: number
): DescribedSyncError {
  const first = failures[0]?.error ?? "unknown error";
  const lead = pulled === 1 ? "lead" : "leads";
  return {
    message:
      `${failures.length} of ${pulled} ${lead} couldn't be saved to the database. ` +
      `First error: ${first}. The next sync will retry them.`,
    detail: failures.map((failure) => failure.error).join("\n"),
  };
}
