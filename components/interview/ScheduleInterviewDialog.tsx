"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INTERVIEW_TYPES = [
  { value: "TECHNICAL", label: "Technical" },
  { value: "BEHAVIORAL", label: "Behavioral" },
  { value: "DOMAIN_EXPERT", label: "Domain Expert" },
  { value: "LANGUAGE", label: "Language Assessment" },
  { value: "CASE_STUDY", label: "Case Study" },
];

const INTERVIEW_MODES = [
  { value: "GENERAL_PROFILE", label: "General Profile", description: "Broad assessment of skills and experience" },
  { value: "JOB_FIT", label: "Job Fit", description: "Evaluate fit for a specific role" },
  { value: "HYBRID", label: "Hybrid", description: "Combined general and role-specific assessment" },
  { value: "CULTURAL_FIT", label: "Cultural Fit", description: "Assess alignment with company culture" },
  { value: "TECHNICAL_DEEP_DIVE", label: "Technical Deep Dive", description: "In-depth technical evaluation" },
  { value: "SCREENING", label: "Screening", description: "Initial qualification screening" },
  { value: "CUSTOM", label: "Custom", description: "Custom interview configuration" },
];

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  onScheduled: (interview: any) => void;
}

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  candidateEmail,
  onScheduled,
}: ScheduleInterviewDialogProps) {
  const [type, setType] = useState("TECHNICAL");
  const [mode, setMode] = useState("GENERAL_PROFILE");
  const [sendInvite, setSendInvite] = useState(!!candidateEmail);
  const [email, setEmail] = useState(candidateEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Create interview
      const createRes = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          type,
          mode,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create interview");
      }

      const interview = await createRes.json();

      // Optionally send invite
      if (sendInvite && email) {
        const inviteRes = await fetch(
          `/api/interviews/${interview.id}/invite`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }
        );

        if (!inviteRes.ok) {
          // Interview created, but invite failed — not a hard error
          console.error("Failed to send invitation");
        }
      }

      onScheduled(interview);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule AI Interview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Candidate name */}
          <div>
            <Label className="text-sm text-gray-500">Candidate</Label>
            <p className="font-medium">{candidateName}</p>
          </div>

          {/* Interview type */}
          <div className="space-y-2">
            <Label>Interview Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Interview mode */}
          <div className="space-y-2">
            <Label>Interview Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div>
                      <span>{m.label}</span>
                      <span className="ml-2 text-xs text-gray-500">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Send invite checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="send-invite"
              checked={sendInvite}
              onCheckedChange={(checked) => setSendInvite(!!checked)}
            />
            <Label htmlFor="send-invite" className="cursor-pointer">
              Send email invitation to candidate
            </Label>
          </div>

          {/* Email input */}
          {sendInvite && (
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@example.com"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Scheduling..." : "Schedule Interview"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
