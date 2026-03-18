"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecruiterPersonalInfo } from "@/types/recruiter-onboarding";

interface PersonalInfoStepProps {
  data: RecruiterPersonalInfo;
  onChange: (data: RecruiterPersonalInfo) => void;
}

export function PersonalInfoStep({ data, onChange }: PersonalInfoStepProps) {
  const update = (field: keyof RecruiterPersonalInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Personal & Professional Info</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about yourself so your team and candidates can recognize you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            placeholder="John Smith"
            value={data.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Job Title</Label>
          <Input
            id="title"
            placeholder="Senior Recruiter"
            value={data.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            placeholder="Talent Acquisition"
            value={data.department}
            onChange={(e) => update("department", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            placeholder="+1 (555) 000-0000"
            value={data.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedinUrl">LinkedIn Profile URL</Label>
        <Input
          id="linkedinUrl"
          placeholder="https://linkedin.com/in/yourname"
          value={data.linkedinUrl}
          onChange={(e) => update("linkedinUrl", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          placeholder="Brief description of your recruiting experience and specialties..."
          value={data.bio}
          onChange={(e) => update("bio", e.target.value)}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">{data.bio.length}/2000 characters</p>
      </div>
    </div>
  );
}
