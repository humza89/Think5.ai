"use client";

import { useState, useCallback, useEffect } from "react";
import { Linkedin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
// Component
// ============================================

export function PersonalInfoStep({
  data,
  onChange,
  prefill,
}: PersonalInfoStepProps) {
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [hasPrefilled, setHasPrefilled] = useState(false);

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

  return (
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
            <Label htmlFor="linkedinUrl" className="flex items-center gap-1.5">
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
  );
}
