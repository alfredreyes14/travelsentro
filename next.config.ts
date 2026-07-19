import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // Concrete Supabase project ref isn't known until the project is
        // provisioned (next plan); pathname is scoped tightly to the
        // package-photos bucket's public objects so the Image Optimizer
        // can't be tricked into proxy-fetching arbitrary Supabase-hosted
        // content outside this bucket (RESEARCH.md Pitfall 3).
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/package-photos/**",
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
