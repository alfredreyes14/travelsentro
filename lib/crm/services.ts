/**
 * What a B2C customer availed. The same keys are enforced by the
 * contacts_services_availed_known check constraint.
 */
export const SERVICE_KEYS = [
  "tour_package",
  "visa_services",
  "custom_tour",
  "flight_accommodation",
  "other",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  tour_package: "Tour Package",
  visa_services: "Visa Services",
  custom_tour: "Custom Tour",
  flight_accommodation: "Flight / Accommodation",
  other: "Other",
};

/** Service keys read from the database, with anything unknown dropped. */
export function toServiceKeys(values: readonly string[]): ServiceKey[] {
  return values.filter((value): value is ServiceKey =>
    (SERVICE_KEYS as readonly string[]).includes(value)
  );
}
