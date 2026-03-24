"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, User, Building2, Users, Settings2, ClipboardCheck, ChevronLeft, ChevronRight, Rocket } from "lucide-react";
import { toast } from "sonner";
import { PersonalInfoStep } from "./PersonalInfoStep";
import { CompanySetupStep } from "./CompanySetupStep";
import { TeamConfigStep } from "./TeamConfigStep";
import { HiringPreferencesStep } from "./HiringPreferencesStep";
import { ReviewLaunchStep } from "./ReviewLaunchStep";
import type { RecruiterOnboardingData } from "@/types/recruiter-onboarding";

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Company", icon: Building2 },
  { label: "Team", icon: Users },
  { label: "Preferences", icon: Settings2 },
  { label: "Launch", icon: ClipboardCheck },
];

interface RecruiterOnboardingWizardProps {
  initialStep: number;
  initialData: RecruiterOnboardingData;
}

export function RecruiterOnboardingWizard({
  initialStep,
  initialData,
}: RecruiterOnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(Math.max(0, initialStep));
  const [data, setData] = useState<RecruiterOnboardingData>(initialData);
  const [isSaving, setIsSaving] = useState(false);

  const progress = Math.round(((currentStep + 1) / STEPS.length) * 100);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 0:
        return data.personalInfo.name.trim().length > 0;
      case 1:
        if (data.company.mode === "create") return !!data.company.name?.trim();
        if (data.company.mode === "join") return !!data.company.companyId;
        return false;
      case 2:
        // Team step is always skippable
        return true;
      case 3:
        // Preferences are always optional
        return true;
      case 4:
        return data.acknowledged;
      default:
        return false;
    }
  }, [currentStep, data]);

  const saveStep = async (stepNumber: number) => {
    setIsSaving(true);
    try {
      let stepData: unknown;

      switch (stepNumber) {
        case 0:
          stepData = data.personalInfo;
          break;
        case 1:
          stepData = data.company;
          break;
        case 2: {
          const invitations = data.teamInvitations ?? [];
          stepData = {
            invitations: invitations.filter((inv) => inv.email.trim()),
            skip: invitations.length === 0 || !invitations.some((inv) => inv.email.trim()),
          };
        }
          break;
        case 3:
          stepData = data.hiringPreferences;
          break;
        case 4:
          stepData = { acknowledged: data.acknowledged };
          break;
      }

      const res = await fetch("/api/recruiter/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNumber + 1, data: stepData }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    if (!canProceed()) return;

    const saved = await saveStep(currentStep);
    if (!saved) return;

    if (currentStep === STEPS.length - 1) {
      toast.success("Account launched! Redirecting to dashboard...");
      router.replace("/dashboard");
      return;
    }

    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-sm">T5</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set Up Your Account</h1>
          <p className="text-muted-foreground mt-1">Step {currentStep + 1} of {STEPS.length}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex justify-between mb-8">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isCompleted = i < currentStep;
            const isActive = i === currentStep;

            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isCompleted
                      ? "bg-green-600 text-white"
                      : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs hidden sm:block ${
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[400px] mb-8">
          {currentStep === 0 && (
            <PersonalInfoStep
              data={data.personalInfo}
              onChange={(personalInfo) => setData((prev) => ({ ...prev, personalInfo }))}
            />
          )}
          {currentStep === 1 && (
            <CompanySetupStep
              data={data.company}
              onChange={(company) => setData((prev) => ({ ...prev, company }))}
            />
          )}
          {currentStep === 2 && (
            <TeamConfigStep
              data={data.teamInvitations}
              onChange={(teamInvitations) => setData((prev) => ({ ...prev, teamInvitations }))}
            />
          )}
          {currentStep === 3 && (
            <HiringPreferencesStep
              data={data.hiringPreferences}
              onChange={(hiringPreferences) => setData((prev) => ({ ...prev, hiringPreferences }))}
            />
          )}
          {currentStep === 4 && (
            <ReviewLaunchStep
              data={data}
              onAcknowledge={(acknowledged) => setData((prev) => ({ ...prev, acknowledged }))}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isSaving}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : currentStep === STEPS.length - 1 ? (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Launch Account
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
