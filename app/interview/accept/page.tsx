"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { cn } from "@/lib/utils";

interface InvitationData {
  id: string;
  status: string;
  email: string | null;
  expiresAt: string;
  jobTitle: string | null;
  companyName: string | null;
  companyLogo: string | null;
  templateName: string | null;
  duration: number | null;
  recruiterName: string | null;
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="py-10 text-center">
            <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-white/60" />
            <p className="text-sm text-white/60">Loading…</p>
          </div>
        </Shell>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);

  // Validate the invitation token on mount
  useEffect(() => {
    if (!token) {
      setError("No invitation token provided.");
      setLoading(false);
      return;
    }

    // Security: Remove token from URL to prevent it appearing in browser history
    if (typeof window !== "undefined" && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }

    async function validateToken() {
      try {
        const res = await fetch(`/api/auth/invite?token=${encodeURIComponent(token!)}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Invalid invitation.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setInvitation(data.invitation);
      } catch {
        setError("Failed to validate invitation.");
      } finally {
        setLoading(false);
      }
    }

    validateToken();
  }, [token]);

  // Accept the invitation
  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch("/api/interviews/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to accept invitation.");
        setAccepting(false);
        return;
      }

      const { interviewId } = await res.json();
      // Cookie is set by the API — redirect without token in URL
      router.push(`/interview/${interviewId}`);
    } catch {
      setError("Failed to accept invitation. Please try again.");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="py-10 text-center">
          <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-white/60" />
          <p className="text-sm text-white/60">Validating your invitation…</p>
        </div>
      </Shell>
    );
  }

  if (error && !invitation) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h1 className="font-display text-[32px] leading-tight text-white">Invitation error</h1>
          <p className="mt-3 text-[14px] text-white/60">{error}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">Interview invitation</p>
        <h1 className="mt-3 font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-white">
          You&apos;ve been invited to <span className="italic text-white/60">interview</span>.
        </h1>
      </div>

      {invitation && (
        <dl className="mb-8 divide-y divide-white/10 border-y border-white/10">
          {invitation.jobTitle && <Row label="Position" value={invitation.jobTitle} />}
          {invitation.companyName && <Row label="Company" value={invitation.companyName} />}
          {invitation.duration && <Row label="Duration" value={`${invitation.duration} minutes`} />}
          {invitation.recruiterName && <Row label="Invited by" value={invitation.recruiterName} />}
        </dl>
      )}

      {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

      <button
        onClick={handleAccept}
        disabled={accepting}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-medium text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {accepting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Starting…
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4" /> Accept &amp; start interview
          </>
        )}
      </button>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-white/40">
        By accepting, you agree to participate in an AI-powered interview. Your responses will be recorded and evaluated.
      </p>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-[12px] uppercase tracking-[0.12em] text-white/45">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-white">{value}</dd>
    </div>
  );
}

/** Ink shell: this page leads straight into the (dark) interview UI. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-16">
      <div className="dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <LogoMark size={40} tone="light" />
        </div>
        <div className="rounded-[24px] border border-white/10 bg-ink-2 p-8">{children}</div>
      </div>
    </div>
  );
}
