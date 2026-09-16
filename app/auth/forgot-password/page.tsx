"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { AuthShell, AuthError, AuthNotice, Spinner, authField, authButton } from "@/components/marketing/AuthShell";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell title="Check your email" backHref="/auth/signin" backLabel="Back to sign in">
        <AuthNotice tone="success" icon={<Check className="h-6 w-6" />} title="Reset link sent">
          <p className="mt-3 text-[15px] leading-relaxed text-graphite">
            If an account with <span className="font-medium text-ink">{email}</span> exists, we&apos;ve sent a password
            reset link. The link expires in 1 hour.
          </p>
          <Link href="/auth/signin" className={cn(authButton, "mt-8")}>
            Return to sign in
          </Link>
        </AuthNotice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={<>Forgot your <span className="italic text-graphite">password</span>?</>}
      subtitle="Enter your email address and we'll send you a link to reset it."
      backHref="/auth/signin"
      backLabel="Back to sign in"
    >
      {error && <AuthError>{error}</AuthError>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] text-ink">Email address</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={authField} required />
        </div>
        <button type="submit" className={authButton} disabled={isLoading}>
          {isLoading ? <Spinner label="Sending…" /> : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
