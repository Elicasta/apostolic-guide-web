import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Brand } from "@/components";
import { PasswordRecoveryForm } from "@/password-recovery-form";

export const metadata: Metadata = {
  title: "Reset admin password",
  robots: { index: false, follow: false }
};

export default function ForgotPasswordPage() {
  return (
    <section className="login-page">
      <div className="login-card">
        <Brand />
        <div className="login-icon"><KeyRound size={22} /></div>
        <span className="eyebrow">Account recovery</span>
        <h1>Reset your password.</h1>
        <p>Enter your authorized admin email. We’ll send a secure reset link.</p>
        <PasswordRecoveryForm />
        <Link className="back-link" href="/"><ArrowLeft size={16} /> Return to website</Link>
      </div>
    </section>
  );
}
