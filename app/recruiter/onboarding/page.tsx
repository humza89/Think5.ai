"use client";

import { useState, useEffect } from "react";
import { RecruiterOnboardingWizard } from "@/components/recruiter-onboarding/RecruiterOnboardingWizard";
import type { RecruiterOnboardingData, RecruiterOnboardingResponse } from "@/types/recruiter-onboarding";

const DEFAULT_DATA: RecruiterOnboardingData = {
  personalInfo: {
    name: "",
    title: "",
    department: "",
    phone: "",
    linkedinUrl: "",
    profileImage: "",
    bio: "",
  },
  company: {
    mode: null,
  },
  teamInvitations: [],
  hiringPreferences: {
    evaluationCriteria: [],
    preferredAttributes: [],
  },
  acknowledged: false,
};

export default function RecruiterOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [initialStep, setInitialStep] = useState(0);
  const [initialData, setInitialData] = useState<RecruiterOnboardingData>(DEFAULT_DATA);

  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch("/api/recruiter/onboarding");
        if (!res.ok) {
          setLoading(false);
          return;
        }

        const resp: RecruiterOnboardingResponse = await res.json();

        const prefs = resp.recruiter.hiringPreferences;

        setInitialData({
          personalInfo: {
            name: resp.recruiter.name || "",
            title: resp.recruiter.title || "",
            department: resp.recruiter.department || "",
            phone: resp.recruiter.phone || "",
            linkedinUrl: resp.recruiter.linkedinUrl || "",
            profileImage: resp.recruiter.profileImage || "",
            bio: resp.recruiter.bio || "",
          },
          company: resp.company
            ? {
                mode: "join" as const,
                companyId: resp.company.id,
                name: resp.company.name,
                industry: resp.company.industry || "",
                companySize: resp.company.companySize || "",
                website: resp.company.website || "",
                description: resp.company.description || "",
                logoUrl: resp.company.logoUrl || "",
                domain: resp.company.domain || "",
                brandColor: resp.company.brandColor || "",
                tagline: resp.company.tagline || "",
                regions: resp.company.regions || [],
                headquarters: resp.company.headquarters || "",
              }
            : { mode: null },
          teamInvitations: (resp.teamInvitations ?? []).map((inv) => ({
            email: inv.email,
            name: inv.name || "",
            role: inv.role,
            department: "",
          })),
          hiringPreferences: {
            evaluationCriteria: prefs?.evaluationCriteria || [],
            preferredAttributes: prefs?.preferredAttributes || [],
            defaultTemplateId: prefs?.defaultTemplateId || "",
          },
          acknowledged: false,
        });

        setInitialStep(resp.step);
      } catch {
        // On error, start fresh
      }
      setLoading(false);
    }

    loadOnboarding();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-sm">T5</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <RecruiterOnboardingWizard
      initialStep={initialStep}
      initialData={initialData}
    />
  );
}
