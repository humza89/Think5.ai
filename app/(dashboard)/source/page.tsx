"use client";

import { useState, useRef, useCallback, type DragEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Search,
  Linkedin,
  FileText,
  Upload,
  Loader2,
  CheckCircle,
} from "lucide-react";
import ProfilePreviewCard from "@/components/recruiter/ProfilePreviewCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  currentCompany: string;
  linkedinUrl: string;
  skills: string[];
  notes: string;
}

interface ImportedProfile {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  linkedinUrl?: string | null;
  skills?: string[];
  notes?: string | null;
  fullName?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPreviewData(profile: ImportedProfile): Partial<ProfileData> {
  let firstName = profile.firstName ?? "";
  let lastName = profile.lastName ?? "";

  if (!firstName && !lastName && profile.fullName) {
    const parts = profile.fullName.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  return {
    id: profile.id,
    firstName,
    lastName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    currentTitle: profile.currentTitle ?? "",
    currentCompany: profile.currentCompany ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    skills: profile.skills ?? [],
    notes: profile.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SourcePage() {
  // LinkedIn import state
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [importingLinkedin, setImportingLinkedin] = useState(false);

  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewProfile, setPreviewProfile] = useState<Partial<ProfileData> | null>(null);
  const [previewProfileId, setPreviewProfileId] = useState<string | undefined>(undefined);

  // ---------------------------------------------------------------------------
  // LinkedIn Import
  // ---------------------------------------------------------------------------

  async function handleLinkedinImport() {
    const url = linkedinUrl.trim();
    if (!url) {
      toast.error("Please enter a LinkedIn profile URL");
      return;
    }

    setImportingLinkedin(true);
    try {
      const res = await fetch("/api/passive-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url, source: "linkedin" }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Import failed (${res.status})`);
      }

      const profile: ImportedProfile = await res.json();

      toast.success("LinkedIn profile imported successfully");
      setLinkedinUrl("");
      setPreviewProfile(toPreviewData(profile));
      setPreviewProfileId(profile.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import LinkedIn profile";
      toast.error(message);
    } finally {
      setImportingLinkedin(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Resume Upload
  // ---------------------------------------------------------------------------

  async function handleResumeUpload() {
    if (!resumeFile) {
      toast.error("Please select a resume file");
      return;
    }

    setUploadingResume(true);
    try {
      // Step 1: Upload the file to /api/upload
      const formData = new FormData();
      formData.append("file", resumeFile);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => null);
        throw new Error(errBody?.error ?? `File upload failed (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      const resumeUrl = uploadData.resumeUrl ?? uploadData.url ?? `/uploads/${uploadData.filename}`;
      const filename = uploadData.filename ?? resumeFile.name;

      // Step 2: Create a passive profile from the uploaded resume
      const profileRes = await fetch("/api/passive-profiles/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "resume",
          resumeUrl,
          filename,
        }),
      });

      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => null);
        throw new Error(errBody?.error ?? `Profile creation failed (${profileRes.status})`);
      }

      const profileData = await profileRes.json();
      const profiles = profileData.profiles ?? [];
      const created = profiles[0] as ImportedProfile | undefined;

      if (created) {
        toast.success("Resume uploaded and profile created");
        setPreviewProfile(toPreviewData(created));
        setPreviewProfileId(created.id);
      } else {
        toast.success("Resume uploaded successfully");
      }

      setResumeFile(null);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload resume";
      toast.error(message);
    } finally {
      setUploadingResume(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers
  // ---------------------------------------------------------------------------

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload a PDF or DOCX file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be under 5MB");
        return;
      }
      setResumeFile(file);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be under 5MB");
        return;
      }
      setResumeFile(file);
    }
  }

  // ---------------------------------------------------------------------------
  // ProfilePreviewCard handlers
  // ---------------------------------------------------------------------------

  async function handleProfileSave(data: ProfileData) {
    const id = data.id ?? previewProfileId;
    if (!id) {
      toast.error("No profile to save. Please import a profile first.");
      return;
    }

    try {
      const res = await fetch(`/api/passive-profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          email: data.email || null,
          phone: data.phone || null,
          currentTitle: data.currentTitle || null,
          currentCompany: data.currentCompany || null,
          linkedinUrl: data.linkedinUrl || null,
          skills: data.skills,
          notes: data.notes || null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Save failed (${res.status})`);
      }

      toast.success("Profile saved successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save profile";
      toast.error(message);
      throw err;
    }
  }

  async function handleProfileSaveAndNew(data: ProfileData) {
    await handleProfileSave(data);
    setPreviewProfile(null);
    setPreviewProfileId(undefined);
    setLinkedinUrl("");
    setResumeFile(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
  }

  function handleSendInvitation() {
    toast.info("Invitation feature coming soon");
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Search className="h-6 w-6" />
          Source Candidates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import candidates from LinkedIn or upload resumes
        </p>
      </div>

      {/* Source tabs */}
      <Tabs defaultValue="linkedin" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
          <TabsTrigger value="linkedin" className="gap-1.5">
            <Linkedin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">LinkedIn Import</span>
            <span className="sm:hidden">LinkedIn</span>
          </TabsTrigger>
          <TabsTrigger value="resume" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resume Upload</span>
            <span className="sm:hidden">Resume</span>
          </TabsTrigger>
        </TabsList>

        {/* LinkedIn Import */}
        <TabsContent value="linkedin">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import from LinkedIn</CardTitle>
              <CardDescription>
                Enter a LinkedIn profile URL to import candidate information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://linkedin.com/in/username"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleLinkedinImport();
                      }
                    }}
                    disabled={importingLinkedin}
                    className="pl-9 bg-background"
                  />
                </div>
                <Button
                  onClick={handleLinkedinImport}
                  disabled={importingLinkedin || !linkedinUrl.trim()}
                >
                  {importingLinkedin ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Linkedin className="h-4 w-4 mr-2" />
                  )}
                  Import Profile
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste the full LinkedIn profile URL. We will extract the candidate&apos;s
                professional information.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resume Upload */}
        <TabsContent value="resume">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Resume</CardTitle>
              <CardDescription>
                Upload a resume to automatically extract candidate information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!resumeFile) resumeInputRef.current?.click();
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer",
                  resumeFile
                    ? "border-green-300 bg-green-50/50 dark:bg-green-950/20 cursor-default"
                    : isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                )}
              >
                {resumeFile ? (
                  <div className="text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">{resumeFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(resumeFile.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResumeFile(null);
                        if (resumeInputRef.current) resumeInputRef.current.value = "";
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">
                      Drag &amp; drop or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Accepted formats: PDF, DOCX (max 5MB)
                    </p>
                  </div>
                )}
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {resumeFile && (
                <Button
                  onClick={handleResumeUpload}
                  disabled={uploadingResume}
                  className="w-full sm:w-auto"
                >
                  {uploadingResume ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload Resume
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Profile Preview Card */}
      {previewProfile && (
        <ProfilePreviewCard
          initialData={previewProfile}
          profileId={previewProfileId}
          onSave={handleProfileSave}
          onSaveAndNew={handleProfileSaveAndNew}
          onSendInvitation={handleSendInvitation}
        />
      )}
    </div>
  );
}
