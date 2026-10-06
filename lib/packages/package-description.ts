/**
 * Meta description for a package detail page, built from fields every
 * package already has -- there's no free-text description column, and
 * `remarks` is usually empty or holds booking terms rather than a pitch.
 *
 * e.g. "Hong Kong Macau 4D3N tour package from ₱29,888 per pax. Includes
 * roundtrip airfare and daily breakfast. Inquire with TravelSentro on
 * WhatsApp or Messenger.", or for a name that already says "Tour" and
 * omits its destination, "Bangkok-Pattaya 4D3N Tour in Thailand from
 * ₱25,888 per pax. ..."
 *
 * Kept within MAX_LENGTH (roughly what Google shows before truncating) by
 * adding pieces only while they fit: the lead sentence always, then as
 * many inclusions as fit, then the call to action.
 */

const MAX_LENGTH = 160;
const CALL_TO_ACTION = "Inquire with TravelSentro on WhatsApp or Messenger.";

function includesText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** "a", "a and b", "a, b and c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

export function buildPackageDescription({
  name,
  durationLabel,
  destinationName,
  pricePerPax,
  inclusions,
}: {
  name: string;
  durationLabel: string | null;
  destinationName: string | null;
  pricePerPax: number;
  /** Included-item labels, already in display order. */
  inclusions: string[];
}): string {
  // Package names usually already carry the duration and destination
  // ("Hong Kong Macau 4D3N") -- only add what the name is missing, so the
  // lead doesn't read "Hong Kong Macau 4D3N (4D3N)".
  let subject = name.trim();
  if (durationLabel && !includesText(subject, durationLabel)) {
    subject = `${subject} (${durationLabel.trim()})`;
  }
  // Many names already end in "Tour" or "Packages" -- don't follow them
  // with "tour package" again ("Singapore Malaysia 5D3N Tour tour package").
  const namesItsKind = /\b(tours?|packages?)\b/i.test(name);
  const missingDestination =
    destinationName && !includesText(name, destinationName)
      ? destinationName
      : null;
  const qualifier = missingDestination
    ? namesItsKind
      ? ` in ${missingDestination}`
      : ` — ${missingDestination} tour package`
    : namesItsKind
      ? ""
      : " tour package";

  const lead = `${subject}${qualifier} from ₱${pricePerPax.toLocaleString("en-PH")} per pax.`;
  if (lead.length >= MAX_LENGTH) return truncateAtWord(lead, MAX_LENGTH);

  let description = lead;

  const labels = inclusions.map((label) => label.trim()).filter(Boolean);
  let fitted: string[] = [];
  for (const label of labels) {
    const candidate = [...fitted, label];
    if (`${description} Includes ${joinList(candidate)}.`.length > MAX_LENGTH) break;
    fitted = candidate;
  }
  if (fitted.length > 0) {
    description = `${description} Includes ${joinList(fitted)}.`;
  }

  if (`${description} ${CALL_TO_ACTION}`.length <= MAX_LENGTH) {
    description = `${description} ${CALL_TO_ACTION}`;
  }

  return description;
}
