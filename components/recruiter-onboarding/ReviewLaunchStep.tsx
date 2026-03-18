"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { User, Building2, Users, Settings2 } from "lucide-react";
import type { RecruiterOnboardingData } from "@/types/recruiter-onboarding";

interface ReviewLaunchStepProps {
  data: RecruiterOnboardingData;
  onAcknowledge: (value: boolean) => void;
}

export function ReviewLaunchStep({ data, onAcknowledge }: ReviewLaunchStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Review & Launch</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review your setup before activating your account.
        </p>
      </div>

      {/* Personal Info */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-foreground">Personal Info</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span>{" "}
            <span className="text-foreground">{data.personalInfo.name || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Title:</span>{" "}
            <span className="text-foreground">{data.personalInfo.title || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Department:</span>{" "}
            <span className="text-foreground">{data.personalInfo.department || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Phone:</span>{" "}
            <span className="text-foreground">{data.personalInfo.phone || "—"}</span>
          </div>
          {data.personalInfo.linkedinUrl && (
            <div className="col-span-2">
              <span className="text-muted-foreground">LinkedIn:</span>{" "}
              <span className="text-foreground truncate">{data.personalInfo.linkedinUrl}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Company */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-foreground">Company</h3>
        </div>
        {data.company.name ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Company:</span>{" "}
              <span className="text-foreground">{data.company.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Mode:</span>{" "}
              <Badge variant="outline" className="ml-1 text-xs">
                {data.company.mode === "create" ? "Created new" : "Joined existing"}
              </Badge>
            </div>
            {data.company.industry && (
              <div>
                <span className="text-muted-foreground">Industry:</span>{" "}
                <span className="text-foreground">{data.company.industry}</span>
              </div>
            )}
            {data.company.headquarters && (
              <div>
                <span className="text-muted-foreground">HQ:</span>{" "}
                <span className="text-foreground">{data.company.headquarters}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No company set up</p>
        )}
      </Card>

      {/* Team */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-foreground">Team Invitations</h3>
        </div>
        {data.teamInvitations.length > 0 ? (
          <div className="space-y-2">
            {data.teamInvitations.map((inv, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{inv.email}</span>
                <Badge variant="outline" className="text-xs">
                  {inv.role.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No team members invited (can be done later)</p>
        )}
      </Card>

      {/* Hiring Preferences */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-foreground">Hiring Preferences</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Evaluation Criteria:</span>
            {data.hiringPreferences.evaluationCriteria.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {data.hiringPreferences.evaluationCriteria.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
            ) : (
              <span className="text-foreground ml-1">None set</span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Preferred Attributes:</span>
            {data.hiringPreferences.preferredAttributes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {data.hiringPreferences.preferredAttributes.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                ))}
              </div>
            ) : (
              <span className="text-foreground ml-1">None set</span>
            )}
          </div>
        </div>
      </Card>

      {/* Acknowledgment */}
      <div className="flex items-start gap-3 p-4 border border-border rounded-lg bg-muted/50">
        <Checkbox
          id="acknowledge"
          checked={data.acknowledged}
          onCheckedChange={(checked) => onAcknowledge(!!checked)}
        />
        <Label htmlFor="acknowledge" className="text-sm text-foreground leading-relaxed cursor-pointer">
          I confirm that the information provided is accurate and I&apos;m ready to launch my
          recruiter account on Think5.
        </Label>
      </div>
    </div>
  );
}
