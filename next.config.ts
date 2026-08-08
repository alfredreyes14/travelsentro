import type { NextConfig } from "next";

// Derived from NEXT_PUBLIC_R2_PUBLIC_URL rather than hardcoded so a future
// custom-domain swap (see docs/superpowers/specs/2026-08-08-r2-image-storage-design.md's
// Future: Production Domain section) only requires changing the env var, not this file.
// Required, not optional -- every image in the app resolves through this
// hostname, so a missing/malformed value should fail the build loudly
// instead of silently degrading to an empty remotePatterns list (which lets
// the build succeed but makes every image fail at runtime with a confusing
// next/image error).
if (!process.env.NEXT_PUBLIC_R2_PUBLIC_URL) {
  throw new Error("NEXT_PUBLIC_R2_PUBLIC_URL must be set");
}

let r2Hostname: string;
try {
  r2Hostname = new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).hostname;
} catch {
  throw new Error(
    `NEXT_PUBLIC_R2_PUBLIC_URL is not a valid URL: "${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}" ` +
      `(did you forget the "https://" prefix?)`
  );
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // All uploaded images (package photos, destination photos, hero
        // slides, partner logos, testimonial photos) now live in the
        // single R2 bucket behind this hostname -- replaces the two
        // Supabase Storage patterns this project used before the R2
        // migration (docs/superpowers/plans/2026-08-08-r2-image-storage.md).
        hostname: r2Hostname,
      },
    ],
  },
  experimental: {
    serverActions: {
      // Default 1MB is too small for realistic phone/DSLR photos once
      // base64-encoded (~33% overhead); raised to a bounded value rather
      // than left unlimited (02-REVIEW.md CR-01, T-02-38). Paired with
      // photo-manager.tsx sending one file per Server Action call so a
      // single request never carries more than one photo's payload.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
