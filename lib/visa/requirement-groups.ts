export type RequirementGroup = { title: string; notes: string[] };

// "1. Passport" / "1) Passport" starts a new requirement.
const NUMBERED = /^\d+\s*[.)]\s*/;
// "➢ note", "- note", "• note", "> note" is a note under the last requirement.
const BULLET = /^[➢►▶•\-–*>]\s*/;

/**
 * Groups admin-entered requirement lines so sub-notes sit under their
 * numbered requirement. Lines that are neither numbered nor bulleted become
 * their own requirement, so plain one-per-line lists still work.
 */
export function groupRequirements(lines: string[]): RequirementGroup[] {
  const groups: RequirementGroup[] = [];
  for (const line of lines) {
    if (BULLET.test(line) && groups.length > 0) {
      groups[groups.length - 1].notes.push(line.replace(BULLET, ""));
    } else {
      groups.push({
        title: line.replace(NUMBERED, "").replace(BULLET, ""),
        notes: [],
      });
    }
  }
  return groups;
}
