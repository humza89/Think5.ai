"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const INTERVIEW_TYPES = [
  { value: "TECHNICAL", label: "Technical", description: "Coding, system design, architecture" },
  { value: "BEHAVIORAL", label: "Behavioral", description: "Leadership, teamwork, conflict resolution" },
  { value: "DOMAIN_EXPERT", label: "Domain Expert", description: "Industry-specific expertise" },
  { value: "LANGUAGE", label: "Language", description: "Communication and language proficiency" },
  { value: "CASE_STUDY", label: "Case Study", description: "Problem analysis and strategic thinking" },
];

const INTERVIEW_MODES = [
  { value: "GENERAL_PROFILE", label: "General Profile", description: "Broad assessment of skills and experience" },
  { value: "JOB_FIT", label: "Job Fit", description: "Evaluate fit for a specific role" },
  { value: "CULTURAL_FIT", label: "Cultural Fit", description: "Assess alignment with company culture" },
  { value: "TECHNICAL_DEEP_DIVE", label: "Technical Deep Dive", description: "In-depth technical evaluation" },
  { value: "SCREENING", label: "Screening", description: "Initial qualification screening" },
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
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["TECHNICAL"]);
  const [selectedModes, setSelectedModes] = useState<string[]>(["GENERAL_PROFILE"]);
  const [sendInvite, setSendInvite] = useState(!!candidateEmail);
  const [email, setEmail] = useState(candidateEmail);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recruiterObjectives, setRecruiterObjectives] = useState("");
  const [customQuestions, setCustomQuestions] = useState("");
  const [hmNotes, setHmNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (value: string) => {
    setSelectedTypes((prev) =>
      prev.includes(value)
        ? prev.length > 1 ? prev.filter((t) => t !== value) : prev // keep at least one
        : [...prev, value]
    );
  };

  const toggleMode = (value: string) => {
    setSelectedModes((prev) =>
      prev.includes(value)
        ? prev.length > 1 ? prev.filter((m) => m !== value) : prev
        : [...prev, value]
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Build comprehensive objectives from multi-select
      const focusObjectives: string[] = [];
      if (selectedTypes.length > 1) {
        const typeLabels = selectedTypes.map(
          (t) => INTERVIEW_TYPES.find((it) => it.value === t)?.label || t
        );
        focusObjectives.push(
          `Comprehensive interview covering: ${typeLabels.join(", ")}. Ensure each area is assessed in depth.`
        );
      }
      if (selectedModes.length > 1) {
        const modeLabels = selectedModes.map(
          (m) => INTERVIEW_MODES.find((im) => im.value === m)?.label || m
        );
        focusObjectives.push(
          `Interview approach should combine: ${modeLabels.join(", ")}.`
        );
      }

      // Merge with any manually entered objectives
      const manualObjectives = recruiterObjectives.trim()
        ? recruiterObjectives.split("\n").filter(Boolean)
        : [];
      const allObjectives = [...focusObjectives, ...manualObjectives];

      // Primary type/mode for DB (first selected), use HYBRID mode if multiple
      const primaryType = selectedTypes[0];
      const primaryMode = selectedModes.length > 1 ? "HYBRID" : selectedModes[0];

      const createRes = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          type: primaryType,
          mode: primaryMode,
          ...(allObjectives.length > 0 && { recruiterObjectives: allObjectives }),
          ...(customQuestions.trim() && {
            customScreeningQuestions: customQuestions.split("\n").filter(Boolean),
          }),
          ...(hmNotes.trim() && { hmNotes: hmNotes.trim() }),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule AI Interview</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Candidate name */}
          <div>
            <Label className="text-sm text-gray-500">Candidate</Label>
            <p className="font-medium">{candidateName}</p>
          </div>

          {/* Interview focus areas (multi-select) */}
          <div className="space-y-3">
            <div>
              <Label>Interview Focus Areas</Label>
              <p className="text-xs text-gray-500 mt-0.5">Select all areas to assess in one comprehensive interview</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INTERVIEW_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedTypes.includes(t.value)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-gray-200 hover:border-gray-300 dark:border-zinc-700"
                  }`}
                >
                  <Checkbox
                    checked={selectedTypes.includes(t.value)}
                    onCheckedChange={() => toggleType(t.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Interview approach (multi-select) */}
          <div className="space-y-3">
            <div>
              <Label>Interview Approach</Label>
              <p className="text-xs text-gray-500 mt-0.5">Choose how the interview should be conducted</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INTERVIEW_MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedModes.includes(m.value)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-gray-200 hover:border-gray-300 dark:border-zinc-700"
                  }`}
                >
                  <Checkbox
                    checked={selectedModes.includes(m.value)}
                    onCheckedChange={() => toggleMode(m.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-gray-500">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>
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

          {/* Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showAdvanced ? "Hide" : "Show"} Advanced Settings
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-zinc-900">
              <div className="space-y-2">
                <Label>Additional Objectives</Label>
                <Textarea
                  value={recruiterObjectives}
                  onChange={(e) => setRecruiterObjectives(e.target.value)}
                  placeholder="One objective per line, e.g.&#10;Assess system design skills&#10;Evaluate leadership experience"
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-gray-500">Guide the AI interviewer to focus on specific areas.</p>
              </div>

              <div className="space-y-2">
                <Label>Custom Screening Questions</Label>
                <Textarea
                  value={customQuestions}
                  onChange={(e) => setCustomQuestions(e.target.value)}
                  placeholder="One question per line, e.g.&#10;Tell me about a time you led a migration&#10;How do you handle technical debt?"
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-gray-500">Specific questions the AI must ask during the interview.</p>
              </div>

              <div className="space-y-2">
                <Label>Hiring Manager Notes</Label>
                <Textarea
                  value={hmNotes}
                  onChange={(e) => setHmNotes(e.target.value)}
                  placeholder="Context only visible to the AI, e.g. 'Team needs someone who can own the billing system refactor'"
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-gray-500">Private context for the AI. Not shown to the candidate.</p>
              </div>
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
