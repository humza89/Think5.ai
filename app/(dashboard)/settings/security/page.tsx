"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Shield, Lock, Loader2, AlertTriangle, LogIn } from "lucide-react";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleChangePassword() {
    if (!currentPassword.trim()) {
      toast.warning("Please enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      toast.warning("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      // Simulate password change (replace with actual Supabase auth call)
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to update password");
    }
    setChangingPassword(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      toast.warning("Please type DELETE to confirm");
      return;
    }

    setDeleting(true);
    try {
      // Simulate account deletion (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Account deletion request submitted");
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
    } catch {
      toast.error("Failed to process account deletion");
    }
    setDeleting(false);
  }

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : "Unknown";

  const accountCreated = user?.created_at
    ? new Date(user.created_at).toLocaleString()
    : "Unknown";

  return (
    <ProtectedRoute>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Security</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your password and account security
          </p>
        </div>

        <div className="space-y-6">
          {/* Change Password */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Change Password</CardTitle>
              </div>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleChangePassword} disabled={changingPassword}>
                  {changingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Update Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Session Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Session Information</CardTitle>
              </div>
              <CardDescription>
                Details about your current session and login history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm text-gray-500">Email</span>
                  <span className="text-sm font-medium text-gray-900">
                    {user?.email ?? "---"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm text-gray-500">Last Sign In</span>
                  <span className="text-sm font-medium text-gray-900">{lastSignIn}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-500">Account Created</span>
                  <span className="text-sm font-medium text-gray-900">{accountCreated}</span>
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
              <CardDescription>
                Irreversible actions that affect your account permanently
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Delete Account</p>
                    <p className="text-xs text-gray-500">
                      Permanently delete your account and all associated data
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        This action cannot be undone
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        This will permanently delete your account, all your data, job postings,
                        candidate information, and interview records. Type{" "}
                        <strong>DELETE</strong> below to confirm.
                      </p>
                    </div>
                  </div>
                  <Input
                    placeholder='Type "DELETE" to confirm'
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="border-red-300"
                  />
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText !== "DELETE"}
                    >
                      {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Permanently Delete
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
