"use client";

import { useState, useCallback } from "react";
import { Bot, X, Plus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AIProfileReviewData } from "@/lib/validations/onboarding";

// ============================================
// Types
// ============================================

interface AIProfileReviewStepProps {
  parsedData: AIProfileReviewData;
  onChange: (updates: Partial<AIProfileReviewData>) => void;
}

// ============================================
// Sub-components
// ============================================

function AIBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Bot className="h-3 w-3" />
      AI extracted
    </Badge>
  );
}

function NotFoundIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
      <AlertTriangle className="h-3 w-3" />
      Not found &mdash; please fill in manually
    </span>
  );
}

// ============================================
// Component
// ============================================

export function AIProfileReviewStep({
  parsedData,
  onChange,
}: AIProfileReviewStepProps) {
  const [newSkill, setNewSkill] = useState("");

  const handleChange = useCallback(
    (field: keyof AIProfileReviewData, value: string | number | null) => {
      onChange({ [field]: value });
    },
    [onChange]
  );

  // ------------------------------------------
  // Skill management
  // ------------------------------------------
  const addSkill = useCallback(() => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;

    const current = parsedData.skills ?? [];
    if (current.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setNewSkill("");
      return;
    }

    onChange({ skills: [...current, trimmed] });
    setNewSkill("");
  }, [newSkill, parsedData.skills, onChange]);

  const removeSkill = useCallback(
    (index: number) => {
      const current = parsedData.skills ?? [];
      onChange({ skills: current.filter((_, i) => i !== index) });
    },
    [parsedData.skills, onChange]
  );

  const handleSkillKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addSkill();
      }
    },
    [addSkill]
  );

  // ------------------------------------------
  // Helpers
  // ------------------------------------------
  const hasValue = (val: string | number | null | undefined): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === "string") return val.trim().length > 0;
    return true;
  };

  // ------------------------------------------
  // Render
  // ------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl text-foreground">
                AI Profile Review
              </CardTitle>
              <CardDescription>
                We extracted the following information from your resume. Please
                review and correct anything that looks off.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Basic info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">
            Basic Information
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Full Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="fullName">Full Name</Label>
              {hasValue(parsedData.fullName) ? (
                <AIBadge />
              ) : (
                <NotFoundIndicator />
              )}
            </div>
            <Input
              id="fullName"
              placeholder="Jane Doe"
              value={parsedData.fullName ?? ""}
              onChange={(e) => handleChange("fullName", e.target.value)}
            />
          </div>

          {/* Current Title & Company */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="currentTitle">Current Title</Label>
                {hasValue(parsedData.currentTitle) ? (
                  <AIBadge />
                ) : (
                  <NotFoundIndicator />
                )}
              </div>
              <Input
                id="currentTitle"
                placeholder="Senior Software Engineer"
                value={parsedData.currentTitle ?? ""}
                onChange={(e) => handleChange("currentTitle", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="currentCompany">Current Company</Label>
                {hasValue(parsedData.currentCompany) ? (
                  <AIBadge />
                ) : (
                  <NotFoundIndicator />
                )}
              </div>
              <Input
                id="currentCompany"
                placeholder="Acme Inc."
                value={parsedData.currentCompany ?? ""}
                onChange={(e) =>
                  handleChange("currentCompany", e.target.value)
                }
              />
            </div>
          </div>

          {/* Years of Experience */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="experienceYears">Years of Experience</Label>
              {hasValue(parsedData.experienceYears) ? (
                <AIBadge />
              ) : (
                <NotFoundIndicator />
              )}
            </div>
            <Input
              id="experienceYears"
              type="number"
              min={0}
              max={80}
              placeholder="5"
              value={
                parsedData.experienceYears != null
                  ? String(parsedData.experienceYears)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                handleChange(
                  "experienceYears",
                  val === "" ? null : parseInt(val, 10)
                );
              }}
              className="max-w-[140px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base text-foreground">
              Professional Summary
            </CardTitle>
            {hasValue(parsedData.summary) ? (
              <AIBadge />
            ) : (
              <NotFoundIndicator />
            )}
          </div>
        </CardHeader>

        <CardContent>
          <Textarea
            id="summary"
            placeholder="A brief summary of your professional background, expertise, and career goals..."
            value={parsedData.summary ?? ""}
            onChange={(e) => handleChange("summary", e.target.value)}
            rows={5}
            className="resize-y"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {(parsedData.summary ?? "").length} / 5,000 characters
          </p>
        </CardContent>
      </Card>

      {/* Skills card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base text-foreground">
              Extracted Skills
            </CardTitle>
            {(parsedData.skills ?? []).length > 0 ? (
              <AIBadge />
            ) : (
              <NotFoundIndicator />
            )}
          </div>
          <CardDescription>
            Remove any incorrect skills and add missing ones.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Skill tags */}
          {(parsedData.skills ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(parsedData.skills ?? []).map((skill, index) => (
                <Badge
                  key={`${skill}-${index}`}
                  variant="secondary"
                  className="gap-1 pr-1.5"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(index)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-foreground/10"
                    aria-label={`Remove ${skill}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Add skill input */}
          <div className="flex gap-2">
            <Input
              placeholder="Add a skill (e.g., React, Python)"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={addSkill}
              disabled={!newSkill.trim()}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
