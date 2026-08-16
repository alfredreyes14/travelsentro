import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared fallback OG image for every public route that doesn't define its
// own (e.g. home, /contact) — package detail pages override this with a
// package photo via their own generateMetadata (see [slug]/page.tsx).
export const alt = "TravelSentro — Philippines Tour Packages";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(
    join(process.cwd(), "public/logo.png"),
    "base64"
  );
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "#021f4a",
        }}
      >
        <img
          src={logoSrc}
          width={520}
          height={144}
          alt="TravelSentro"
          style={{ objectFit: "contain" }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 28px",
            borderRadius: 999,
            background: "#f49314",
            color: "#faf7f2",
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          Philippines Tour Packages
        </div>
      </div>
    ),
    { ...size }
  );
}
