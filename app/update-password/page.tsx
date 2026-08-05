import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components";
import { UpdatePasswordForm } from "@/update-password-form";

export const metadata: Metadata = {
  title: "Set admin password",
  robots: { index: false, follow: false }
};

export default function UpdatePasswordPage() {
  return (
    <section className="login-page">
      <div className="login-card">
        <Brand />
        <div className="login-icon"><ShieldCheck size={22} /></div>
        <span className="eyebrow">Secure account</span>
        <h1>Choose a new password.</h1>
        <p>Use at least 12 characters and store it in your password manager.</p>
        <UpdatePasswordForm />
      </div>
    </section>
  );
}
