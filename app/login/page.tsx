import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Brand } from "@/components";
import { LoginForm } from "@/login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false }
};

export default function LoginPage() {
  return (
    <section className="login-page">
      <div className="login-card">
        <Brand />
        <div className="login-icon"><LockKeyhole size={22} /></div>
        <span className="eyebrow">Restricted access</span>
        <h1>Sign in to manage content.</h1>
        <p>Use your authorized Apostolic Guide admin email and password.</p>
        <LoginForm />
        <Link className="back-link" href="/"><ArrowLeft size={16} /> Return to website</Link>
      </div>
    </section>
  );
}
