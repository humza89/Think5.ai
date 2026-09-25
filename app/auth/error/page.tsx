"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";
import { AuthShell, AuthNotice, authButton, authButtonGhost } from "@/components/marketing/AuthShell";
import { cn } from "@/lib/utils";
import { authErrorMessage } from "@/lib/auth-errors";

function ErrorContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || searchParams.get("error") || "unknown";
  const info = authErrorMessage(code);
  return (
    <AuthNotice tone="error" icon={<XCircle className="h-6 w-6" />} title={info.title}>
      <p className="mt-3 text-[15px] leading-relaxed text-graphite" data-testid="auth-error-description">
        {info.description}
      </p>
      <p className="mt-2 font-mono text-[12px] text-graphite/70" data-testid="auth-error-code">
        Code: {code}
      </p>
      <Link href="/auth/signin" className={cn(authButton, "mt-8")}>
        Back to sign in
      </Link>
      {info.contactSupport && (
        <Link href="/contact" className={cn(authButtonGhost, "mt-3")}>
          Contact support
        </Link>
      )}
    </AuthNotice>
  );
}

/** Phase 0 T9: one landing page for SSO / verification failures instead of opaque ?error= codes on the sign-in form. */
export default function AuthErrorPage() {
  return (
    <AuthShell title={<>Sign-in <span className="italic text-graphite">problem</span>.</>} backHref="/auth/signin" backLabel="Back to sign in">
      <Suspense fallback={null}>
        <ErrorContent />
      </Suspense>
    </AuthShell>
  );
}
