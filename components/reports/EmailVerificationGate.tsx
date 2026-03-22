"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";

interface EmailVerificationGateProps {
  children: React.ReactNode;
  recipientEmailHash: string; // SHA-256 hash of expected email (don't leak actual email to client)
}

export function EmailVerificationGate({ children, recipientEmailHash }: EmailVerificationGateProps) {
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(false);

    // Hash the entered email client-side and compare
    const encoder = new TextEncoder();
    const data = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    if (hashHex === recipientEmailHash) {
      setVerified(true);
    } else {
      setError(true);
    }
  }

  if (verified) {
    return <>{children}</>;
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
              onChange={(e) => { setEmail(e.target.value); setError(false); }}
              required
            />
            {error && (
              <p className="text-sm text-red-500">
                Email does not match. Please check and try again.
              </p>
            )}
            <Button type="submit" className="w-full">
              Verify & View Report
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
