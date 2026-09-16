"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, XCircle, Clock, Mail } from "lucide-react";
import { useState, Suspense } from "react";
import { AuthShell, AuthNotice, authField, authButton, authButtonGhost } from "@/components/marketing/AuthShell";
import { cn } from "@/lib/utils";

function VerifyContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const errorMessages: Record<string, { title: string; description: string }> = {
    missing_token: {
      title: "Missing verification link",
      description: "The verification link appears to be incomplete. Please try clicking the link in your email again.",
    },
    invalid_token: {
      title: "Invalid verification link",
      description: "This verification link is invalid or has already been used. Please request a new verification email.",
    },
    expired_token: {
      title: "Link expired",
      description: "This verification link has expired. Please request a new verification email below.",
    },
    user_not_found: {
      title: "Account not found",
      description: "We couldn't find an account associated with this verification link.",
    },
    server_error: {
      title: "Something went wrong",
      description: "An error occurred while verifying your email. Please try again later.",
    },
  };

  const handleResendEmail = async () => {
    if (!email) return;

    setIsResending(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setResendSuccess(true);
      }
    } catch (err) {
      console.error("Failed to resend email:", err);
    } finally {
      setIsResending(false);
    }
  };

  const resendForm = (
    <div className="mt-6 space-y-3">
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(authField, "flex w-full border px-4 focus:outline-none")}
        aria-label="Email address"
      />
      <button onClick={handleResendEmail} disabled={!email || isResending} className={authButton}>
        {isResending ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );

  const resent = (
    <div className="mt-6 rounded-xl border border-stone bg-paper px-4 py-3">
      <p className="text-[14px] text-ink">A new verification email has been sent. Please check your inbox.</p>
    </div>
  );

  if (success) {
    return (
      <AuthNotice tone="success" icon={<Check className="h-6 w-6" />} title="Email verified">
        <p className="mt-3 text-[15px] leading-relaxed text-graphite">
          Your email has been successfully verified. You can now sign in to your account.
        </p>
        <Link href="/auth/signin" className={cn(authButton, "mt-8")}>
          Sign in to your account
        </Link>
      </AuthNotice>
    );
  }

  if (error) {
    const errorInfo = errorMessages[error] || errorMessages.server_error;
    const showResendForm = ["expired_token", "invalid_token"].includes(error);

    return (
      <AuthNotice tone="error" icon={error === "expired_token" ? <Clock className="h-6 w-6" /> : <XCircle className="h-6 w-6" />} title={errorInfo.title}>
        <p className="mt-3 text-[15px] leading-relaxed text-graphite">{errorInfo.description}</p>
        {showResendForm && !resendSuccess && resendForm}
        {resendSuccess && resent}
        <Link href="/auth/signin" className={cn(authButtonGhost, "mt-4")}>
          Back to sign in
        </Link>
      </AuthNotice>
    );
  }

  return (
    <AuthNotice icon={<Mail className="h-6 w-6" />} title="Check your email">
      <p className="mt-3 text-[15px] leading-relaxed text-graphite">
        We&apos;ve sent you a verification link. Click the link in your email to verify your account.
      </p>
      <p className="mt-4 text-[13px] text-graphite">Didn&apos;t receive it? Check your spam folder or request a new one.</p>
      {!resendSuccess ? resendForm : resent}
      <Link href="/auth/signin" className="mt-6 inline-block text-[14px] font-medium text-ink underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </AuthNotice>
  );
}

export default function VerifyPage() {
  return (
    <AuthShell title={<>Verify your <span className="italic text-graphite">email</span>.</>} backHref="/auth/signin" backLabel="Back to sign in">
      <Suspense
        fallback={
          <div className="animate-pulse rounded-[24px] border border-stone bg-paper-2 p-8">
            <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-stone" />
            <div className="mb-2 h-8 rounded bg-stone" />
            <div className="h-4 rounded bg-stone" />
          </div>
        }
      >
        <VerifyContent />
      </Suspense>
    </AuthShell>
  );
}
