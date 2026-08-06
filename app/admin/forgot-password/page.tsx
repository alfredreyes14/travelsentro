import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/admin/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password | TravelSentro Admin",
};

// Deliberately outside app/admin/(dashboard)/ — same reason as /admin/login.
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold mb-6">
          Forgot Password
        </h1>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
