"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Mail } from "lucide-react";
import { useState, Suspense } from "react";

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

  if (success) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">
          Email verified!
        </h1>
        <p className="text-white/60 mb-8">
          Your email has been successfully verified. You can now sign in to your account.
        </p>
        <Link href="/auth/signin">
          <Button className="w-full h-12 bg-white text-black hover:bg-white/90 font-medium">
            Sign in to your account
          </Button>
        </Link>
      </div>
    );
  }

  if (error) {
    const errorInfo = errorMessages[error] || errorMessages.server_error;
    const showResendForm = ["expired_token", "invalid_token"].includes(error);

    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          {error === "expired_token" ? (
            <Clock className="w-8 h-8 text-red-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-400" />
          )}
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">
          {errorInfo.title}
        </h1>
        <p className="text-white/60 mb-8">
          {errorInfo.description}
        </p>

        {showResendForm && !resendSuccess && (
          <div className="mb-6">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:outline-none mb-3"
            />
            <Button
              onClick={handleResendEmail}
              disabled={!email || isResending}
              className="w-full h-12 bg-blue-500 text-white hover:bg-blue-600 font-medium"
            >
              {isResending ? "Sending..." : "Resend verification email"}
            </Button>
          </div>
        )}

        {resendSuccess && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
            <p className="text-green-400 text-sm">
              A new verification email has been sent. Please check your inbox.
            </p>
          </div>
        )}

        <Link href="/auth/signin">
          <Button variant="outline" className="w-full h-12 border-white/20 text-white hover:bg-white/10 bg-transparent">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  // Default state - waiting for verification
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
      <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <Mail className="w-8 h-8 text-blue-400" />
      </div>
      <h1 className="text-2xl font-semibold text-white mb-2">
        Check your email
      </h1>
      <p className="text-white/60 mb-8">
        We&apos;ve sent you a verification link. Please click the link in your email to verify your account.
      </p>

      <div className="space-y-4">
        <p className="text-sm text-white/50">
          Didn&apos;t receive the email? Check your spam folder or request a new one below.
        </p>

        {!resendSuccess ? (
          <div>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:outline-none mb-3"
            />
            <Button
              onClick={handleResendEmail}
              disabled={!email || isResending}
              variant="outline"
              className="w-full h-12 border-white/20 text-white hover:bg-white/10 bg-transparent"
            >
              {isResending ? "Sending..." : "Resend verification email"}
            </Button>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <p className="text-green-400 text-sm">
              A new verification email has been sent. Please check your inbox.
            </p>
          </div>
        )}

        <Link href="/auth/signin" className="block">
          <Button variant="link" className="text-blue-400 hover:text-blue-300">
            Back to sign in
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black" />

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <span className="text-2xl font-bold text-white">think5</span>
          <span className="text-2xl font-bold text-blue-500">.</span>
        </div>

        <Suspense fallback={
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div className="animate-pulse">
              <div className="w-16 h-16 bg-white/10 rounded-full mx-auto mb-6"></div>
              <div className="h-8 bg-white/10 rounded mb-2"></div>
              <div className="h-4 bg-white/10 rounded"></div>
            </div>
          </div>
        }>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  );
}
