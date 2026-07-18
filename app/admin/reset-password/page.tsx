import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/admin/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password | TravelSentro Admin",
};

// Deliberately outside app/admin/(dashboard)/ — a user arriving here from the
// reset-link is not yet re-authenticated into a normal session in a way the
// dashboard layout's profile/session gate should apply to.
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold mb-6">
          Set a New Password
        </h1>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
