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
};

export default nextConfig;
