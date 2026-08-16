import type { Metadata } from "next";

// Covers every route under /admin (login, forgot-password, reset-password,
// auth/confirm, and the (dashboard) group) with a single noindex — a second,
// independent layer on top of the /admin disallow in app/robots.ts, since a
// robots.txt disallow alone doesn't stop an already-linked page from being
// indexed without its content.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
