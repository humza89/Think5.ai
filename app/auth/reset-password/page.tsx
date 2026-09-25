"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Eye, EyeOff } from "lucide-react";
import { AuthShell, AuthError, AuthNotice, Spinner, authField, authButton } from "@/components/marketing/AuthShell";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <AuthNotice title="Invalid link" tone="error">
        <p className="mt-3 text-[15px] leading-relaxed text-graphite">This password reset link is invalid or has expired.</p>
        <Link href="/auth/forgot-password" className={cn(authButton, "mt-8")}>
          Request a new link
        </Link>
      </AuthNotice>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthNotice tone="success" icon={<Check className="h-6 w-6" />} title="Password updated">
        <p className="mt-3 text-[15px] leading-relaxed text-graphite">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <Link href="/auth/signin" className={cn(authButton, "mt-8")}>
          Sign in
        </Link>
      </AuthNotice>
    );
  }

  return (
    <>
      {error && <AuthError>{error}</AuthError>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-[13px] text-ink">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authField} pr-11`}
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite transition-colors hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-[13px] text-ink">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={authField}
            required
            minLength={8}
          />
        </div>

        <button type="submit" className={authButton} disabled={isLoading}>
          {isLoading ? <Spinner label="Resetting…" /> : "Reset password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title={<>Create a new <span className="italic text-graphite">password</span>.</>}
      subtitle="Must be at least 8 characters."
      backHref="/auth/signin"
      backLabel="Back to sign in"
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone border-t-ink" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
