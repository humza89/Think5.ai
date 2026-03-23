"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2 } from "lucide-react";

interface EmailVerificationGateProps {
  token: string;
}

export function EmailVerificationGate({ token }: EmailVerificationGateProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/reports/shared/${token}/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        // Cookie is set by the server — reload page to get full report data
        router.refresh();
      } else {
        const data = await res.json();
        if (res.status === 429) {
          setError("Too many attempts. Please try again in 15 minutes.");
        } else {
          setError(data.error || "Email does not match. Please check and try again.");
        }
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Email Verification Required
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            This report is restricted. Please enter the email address this report was shared with to view it.
          </p>
          <form onSubmit={handleVerify} className="space-y-4">
            <Input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              required
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & View Report"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
