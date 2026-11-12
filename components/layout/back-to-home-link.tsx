import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** "Back to Home" link shown at the top of the public listing pages.
 * Same look as the "Back to Packages" link on package detail pages. */
export function BackToHomeLink() {
  return (
    <Link
      href="/"
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to Home
    </Link>
  );
}
