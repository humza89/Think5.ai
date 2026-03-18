"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Linkedin,
  Camera,
  Loader2,
  Sparkles,
  Upload,
  X,
  RotateCcw,
  Check,
  ImagePlus,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PersonalInfoData } from "@/lib/validations/onboarding";

// ============================================
// Types
// ============================================

interface PrefillData {
  firstName?: string;
  lastName?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  location?: string;
}

interface HeadshotVariant {
  url: string;
  label: string;
  key: string;
}

interface PersonalInfoStepProps {
  data: PersonalInfoData;
  onChange: (updates: Partial<PersonalInfoData>) => void;
  prefill: PrefillData | null;
}

// ============================================
// Helpers
// ============================================

const LINKEDIN_REGEX =
  /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;

function validateLinkedinUrl(url: string): string | null {
  if (!url) return "LinkedIn profile URL is required";
  if (!LINKEDIN_REGEX.test(url)) {
    return "Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourname)";
  }
  return null;
}

// ============================================
// Sub-components
// ============================================

function ShimmerCard() {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-border">
      <div className="relative aspect-square animate-pulse bg-muted">
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
        </div>
      </div>
      <div className="bg-background p-2">
        <div className="mx-auto h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

// ============================================
// Component
// ============================================

export function PersonalInfoStep({
  data,
  onChange,
  prefill,
}: PersonalInfoStepProps) {
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [headshots, setHeadshots] = useState<HeadshotVariant[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply prefill data once on mount (only for empty fields)
  useEffect(() => {
    if (prefill && !hasPrefilled) {
      const updates: Partial<PersonalInfoData> = {};
      if (prefill.firstName && !data.firstName)
        updates.firstName = prefill.firstName;
      if (prefill.lastName && !data.lastName)
        updates.lastName = prefill.lastName;
      if (prefill.linkedinUrl && !data.linkedinUrl)
        updates.linkedinUrl = prefill.linkedinUrl;
      if (prefill.jobTitle && !data.jobTitle)
        updates.jobTitle = prefill.jobTitle;
      if (prefill.location && !data.location)
        updates.location = prefill.location;

      if (Object.keys(updates).length > 0) {
        onChange(updates);
      }
      setHasPrefilled(true);
    }
  }, [prefill, hasPrefilled, data, onChange]);

  const handleChange = useCallback(
    (field: keyof PersonalInfoData, value: string) => {
      onChange({ [field]: value });
      if (field === "linkedinUrl" && linkedinError) {
        setLinkedinError(null);
      }
    },
    [onChange, linkedinError]
  );

  const handleLinkedinBlur = useCallback(() => {
    const error = validateLinkedinUrl(data.linkedinUrl);
    setLinkedinError(error);
  }, [data.linkedinUrl]);

  // ------------------------------------------
  // Photo upload → AI headshot generation
  // ------------------------------------------
  const handlePhotoUpload = useCallback(
    async (file: File) => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Please upload a JPG, PNG, or WebP image.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5MB.");
        return;
      }

      setIsGenerating(true);
      setHeadshots([]);
      setSelectedKey(null);
      setApiMessage(null);
      onChange({ profileImage: "" });

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/candidate/onboarding/photo-upload", {
          method: "POST",
          body: formData,
        });

        const result = await res.json();

        if (!res.ok) {
          toast.error(result.error || "Failed to upload photo");
          return;
        }

        setOriginalUrl(result.original?.url || null);
        setHeadshots(result.variants || []);
        if (result.message) setApiMessage(result.message);

        // If only 1 variant (fallback), auto-select it
        if (result.variants?.length === 1) {
          const v = result.variants[0];
          setSelectedKey(v.key);
          onChange({ profileImage: v.url });
          toast.success("Photo processed!");
        } else {
          toast.success("Headshots generated! Pick your favorite.");
        }
      } catch {
        toast.error("Failed to upload photo. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    },
    [onChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePhotoUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handlePhotoUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handlePhotoUpload(file);
    },
    [handlePhotoUpload]
  );

  const selectVariant = useCallback(
    (variant: HeadshotVariant) => {
      setSelectedKey(variant.key);
      onChange({ profileImage: variant.url });
      toast.success(`${variant.label} selected!`);
    },
    [onChange]
  );

  const useOriginal = useCallback(() => {
    if (originalUrl) {
      setSelectedKey("original");
      onChange({ profileImage: originalUrl });
      toast.info("Using original photo.");
    }
  }, [originalUrl, onChange]);

  const resetPhoto = useCallback(() => {
    setHeadshots([]);
    setOriginalUrl(null);
    setSelectedKey(null);
    setApiMessage(null);
    onChange({ profileImage: "" });
  }, [onChange]);

  const changeStyle = useCallback(() => {
    setSelectedKey(null);
    onChange({ profileImage: "" });
  }, [onChange]);

  // Initials for placeholder
  const initials =
    [data.firstName?.[0], data.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  // UI states
  const hasVariants = headshots.length > 0;
  const isSelecting = hasVariants && !selectedKey;
  const hasSelected = hasVariants && !!selectedKey;

  return (
    <div className="space-y-6">
      {/* Profile Photo Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-foreground">
            Profile Photo
          </CardTitle>
          <CardDescription>
            Upload a photo and our AI will generate 3 professional headshot
            styles for you to choose from.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ---- State: No photo yet / Generating ---- */}
          {!hasVariants && (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* Upload area */}
              <div
                className="group relative flex h-32 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted transition-colors hover:border-primary"
                onClick={() =>
                  !isGenerating && fileInputRef.current?.click()
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-[10px] text-muted-foreground">
                      Generating...
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-3xl font-bold text-muted-foreground">
                      {initials}
                    </span>
                    <Camera className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}

                {!isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Upload className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Generating 3 headshots...
                    </>
                  ) : (
                    <>
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                      Upload Photo
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, or WebP up to 5MB. Our AI will create 3 different
                  professional headshot styles from your photo.
                </p>
              </div>
            </div>
          )}

          {/* ---- Loading shimmer (while generating) ---- */}
          {isGenerating && (
            <div className="space-y-3">
              <p className="text-center text-sm font-medium text-muted-foreground">
                <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />
                Our AI is creating 3 professional headshot styles...
              </p>
              <div className="grid grid-cols-3 gap-3">
                <ShimmerCard />
                <ShimmerCard />
                <ShimmerCard />
              </div>
            </div>
          )}

          {/* ---- Selection grid ---- */}
          {isSelecting && !isGenerating && (
            <div className="space-y-4">
              <p className="text-center text-sm font-medium text-foreground">
                <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />
                Choose your favorite headshot:
              </p>

              <div className="grid grid-cols-3 gap-3">
                {headshots.map((hs) => (
                  <button
                    key={hs.key}
                    type="button"
                    onClick={() => selectVariant(hs)}
                    className="group relative overflow-hidden rounded-lg border-2 border-border bg-background transition-all hover:border-primary hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={hs.url}
                        alt={hs.label}
                        fill
                        className="object-cover object-center transition-transform group-hover:scale-105"
                        unoptimized
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Check className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="px-2 py-1.5 text-center">
                      <span className="text-xs font-medium text-foreground">
                        {hs.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Action buttons below grid */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {originalUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={useOriginal}
                  >
                    Use Original Instead
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetPhoto}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Upload Different Photo
                </Button>
              </div>

              {apiMessage && (
                <p className="text-center text-xs text-muted-foreground">
                  {apiMessage}
                </p>
              )}
            </div>
          )}

          {/* ---- Selected variant preview ---- */}
          {hasSelected && !isGenerating && (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* Selected avatar */}
              <div className="relative">
                <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-primary shadow-md">
                  <Image
                    src={data.profileImage || ""}
                    alt="Selected headshot"
                    fill
                    className="object-cover object-center"
                    unoptimized
                  />
                </div>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={resetPhoto}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform hover:scale-110"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Info + actions */}
              <div className="flex flex-1 flex-col gap-2 text-center sm:text-left">
                <Badge
                  variant="secondary"
                  className="w-fit gap-1 self-center text-[10px] sm:self-start"
                >
                  <Sparkles className="h-3 w-3" />
                  AI Generated
                </Badge>

                <p className="text-xs text-muted-foreground">
                  {headshots.find((h) => h.key === selectedKey)?.label ||
                    "Original"}{" "}
                  headshot selected.
                </p>

                <div className="flex flex-wrap gap-2">
                  {headshots.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={changeStyle}
                    >
                      Change Style
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetPhoto}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Upload New Photo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
        </CardContent>
      </Card>

      {/* Personal Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-foreground">
            Personal Information
          </CardTitle>
          <CardDescription>
            Tell us a bit about yourself so recruiters can reach you.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Name row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Jane"
                value={data.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={data.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
              />
            </div>
          </div>

          {/* Phone & Location row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={data.phone ?? ""}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="San Francisco, CA"
                value={data.location ?? ""}
                onChange={(e) => handleChange("location", e.target.value)}
              />
            </div>
          </div>

          {/* LinkedIn — mandatory */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="linkedinUrl"
                className="flex items-center gap-1.5"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn Profile URL
              </Label>
              <Badge variant="destructive" className="text-[10px] uppercase">
                Required
              </Badge>
            </div>
            <Input
              id="linkedinUrl"
              placeholder="https://linkedin.com/in/yourname"
              value={data.linkedinUrl}
              onChange={(e) => handleChange("linkedinUrl", e.target.value)}
              onBlur={handleLinkedinBlur}
              className={linkedinError ? "border-destructive" : ""}
            />
            {linkedinError && (
              <p className="text-sm text-destructive">{linkedinError}</p>
            )}
          </div>

          {/* Job Title */}
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Current Job Title</Label>
            <Input
              id="jobTitle"
              placeholder="Senior Software Engineer"
              value={data.jobTitle ?? ""}
              onChange={(e) => handleChange("jobTitle", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
