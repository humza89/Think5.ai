"use client";

import { useState } from "react";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/types/supabase";
import { Eye, EyeOff, Check } from "lucide-react";
import { AuthShell, AuthError, AuthNotice, Spinner, authField, authButton } from "@/components/marketing/AuthShell";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

// Only Candidate and Recruiter can self-register
const roles: { value: UserRole; label: string; description: string }[] = [
  {
    value: "candidate",
    label: "Candidate",
    description: "Looking for job opportunities",
  },
  {
    value: "recruiter",
    label: "Recruiter",
    description: "Hiring for multiple companies",
  },
];

export default function SignUpPage() {

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("candidate");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      const response = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role: selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell title={<>Almost <span className="italic text-graphite">there</span>.</>} backHref="/auth/signin" backLabel="Back to sign in" wide>
        <AuthNotice tone="success" icon={<Check className="h-6 w-6" />} title="Check your email">
          <p className="mt-3 text-[15px] leading-relaxed text-graphite">
            We&apos;ve sent a confirmation link to <strong className="font-medium text-ink">{email}</strong>. Click the
            link to verify your account.
          </p>
          <Link href="/auth/signin" className={cn(authButton, "mt-8")}>
            Go to sign in
          </Link>
        </AuthNotice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={<>Create your <span className="italic text-graphite">account</span>.</>}
      subtitle="Join the network of experts and teams building frontier AI."
      quote={<>Only the top 1% make it in. <span className="italic text-white/60">Let&apos;s find out</span> if that&apos;s you.</>}
      wide
    >
      {error && <AuthError>{error}</AuthError>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Role */}
        <div className="space-y-2">
          <Label className="text-[13px] text-ink">I am a…</Label>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((role) => {
              const active = selectedRole === role.value;
              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    active ? "border-ink bg-paper-2 ring-1 ring-ink" : "border-stone bg-paper-2/60 hover:border-graphite"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-[22px] leading-none text-ink">{role.label}</p>
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", active ? "border-ink bg-ink text-white" : "border-stone")}>
                      {active && <Check className="h-2.5 w-2.5" />}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-graphite">{role.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-[13px] text-ink">First name</Label>
            <Input id="firstName" type="text" placeholder="Ada" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={authField} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-[13px] text-ink">Last name</Label>
            <Input id="lastName" type="text" placeholder="Lovelace" value={lastName} onChange={(e) => setLastName(e.target.value)} className={authField} required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] text-ink">Work email</Label>
          <Input id="email" type="email" placeholder="ada@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={authField} required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[13px] text-ink">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${authField} pr-11`}
                required
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
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={authField}
              required
            />
          </div>
        </div>

        <button type="submit" className={authButton} disabled={isLoading}>
          {isLoading ? <Spinner label="Creating account…" /> : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-graphite">
        By signing up, you agree to our{" "}
        <Link href="/terms" className="text-ink underline underline-offset-4">Terms</Link> and{" "}
        <Link href="/privacy" className="text-ink underline underline-offset-4">Privacy Policy</Link>.
      </p>

      <p className="mt-8 border-t border-stone pt-6 text-center text-[14px] text-graphite">
        Already have an account?{" "}
        <Link href="/auth/signin" className="font-medium text-ink underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
