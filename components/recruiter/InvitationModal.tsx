"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Mail,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface InvitationModalProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  profileName: string;
  profileEmail: string;
}

interface Job {
  id: string;
  title: string;
  location: string | null;
  employmentType: string;
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
}

const STEPS = [
  { number: 1, label: "Select Job" },
  { number: 2, label: "Compose Message" },
  { number: 3, label: "Review & Send" },
] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((step, index) => (
        <div key={step.number} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
              currentStep > step.number
                ? "bg-green-100 text-green-700"
                : currentStep === step.number
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {currentStep > step.number ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              step.number
            )}
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`w-8 h-0.5 transition-colors ${
                currentStep > step.number ? "bg-green-300" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function formatEmploymentType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function InvitationModal({
  open,
  onClose,
  profileId,
  profileName,
  profileEmail,
}: InvitationModalProps) {
  const [step, setStep] = useState(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  const buildDefaultMessage = useCallback(
    (job: Job | null): string => {
      if (job) {
        return `Hi ${profileName},

I'd like to invite you to interview for ${job.title} at ${job.company.name}.

This is a great opportunity and I think your background would be a perfect fit.

Looking forward to connecting!`;
      }
      return `Hi ${profileName},

I'd like to invite you to interview for an exciting opportunity.

I think your background would be a great fit and I'd love to connect.

Looking forward to hearing from you!`;
    },
    [profileName]
  );

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedJobId(null);
    setMessage("");
    setSending(false);
    fetchJobs();
  }, [open]);

  useEffect(() => {
    setMessage(buildDefaultMessage(selectedJob));
  }, [selectedJob, buildDefaultMessage]);

  async function fetchJobs() {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/jobs?status=ACTIVE");
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      setJobs([]);
      toast.error("Failed to load jobs");
    } finally {
      setJobsLoading(false);
    }
  }

  function handleSkipJob() {
    setSelectedJobId(null);
    setMessage(buildDefaultMessage(null));
    setStep(2);
  }

  function handleNext() {
    if (step < 3) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1);
    }
  }

  async function handleSend() {
    setSending(true);
    const sendPromise = (async () => {
      const res = await fetch(`/api/passive-profiles/${profileId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          message,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send invitation");
      }
    })();

    toast.promise(sendPromise, {
      loading: "Sending invitation...",
      success: `Invitation sent to ${profileName}`,
      error: (err) => err instanceof Error ? err.message : "Failed to send invitation",
    });

    try {
      await sendPromise;
      onClose();
    } catch {
      // error shown via toast
    } finally {
      setSending(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-[520px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Interview Invitation
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Invite {profileName} to interview on Think5.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <StepIndicator currentStep={step} />

        {/* Step 1: Select Job */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select a Job</Label>
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">
                    Loading jobs...
                  </span>
                </div>
              ) : jobs.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Briefcase className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      No active jobs found. You can still send an invitation
                      without a specific job.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Select
                  value={selectedJobId ?? ""}
                  onValueChange={(value) => setSelectedJobId(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a job position..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title} - {job.company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedJob && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">
                        {selectedJob.title}
                      </p>
                      <p className="text-sm text-gray-600">
                        {selectedJob.company.name}
                      </p>
                      {selectedJob.location && (
                        <p className="text-sm text-gray-500">
                          {selectedJob.location}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {formatEmploymentType(selectedJob.employmentType)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <ResponsiveDialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipJob}
                className="text-gray-500"
              >
                Skip (send without job)
              </Button>
              <Button
                onClick={handleNext}
                disabled={!selectedJobId}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </ResponsiveDialogFooter>
          </div>
        )}

        {/* Step 2: Compose Message */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invitation-message">Message</Label>
              <Textarea
                id="invitation-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="resize-none"
                placeholder="Write your invitation message..."
              />
              <p className="text-xs text-gray-400">
                This message will be included in the invitation email.
              </p>
            </div>

            <ResponsiveDialogFooter className="flex-row justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleNext} disabled={!message.trim()}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </ResponsiveDialogFooter>
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recipient
                    </p>
                    <p className="text-sm font-medium text-gray-900">
                      {profileName}
                    </p>
                    <p className="text-sm text-gray-500">{profileEmail}</p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Job
                      </p>
                      {selectedJob ? (
                        <p className="text-sm font-medium text-gray-900">
                          {selectedJob.title} at {selectedJob.company.name}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">
                          No specific job
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-start gap-3">
                    <Send className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Message Preview
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                        {message}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ResponsiveDialogFooter className="flex-row justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack} disabled={sending}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                {sending ? "Sending..." : "Send Invitation"}
              </Button>
            </ResponsiveDialogFooter>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
