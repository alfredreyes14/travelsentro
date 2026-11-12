import { getPublicImageUrl } from "@/lib/storage/image-url";
import type { Tables } from "@/types/database";

export type PublicVisaService = {
  id: string;
  slug: string;
  country: string;
  description: string | null;
  processingTime: string | null;
  price: number | null;
  requirements: string[];
  photoUrl: string | null;
};

export function visaServicePath(service: { slug: string }) {
  return `/visa/${service.slug}`;
}

/** Maps a visa_services row to the shape the homepage card and detail page use. */
export function toPublicVisaService(
  row: Tables<"visa_services">
): PublicVisaService {
  return {
    id: row.id,
    slug: row.slug,
    country: row.country,
    description: row.description,
    processingTime: row.processing_time,
    price: row.price,
    // Admins enter requirements one per line.
    requirements: (row.requirements ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    photoUrl: row.photo_storage_path
      ? getPublicImageUrl(row.photo_storage_path)
      : null,
  };
}
