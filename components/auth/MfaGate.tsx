"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";

export interface MfaStatusDTO {
  enforced: boolean;
  required: boolean;
  reason: string;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  satisfied: boolean;
  factors: Array<{ id: string; type: string; friendlyName: string | null; status: string }>;
  recoveryCodesRemaining: number;
}

export async function fetchMfaStatus(): Promise<MfaStatusDTO | null> {
  try {
    const res = await apiFetch("/api/auth/mfa/status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MfaStatusDTO;
  } catch {
    return null;
  }
}

/** Inline TOTP enrolment: QR → first code → recovery codes. */
export function MfaEnrollCard({ onDone, compact }: { onDone: () => void; compact?: boolean }) {
  const [step, setStep] = useState<"start" | "scan" | "codes">("start");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/mfa/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start enrolment");
      setFactorId(data.factorId);
      setQr(data.qrCode);
      setSecret(data.secret);
      setStep("scan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/mfa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factorId, code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      setRecoveryCodes(data.recoveryCodes ?? []);
      setStep("codes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"} data-testid="mfa-enroll">
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {step === "start" && (
        <button type="button" onClick={start} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Set up authenticator app
        </button>
      )}
      {step === "scan" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
          {qr && (
            <img src={qr} alt="Authenticator QR code" width={180} height={180} className="rounded border bg-white p-2" />
          )}
          <p className="break-all font-mono text-xs text-gray-500" data-testid="mfa-secret">Manual key: {secret}</p>
          <div className="flex gap-2">
            <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="Authenticator code" className="w-32 rounded-md border px-3 py-2 font-mono text-sm" />
            <button type="button" onClick={verify} disabled={busy || code.length !== 6} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>
      )}
      {step === "codes" && (
        <div className="space-y-3" data-testid="mfa-recovery-codes">
          <p className="text-sm font-medium text-gray-900">Save these recovery codes</p>
          <p className="text-xs text-gray-600">Each code works once and resets two-factor authentication on this account. Store them somewhere safe; they are not shown again.</p>
          <ul className="grid grid-cols-2 gap-1 rounded-md border bg-gray-50 p-3 font-mono text-sm">
            {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <button type="button" onClick={onDone} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">I have saved my codes</button>
        </div>
      )}
    </div>
  );
}

/** Step-up for an aal1 session that already has a verified factor. */
export function MfaChallengeCard({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = recovery
        ? await apiFetch("/api/auth/mfa/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: recoveryCode }) })
        : await apiFetch("/api/auth/mfa/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="mfa-challenge">
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {!recovery ? (
        <>
          <p className="text-sm text-gray-700">Enter the 6-digit code from your authenticator app.</p>
          <div className="flex gap-2">
            <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="Authenticator code" className="w-32 rounded-md border px-3 py-2 font-mono text-sm" />
            <button type="button" onClick={submit} disabled={busy || code.length !== 6} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </button>
          </div>
          <button type="button" onClick={() => setRecovery(true)} className="text-xs text-gray-500 underline">Use a recovery code instead</button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-700">Enter one of your recovery codes. This resets two-factor authentication so you can set up a new authenticator.</p>
          <div className="flex gap-2">
            <input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="ABCDE-FGHJK" aria-label="Recovery code" className="w-44 rounded-md border px-3 py-2 font-mono text-sm" />
            <button type="button" onClick={submit} disabled={busy || recoveryCode.length < 8} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Use code
            </button>
          </div>
          <button type="button" onClick={() => setRecovery(false)} className="text-xs text-gray-500 underline">Back to authenticator code</button>
        </>
      )}
    </div>
  );
}

/**
 * Client mirror of the server-side MFA policy (T9). Renders children unless
 * enforcement is on, the policy requires aal2 and this session has not
 * proved it; then shows enrolment or the challenge inline.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<MfaStatusDTO | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setStatus(await fetchMfaStatus());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchMfaStatus().then((s) => { if (!cancelled) setStatus(s); });
    return () => { cancelled = true; };
  }, [user]);

  // Unknown or unreachable status never blocks (the server still enforces on every API call).
  if (status === undefined || status === null) return <>{children}</>;
  if (!status.enforced || !status.required || status.satisfied) return <>{children}</>;

  const needsEnrolment = status.nextLevel !== "aal2";
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4" data-testid="mfa-gate">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-ink" />
          <h1 className="text-lg font-semibold text-gray-900">{needsEnrolment ? "Set up two-factor authentication" : "Two-factor verification"}</h1>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          {needsEnrolment
            ? "Your role requires two-factor authentication. Set up an authenticator app to continue."
            : "Confirm it is you with your authenticator app to continue."}
        </p>
        {needsEnrolment ? <MfaEnrollCard onDone={refresh} compact /> : <MfaChallengeCard onDone={refresh} />}
        <button type="button" onClick={() => signOut()} className="mt-6 text-xs text-gray-500 underline">Sign out</button>
      </div>
    </div>
  );
}
