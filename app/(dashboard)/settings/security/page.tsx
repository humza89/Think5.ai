"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api-client";
import { MfaChallengeCard, MfaEnrollCard, fetchMfaStatus, type MfaStatusDTO } from "@/components/auth/MfaGate";
import { toast } from "sonner";
import { ArrowLeft, Shield, Lock, Loader2, AlertTriangle, LogIn, ShieldCheck, KeyRound } from "lucide-react";

interface SessionInfo {
  current: {
    expiresAt: string | null;
    assuranceLevel: string | null;
    authenticationMethods: Array<{ method: string; at: string }>;
    lastSignInAt: string | null;
    createdAt: string;
    identities: Array<{ provider: string; lastSignInAt: string | null }>;
    verifiedFactors: number;
  };
  note: string;
}

interface PendingDeletion {
  id: string;
  status: string;
  gracePeriodEndsAt: string;
  requestedAt: string;
}

/**
 * Phase 0 T9: real security settings. Password change through
 * /api/account/password (re-authenticates first), TOTP MFA through the
 * /api/auth/mfa routes, other-device sign-out, and account deletion as a
 * 30-day-grace request.
 */
export default function SecuritySettingsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [mfa, setMfa] = useState<MfaStatusDTO | null>(null);
  const [mfaMode, setMfaMode] = useState<"idle" | "enroll" | "challenge" | "codes">("idle");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const refreshMfa = useCallback(async () => setMfa(await fetchMfaStatus()), []);
  const refreshSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/account/sessions", { cache: "no-store" });
      if (res.ok) setSessions(await res.json());
    } catch {
      /* non-fatal */
    }
  }, []);
  const refreshDeletion = useCallback(async () => {
    try {
      const res = await apiFetch("/api/account/delete", { cache: "no-store" });
      if (res.ok) setPendingDeletion((await res.json()).pending ?? null);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshMfa();
    refreshSessions();
    refreshDeletion();
  }, [user, refreshMfa, refreshSessions, refreshDeletion]);

  async function handleChangePassword() {
    if (!currentPassword.trim()) return void toast.warning("Please enter your current password");
    if (newPassword.length < 8) return void toast.warning("New password must be at least 8 characters");
    if (newPassword !== confirmPassword) return void toast.warning("Passwords do not match");
    setChangingPassword(true);
    try {
      const res = await apiFetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      toast.success("Password updated. Other devices were signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      refreshSessions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update password");
    }
    setChangingPassword(false);
  }

  async function removeFactor(factorId: string) {
    setMfaBusy(true);
    try {
      const res = await apiFetch("/api/auth/mfa/factor", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factorId }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "MFA_REQUIRED") setMfaMode("challenge");
        throw new Error(data.error || "Could not remove authenticator");
      }
      toast.success("Authenticator removed");
      await refreshMfa();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove authenticator");
    }
    setMfaBusy(false);
  }

  async function regenerateCodes() {
    setMfaBusy(true);
    try {
      const res = await apiFetch("/api/auth/mfa/factor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "regenerate-recovery-codes" }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "MFA_REQUIRED") setMfaMode("challenge");
        throw new Error(data.error || "Could not regenerate recovery codes");
      }
      setNewCodes(data.recoveryCodes);
      setMfaMode("codes");
      await refreshMfa();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate recovery codes");
    }
    setMfaBusy(false);
  }

  async function revokeOthers() {
    setRevoking(true);
    try {
      const res = await apiFetch("/api/account/sessions", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not sign out other devices");
      toast.success("Other devices were signed out");
      refreshSessions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign out other devices");
    }
    setRevoking(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return void toast.warning("Please type DELETE to confirm");
    setDeleting(true);
    try {
      const res = await apiFetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process account deletion");
      toast.success(data.message || "Account deletion request submitted");
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
      refreshDeletion();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process account deletion");
    }
    setDeleting(false);
  }

  async function cancelDeletion() {
    setDeleting(true);
    try {
      const res = await apiFetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not cancel");
      toast.success("Deletion request cancelled");
      refreshDeletion();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
    setDeleting(false);
  }

  const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Unknown";
  const accountCreated = user?.created_at ? new Date(user.created_at).toLocaleString() : "Unknown";
  const verifiedFactors = mfa?.factors.filter((f) => f.status === "verified") ?? [];

  return (
    <ProtectedRoute>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={() => router.push("/settings")} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Security</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your password, two-factor authentication and sessions</p>
        </div>

        <div className="space-y-6">
          {/* Two-factor authentication */}
          <Card data-testid="mfa-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-700" />
                <CardTitle className="text-lg">Two-factor authentication</CardTitle>
              </div>
              <CardDescription>
                {mfa?.required
                  ? "Required for your role. Sign-ins must be confirmed with an authenticator app."
                  : "Optional for your role. Add an authenticator app for a second sign-in step."}
                {mfa && !mfa.enforced && mfa.required && " Enforcement is not active yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mfa === null ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900" data-testid="mfa-state">
                        {verifiedFactors.length > 0 ? "Authenticator app enabled" : "Not set up"}
                      </p>
                      <p className="text-xs text-gray-500">
                        This session: {mfa.currentLevel === "aal2" ? "verified with two factors" : "password only"} · Recovery codes left: {mfa.recoveryCodesRemaining}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {verifiedFactors.length === 0 && mfaMode === "idle" && (
                        <Button size="sm" onClick={() => setMfaMode("enroll")}>Set up</Button>
                      )}
                      {verifiedFactors.length > 0 && mfaMode === "idle" && (
                        <>
                          {mfa.currentLevel !== "aal2" && (
                            <Button size="sm" variant="outline" onClick={() => setMfaMode("challenge")}>Verify now</Button>
                          )}
                          <Button size="sm" variant="outline" disabled={mfaBusy} onClick={regenerateCodes}>
                            <KeyRound className="h-4 w-4 mr-1" /> New recovery codes
                          </Button>
                          {verifiedFactors.map((f) => (
                            <Button key={f.id} size="sm" variant="outline" className="border-red-300 text-red-600" disabled={mfaBusy} onClick={() => removeFactor(f.id)}>
                              Remove
                            </Button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                  {mfaMode === "enroll" && <MfaEnrollCard onDone={() => { setMfaMode("idle"); refreshMfa(); }} />}
                  {mfaMode === "challenge" && <MfaChallengeCard onDone={() => { setMfaMode("idle"); refreshMfa(); }} />}
                  {mfaMode === "codes" && newCodes && (
                    <div className="space-y-3" data-testid="mfa-recovery-codes">
                      <p className="text-sm font-medium text-gray-900">Your new recovery codes</p>
                      <p className="text-xs text-gray-600">Previous codes no longer work. Each code works once and resets two-factor authentication.</p>
                      <ul className="grid grid-cols-2 gap-1 rounded-md border bg-gray-50 p-3 font-mono text-sm">
                        {newCodes.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                      <Button size="sm" onClick={() => { setMfaMode("idle"); setNewCodes(null); }}>Done</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Change Password</CardTitle>
              </div>
              <CardDescription>Update your password to keep your account secure. Other devices are signed out afterwards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" placeholder="Enter new password (min 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleChangePassword} disabled={changingPassword}>
                  {changingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Update Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Sessions</CardTitle>
              </div>
              <CardDescription>This session and sign-in history. Sign out other devices if you suspect misuse.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b"><span className="text-sm text-gray-500">Email</span><span className="text-sm font-medium text-gray-900">{user?.email ?? "---"}</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-sm text-gray-500">Last Sign In</span><span className="text-sm font-medium text-gray-900">{lastSignIn}</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-sm text-gray-500">Account Created</span><span className="text-sm font-medium text-gray-900">{accountCreated}</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-sm text-gray-500">This session</span><span className="text-sm font-medium text-gray-900" data-testid="session-aal">{sessions?.current.assuranceLevel === "aal2" ? "Two-factor verified" : "Password"}{sessions?.current.expiresAt ? ` · token renews ${new Date(sessions.current.expiresAt).toLocaleTimeString()}` : ""}</span></div>
                <div className="flex justify-between py-2"><span className="text-sm text-gray-500">Sign-in methods</span><span className="text-sm font-medium text-gray-900">{sessions?.current.identities.map((i) => i.provider).join(", ") || "email"}</span></div>
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-gray-500">{sessions?.note}</p>
                  <Button variant="outline" size="sm" disabled={revoking} onClick={revokeOthers}>
                    {revoking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Sign out other devices
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg text-red-600">Danger Zone</CardTitle>
              </div>
              <CardDescription>Deleting your account starts a 30-day grace period during which you can cancel.</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingDeletion ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="pending-deletion">
                  <div>
                    <p className="text-sm font-medium text-red-800">Deletion requested</p>
                    <p className="text-xs text-red-600">Your account will be deleted after {new Date(pendingDeletion.gracePeriodEndsAt).toLocaleDateString()} unless you cancel.</p>
                  </div>
                  <Button variant="outline" disabled={deleting} onClick={cancelDeletion}>{deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Cancel request</Button>
                </div>
              ) : !showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Delete Account</p>
                    <p className="text-xs text-gray-500">Permanently delete your account and all associated data</p>
                  </div>
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">This action cannot be undone after the grace period</p>
                      <p className="text-xs text-red-600 mt-1">This will permanently delete your account, all your data, job postings, candidate information, and interview records. Type <strong>DELETE</strong> below to confirm.</p>
                    </div>
                  </div>
                  <Input placeholder='Type "DELETE" to confirm' value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="border-red-300" />
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>Cancel</Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAccount} disabled={deleting || deleteConfirmText !== "DELETE"}>
                      {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Request deletion
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="flex items-center gap-2 text-xs text-gray-400"><Shield className="h-3.5 w-3.5" /> Security events are recorded in the audit log.</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
