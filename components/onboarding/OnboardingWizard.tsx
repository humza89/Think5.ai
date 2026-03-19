"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  FileText,
  Bot,
  Briefcase,
  GraduationCap,
  Settings2,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  PersonalInfoData,
  ResumeUploadData,
  AIProfileReviewData,
  ExperienceStepData,
  SkillsEducationStepData,
  PreferencesStepData,
  ReviewSubmitData,
} from "@/lib/validations/onboarding";
import { PersonalInfoStep } from "./PersonalInfoStep";
import { ResumeUploadStep } from "./ResumeUploadStep";
import { AIProfileReviewStep } from "./AIProfileReviewStep";
import ExperienceStep from "./ExperienceStep";
import type { ExperienceEntry } from "./ExperienceStep";
import SkillsEducationStep from "./SkillsEducationStep";
import type { Skill, EducationEntry, CertificationEntry } from "./SkillsEducationStep";
import PreferencesStep from "./PreferencesStep";
import type { JobPreferences, PreferencesErrors } from "./PreferencesStep";
import { validatePreferences } from "./PreferencesStep";
import ReviewSubmitStep from "./ReviewSubmitStep";

// ============================================
// Helpers
// ============================================

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02",
  mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11",
  dec: "12", december: "12",
};

/** Normalize date strings to MM/YYYY for form display */
function normalizeDate(val: string | undefined | null): string {
  if (!val) return "";
  const v = val.trim();
  if (!v || v.toLowerCase() === "present" || v.toLowerCase() === "current") return "";
  // Already MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(v)) {
    const [m, y] = v.split("/");
    return `${m.padStart(2, "0")}/${y}`;
  }
  // "Oct 2022", "October 2022", "Oct. 2022"
  const monthName = v.match(/^([A-Za-z]+)[.,]?\s+(\d{4})$/);
  if (monthName) {
    const mm = MONTH_MAP[monthName[1].toLowerCase()];
    if (mm) return `${mm}/${monthName[2]}`;
  }
  // "2022-10" or "2022-10-01"
  const iso = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) return `${iso[2].padStart(2, "0")}/${iso[1]}`;
  // "10-2022"
  const dash = v.match(/^(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[1].padStart(2, "0")}/${dash[2]}`;
  // Just a year
  if (/^\d{4}$/.test(v)) return `01/${v}`;
  // Try Date parsing as last resort
  const d = new Date(v);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return "";
}

// ============================================
// Types
// ============================================

export interface OnboardingData {
  personalInfo: PersonalInfoData;
  resume: ResumeUploadData & { parsedData?: AIProfileReviewData };
  aiProfile: AIProfileReviewData;
  experiences: ExperienceEntry[];
  skills: Skill[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  preferences: JobPreferences;
  consentGdpr: boolean;
  consentDataProcessing: boolean;
}

export interface PrefillData {
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  location?: string;
  profileImage?: string;
}

interface OnboardingWizardProps {
  initialStep: number;
  initialData: OnboardingData;
  prefill: PrefillData | null;
}

// ============================================
// Step metadata
// ============================================

const STEPS = [
  { number: 1, title: "Personal Info", icon: User },
  { number: 2, title: "Resume Upload", icon: FileText },
  { number: 3, title: "AI Profile Review", icon: Bot },
  { number: 4, title: "Work Experience", icon: Briefcase },
  { number: 5, title: "Skills & Education", icon: GraduationCap },
  { number: 6, title: "Preferences", icon: Settings2 },
  { number: 7, title: "Review & Submit", icon: ClipboardCheck },
] as const;

const TOTAL_STEPS = STEPS.length;

// ============================================
// Component
// ============================================

export function OnboardingWizard({
  initialStep,
  initialData,
  prefill,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(
    Math.max(1, Math.min(initialStep, TOTAL_STEPS))
  );
  const [data, setData] = useState<OnboardingData>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [preferencesErrors, setPreferencesErrors] = useState<PreferencesErrors>({});

  const progressValue = (currentStep / TOTAL_STEPS) * 100;
  const currentStepMeta = STEPS[currentStep - 1];

  // ------------------------------------------
  // Persist step data to the API
  // ------------------------------------------
  const saveStep = useCallback(
    async (step: number, stepData: Record<string, unknown>) => {
      setIsSaving(true);
      try {
        const res = await fetch("/api/candidate/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, data: stepData }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.message ?? `Failed to save (${res.status})`
          );
        }

        toast.success("Progress saved");
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        toast.error(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  // ------------------------------------------
  // Navigation
  // ------------------------------------------
  const handleNext = useCallback(async () => {
    // Determine which slice of data belongs to the current step
    const stepDataMap: Record<number, Record<string, unknown>> = {
      1: data.personalInfo,
      2: data.resume,
      3: data.aiProfile,
      4: { experiences: data.experiences },
      5: { skills: data.skills, education: data.education, certifications: data.certifications },
      6: data.preferences as unknown as Record<string, unknown>,
      7: { consentGdpr: data.consentGdpr, consentDataProcessing: data.consentDataProcessing },
    };

    // Client-side validation for step 6 (Preferences)
    if (currentStep === 6) {
      const errors = validatePreferences(data.preferences);
      if (Object.keys(errors).length > 0) {
        setPreferencesErrors(errors);
        toast.error("Please fill in all required fields");
        return;
      }
      setPreferencesErrors({});
    }

    const saved = await saveStep(currentStep, stepDataMap[currentStep]);
    if (saved && currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    } else if (saved && currentStep === TOTAL_STEPS) {
      // Onboarding complete — redirect to status page
      window.location.href = "/candidate/onboarding/status";
    }
  }, [currentStep, data, saveStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // ------------------------------------------
  // Data updaters for each step
  // ------------------------------------------
  const updatePersonalInfo = useCallback(
    (updates: Partial<PersonalInfoData>) => {
      setData((prev) => ({
        ...prev,
        personalInfo: { ...prev.personalInfo, ...updates },
      }));
    },
    []
  );

  const updateResume = useCallback(
    (updates: Partial<OnboardingData["resume"]>) => {
      setData((prev) => ({
        ...prev,
        resume: { ...prev.resume, ...updates },
      }));
    },
    []
  );

  const updateAIProfile = useCallback(
    (updates: Partial<AIProfileReviewData>) => {
      setData((prev) => ({
        ...prev,
        aiProfile: { ...prev.aiProfile, ...updates },
      }));
    },
    []
  );

  // ------------------------------------------
  // Render current step
  // ------------------------------------------
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <PersonalInfoStep
            data={data.personalInfo}
            onChange={updatePersonalInfo}
            prefill={prefill}
          />
        );
      case 2:
        return (
          <ResumeUploadStep
            data={data.resume}
            onUploadComplete={(resumeData) => {
              updateResume(resumeData);
              if (resumeData.parsedData) {
                updateAIProfile(resumeData.parsedData);

                // Auto-fill experiences, skills, education, certifications from AI-parsed resume
                const pd = resumeData.parsedData as AIProfileReviewData & {
                  experiences?: Array<{
                    company: string; title: string; startDate: string;
                    endDate: string; isCurrent: boolean; description: string; location: string;
                  }>;
                  education?: Array<{
                    institution: string; degree: string; fieldOfStudy: string;
                    startDate: string; endDate: string;
                  }>;
                  certifications?: Array<{
                    name: string; issuingOrganization: string;
                    issueDate: string; expiryDate: string;
                  }>;
                  skillDetails?: Array<{
                    name: string; proficiency: number; category: string;
                  }>;
                };

                // Debug: log what dates we received from the AI
                console.log("[Wizard] Parsed experience dates from AI:",
                  pd.experiences?.map(e => ({ company: e.company, startDate: e.startDate, endDate: e.endDate })));

                setData((prev) => {
                  const updates: Partial<OnboardingData> = {};

                  // Only populate if currently empty (don't overwrite manual edits)
                  if (prev.experiences.length === 0 && pd.experiences && pd.experiences.length > 0) {
                    updates.experiences = pd.experiences.map((exp) => ({
                      id: crypto.randomUUID(),
                      company: exp.company || "",
                      title: exp.title || "",
                      startDate: normalizeDate(exp.startDate),
                      endDate: normalizeDate(exp.endDate),
                      isCurrent: exp.isCurrent || false,
                      description: exp.description || "",
                      location: exp.location || "",
                    }));
                    console.log("[Wizard] Auto-filled experience dates:",
                      updates.experiences.map(e => ({ company: e.company, startDate: e.startDate, endDate: e.endDate })));
                  }

                  if (prev.education.length === 0 && pd.education && pd.education.length > 0) {
                    updates.education = pd.education.map((edu) => ({
                      id: crypto.randomUUID(),
                      institution: edu.institution || "",
                      degree: edu.degree || "",
                      fieldOfStudy: edu.fieldOfStudy || "",
                      startDate: normalizeDate(edu.startDate),
                      endDate: normalizeDate(edu.endDate),
                    }));
                  }

                  if (prev.certifications.length === 0 && pd.certifications && pd.certifications.length > 0) {
                    updates.certifications = pd.certifications.map((cert) => ({
                      id: crypto.randomUUID(),
                      name: cert.name || "",
                      issuingOrganization: cert.issuingOrganization || "",
                      issueDate: normalizeDate(cert.issueDate),
                      expiryDate: normalizeDate(cert.expiryDate),
                      credentialId: "",
                    }));
                  }

                  if (prev.skills.length === 0) {
                    const skillNames = pd.skills || [];
                    const detailMap = new Map(
                      (pd.skillDetails || []).map((d) => [d.name.toLowerCase(), d])
                    );
                    if (skillNames.length > 0) {
                      updates.skills = skillNames.map((name) => {
                        const detail = detailMap.get(name.toLowerCase());
                        return {
                          id: crypto.randomUUID(),
                          name,
                          proficiency: detail?.proficiency || 3,
                        };
                      });
                    }
                  }

                  return Object.keys(updates).length > 0
                    ? { ...prev, ...updates }
                    : prev;
                });
              }
            }}
          />
        );
      case 3:
        return (
          <AIProfileReviewStep
            parsedData={data.aiProfile}
            onChange={updateAIProfile}
          />
        );
      case 4:
        return (
          <ExperienceStep
            experiences={data.experiences}
            onChange={(experiences) =>
              setData((prev) => ({ ...prev, experiences }))
            }
          />
        );
      case 5:
        return (
          <SkillsEducationStep
            skills={data.skills}
            education={data.education}
            certifications={data.certifications}
            onChange={({ skills, education, certifications }) =>
              setData((prev) => ({ ...prev, skills, education, certifications }))
            }
          />
        );
      case 6:
        return (
          <PreferencesStep
            preferences={data.preferences}
            onChange={(preferences) =>
              setData((prev) => ({ ...prev, preferences }))
            }
            errors={preferencesErrors}
          />
        );
      case 7:
        return (
          <ReviewSubmitStep
            personalInfo={{
              firstName: data.personalInfo.firstName ?? "",
              lastName: data.personalInfo.lastName ?? "",
              email: "",
              phone: data.personalInfo.phone ?? "",
              location: data.personalInfo.location ?? "",
              linkedIn: data.personalInfo.linkedinUrl ?? "",
              profileImage: data.personalInfo.profileImage ?? "",
            }}
            resume={
              data.resume.fileUrl
                ? { fileName: data.resume.filename }
                : null
            }
            professionalSummary={data.aiProfile.summary ?? ""}
            experiences={data.experiences}
            skills={data.skills}
            education={data.education}
            certifications={data.certifications}
            preferences={data.preferences}
            onConsentChange={(consent) => {
              setData((prev) => ({
                ...prev,
                consentGdpr: consent.consentGdpr,
                consentDataProcessing: consent.consentDataProcessing,
              }));
            }}
          />
        );
      default:
        return null;
    }
  };

  // ------------------------------------------
  // Layout
  // ------------------------------------------
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      {/* Progress header */}
      <div className="space-y-4">
        {/* Step indicators */}
        <div className="flex items-center justify-between">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = step.number === currentStep;
            const isCompleted = step.number < currentStep;

            return (
              <div
                key={step.number}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCompleted
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`hidden text-xs sm:block ${
                    isActive
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <Progress value={progressValue} className="h-2" />

        <p className="text-center text-sm text-muted-foreground">
          Step {currentStep} of {TOTAL_STEPS} &mdash;{" "}
          <span className="font-medium text-foreground">
            {currentStepMeta.title}
          </span>
        </p>
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">{renderStep()}</div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1 || isSaving}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <Button
          onClick={handleNext}
          disabled={isSaving || (currentStep === 2 && !data.resume.fileUrl)}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : currentStep === TOTAL_STEPS ? (
            "Submit"
          ) : (
            <>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
