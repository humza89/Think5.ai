"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, UploadCloud } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const totalSteps = 4; // Simplified MVP onboarding (Personal, Experience, Skills, Profile Review)
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    location: "",
    headline: "",
    summary: "",
    experienceYears: "",
  });

  const handleNext = () => setStep((s) => Math.min(totalSteps, s + 1));
  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/candidates/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to complete onboarding.");
      }

      toast.success("Profile Setup Complete!");
      router.push("/candidate/dashboard");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Welcome to JPJ Platform
        </h1>
        <p className="mt-2 text-muted-foreground">
          Let's set up your profile to connect you with the best opportunities.
        </p>
        <Progress value={(step / totalSteps) * 100} className="mt-4 h-2 opacity-80" />
      </div>

      <Card className="shadow-lg border-muted">
        <CardHeader>
          <CardTitle className="text-2xl">
            {step === 1 && "Personal Information"}
            {step === 2 && "Professional Summary"}
            {step === 3 && "Fast Track: Resume Upload"}
            {step === 4 && "Review & Submit"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Basic details used to identify your profile."}
            {step === 2 && "Introduce yourself to recruiters."}
            {step === 3 && "We'll parse your resume for skills and experience."}
            {step === 4 && "Final check before we activate your matching engine."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 min-h-[300px]">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">First Name</label>
                <Input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Jane" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Last Name</label>
                <Input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Doe" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Phone Number</label>
                <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Location</label>
                <Input name="location" value={formData.location} onChange={handleChange} placeholder="City, State" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Professional Headline</label>
                <Input name="headline" value={formData.headline} onChange={handleChange} placeholder="e.g. Master Electrician | Commercial Specialist" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Years of Experience</label>
                <Input type="number" name="experienceYears" value={formData.experienceYears} onChange={handleChange} placeholder="5" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none flex justify-between">
                  <span>Summary</span>
                  <span className="text-primary cursor-pointer hover:underline">Enhance with AI ✨</span>
                </label>
                <Textarea name="summary" value={formData.summary} onChange={handleChange} rows={5} placeholder="Describe your background and what you're looking for..." />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-12 text-center hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Upload Resume</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    PDF, DOCX formats up to 5MB
                  </p>
                  <Button variant="outline" size="sm">Select File</Button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg border border-muted flex items-start gap-4">
                <div className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 p-2 rounded-full">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Profile Ready</h4>
                  <p className="text-sm text-muted-foreground">Your base profile is complete. Once you submit, our AI matching engine will begin aligning you with open roles in our database across healthcare, trades, and IT.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Name:</div><div className="font-medium">{formData.firstName} {formData.lastName}</div>
                <div className="text-muted-foreground">Headline:</div><div className="font-medium">{formData.headline}</div>
                <div className="text-muted-foreground">Location:</div><div className="font-medium">{formData.location}</div>
                <div className="text-muted-foreground">Experience:</div><div className="font-medium">{formData.experienceYears} Years</div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t border-muted pt-6">
          <Button variant="outline" onClick={handleBack} disabled={step === 1 || isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          
          {step < totalSteps ? (
            <Button onClick={handleNext}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting ? "Completing Setup..." : "Activate Profile"}
              {!isSubmitting && <Check className="ml-2 h-4 w-4" />}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
