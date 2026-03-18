"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  OnboardingWizard,
  type OnboardingData,
  type PrefillData,
} from "@/components/onboarding/OnboardingWizard";

/** Convert an ISO date string (or Date) to MM/YYYY for form display */
function toMMYYYY(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const DEFAULT_DATA: OnboardingData = {
  personalInfo: {
    firstName: "",
    lastName: "",
    phone: "",
    location: "",
    linkedinUrl: "",
    jobTitle: "",
  },
  resume: { fileUrl: "", filename: "", mimeType: "", fileSize: 0 },
  aiProfile: {
    fullName: "",
    currentTitle: "",
    currentCompany: "",
    skills: [],
    experienceYears: null,
    summary: "",
  },
  experiences: [],
  skills: [],
  education: [],
  certifications: [],
  preferences: {
    preferredTitles: [],
    preferredLocations: [],
    remotePreference: "FLEXIBLE",
    employmentTypes: [],
    salaryMin: "",
    salaryMax: "",
    currency: "USD",
    availability: "IMMEDIATELY",
    noticePeriod: "",
    willingToRelocate: false,
    workAuthorization: "",
    preferredIndustries: [],
    preferredCompanies: [],
  },
  consentGdpr: false,
  consentDataProcessing: false,
};

export default function OnboardingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialStep, setInitialStep] = useState(1);
  const [initialData, setInitialData] = useState<OnboardingData>(DEFAULT_DATA);
  const [prefill, setPrefill] = useState<PrefillData | null>(null);

  useEffect(() => {
    async function loadOnboardingState() {
      try {
        const res = await fetch("/api/candidate/onboarding");
        if (!res.ok) throw new Error("Failed to load onboarding state");

        const state = await res.json();

        // Set initial step (resume to where they left off, minimum 1)
        setInitialStep(Math.max(1, (state.step || 0) + 1));

        // Hydrate data from server
        const data: OnboardingData = { ...DEFAULT_DATA };

        // Personal info
        if (state.personalInfo) {
          data.personalInfo = {
            firstName: state.personalInfo.firstName || "",
            lastName: state.personalInfo.lastName || "",
            phone: state.personalInfo.phone || "",
            location: state.personalInfo.location || "",
            linkedinUrl: state.personalInfo.linkedinUrl || "",
            jobTitle: state.personalInfo.jobTitle || "",
          };
        }

        // Resume
        if (state.resume) {
          data.resume = {
            fileUrl: state.resume.fileUrl || "",
            filename: state.resume.filename || "",
            mimeType: state.resume.mimeType || "",
            fileSize: state.resume.fileSize || 0,
          };
        }

        // Experiences
        if (state.experiences?.length) {
          data.experiences = state.experiences.map((exp: Record<string, unknown>) => ({
            id: (exp.id as string) || crypto.randomUUID(),
            company: (exp.company as string) || "",
            title: (exp.title as string) || "",
            startDate: toMMYYYY(exp.startDate),
            endDate: toMMYYYY(exp.endDate),
            isCurrent: (exp.isCurrent as boolean) || false,
            description: (exp.description as string) || "",
            location: (exp.location as string) || "",
          }));
        }

        // Skills
        if (state.skills?.length) {
          data.skills = state.skills.map((skill: Record<string, unknown>) => ({
            id: (skill.id as string) || crypto.randomUUID(),
            name: (skill.skillName as string) || "",
            proficiency: (skill.proficiency as number) || 3,
          }));
        }

        // Education
        if (state.education?.length) {
          data.education = state.education.map((edu: Record<string, unknown>) => ({
            id: (edu.id as string) || crypto.randomUUID(),
            institution: (edu.institution as string) || "",
            degree: (edu.degree as string) || "",
            fieldOfStudy: (edu.field as string) || "",
            startDate: toMMYYYY(edu.startDate),
            endDate: toMMYYYY(edu.endDate),
          }));
        }

        // Certifications
        if (state.certifications?.length) {
          data.certifications = state.certifications.map((cert: Record<string, unknown>) => ({
            id: (cert.id as string) || crypto.randomUUID(),
            name: (cert.name as string) || "",
            issuingOrganization: (cert.issuingOrg as string) || "",
            issueDate: toMMYYYY(cert.issueDate),
            expiryDate: toMMYYYY(cert.expiryDate),
            credentialId: (cert.credentialId as string) || "",
          }));
        }

        // Job preferences
        if (state.jobPreferences) {
          const jp = state.jobPreferences;
          data.preferences = {
            ...DEFAULT_DATA.preferences,
            preferredLocations: jp.preferredLocations || [],
            remotePreference: jp.remotePreference || "FLEXIBLE",
            salaryMin: jp.salaryMin ? String(jp.salaryMin) : "",
            salaryMax: jp.salaryMax ? String(jp.salaryMax) : "",
            currency: jp.salaryCurrency || "USD",
            availability: jp.availability || "IMMEDIATELY",
            willingToRelocate: jp.willingToRelocate || false,
            noticePeriod: jp.noticePeriod || "",
            employmentTypes: jp.jobTypes || [],
            preferredIndustries: jp.preferredIndustries || [],
            preferredCompanies: jp.preferredCompanies || [],
          };
        }

        setInitialData(data);

        // Set prefill from passive profile if available
        if (state.prefill) {
          setPrefill({
            firstName: state.prefill.firstName,
            lastName: state.prefill.lastName,
            linkedinUrl: state.prefill.linkedinUrl,
            jobTitle: state.prefill.currentTitle,
            location: undefined,
          });
        }
      } catch (err) {
        console.error("Failed to load onboarding state:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadOnboardingState();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome to Think5
        </h1>
        <p className="mt-2 text-muted-foreground">
          Complete your profile to join our curated talent network and unlock AI-powered interviews.
        </p>
      </div>

      <OnboardingWizard
        initialStep={initialStep}
        initialData={initialData}
        prefill={prefill}
      />
    </div>
  );
}
