/**
 * "Name (email)" for pickers and lists, falling back to the phone number
 * for contacts that have no email.
 */
export function contactLabel(contact: {
  name: string;
  email: string | null;
  phone?: string | null;
}): string {
  const detail = contact.email || contact.phone;
  return detail ? `${contact.name} (${detail})` : contact.name;
}

/** The contacts that can receive an email. */
export function withEmail<T extends { email: string | null }>(
  contacts: readonly T[]
): (T & { email: string })[] {
  return contacts.filter(
    (contact): contact is T & { email: string } =>
      typeof contact.email === "string" && contact.email.trim() !== ""
  );
}
