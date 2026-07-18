import type { Metadata } from "next";

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
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold mb-6">
          Log In
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
