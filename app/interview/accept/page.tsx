"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-white/70 text-sm">Loading...</p>
          </div>
        </div>
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-white/70 text-sm">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Invitation Error</h1>
            <p className="text-white/60 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="mb-4">
              <span className="text-2xl font-bold text-white">Think5</span>
              <span className="text-2xl font-bold text-blue-500">.</span>
            </div>
            <CheckCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Interview Invitation</h1>
          </div>

          {invitation && (
            <div className="space-y-4 mb-6">
              {invitation.jobTitle && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-white/50 mb-1">Position</p>
                  <p className="text-sm font-medium text-white">{invitation.jobTitle}</p>
                </div>
              )}
              {invitation.companyName && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-white/50 mb-1">Company</p>
                  <p className="text-sm font-medium text-white">{invitation.companyName}</p>
                </div>
              )}
              {invitation.duration && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-white/50 mb-1">Duration</p>
                  <p className="text-sm font-medium text-white">{invitation.duration} minutes</p>
                </div>
              )}
              {invitation.recruiterName && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-white/50 mb-1">Invited by</p>
                  <p className="text-sm font-medium text-white">{invitation.recruiterName}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center mb-4">{error}</p>
          )}

          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-white text-black hover:bg-white/90 font-semibold py-3 rounded-full"
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              "Accept & Start Interview"
            )}
          </Button>

          <p className="text-xs text-white/40 text-center mt-4">
            By accepting, you agree to participate in an AI-powered interview. Your responses will be recorded and evaluated.
          </p>
        </div>
      </div>
    </div>
  );
}
