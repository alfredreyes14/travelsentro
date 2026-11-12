import type { Metadata } from "next";

import Image from "next/image";

import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "Log In | TravelSentro Admin",
};

// Deliberately outside app/admin/(dashboard)/ — must never call the DAL's
// profile/session checks, or an unauthenticated visitor gets redirect-looped
// away from the login page itself.
export default function AdminLoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="sr-only">Log In</h1>
        <Image
          src="/logo.png"
          alt="TravelSentro — Built for Business. Ready for Travelers."
          width={1600}
          height={386}
          className="mb-8 h-14 w-auto"
          priority
        />
        <LoginForm />
      </div>
    </main>
  );
}
