"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import type { HiringPreferencesData } from "@/types/recruiter-onboarding";

interface HiringPreferencesStepProps {
  data: HiringPreferencesData;
  onChange: (data: HiringPreferencesData) => void;
}

const SUGGESTED_CRITERIA = [
  "Technical Depth",
  "Communication",
  "Problem Solving",
  "Culture Fit",
  "Leadership",
  "Collaboration",
  "Initiative",
  "Adaptability",
];

const SUGGESTED_ATTRIBUTES = [
  "5+ years experience",
  "Startup background",
  "FAANG experience",
  "Remote-friendly",
  "Strong portfolio",
  "Open source contributor",
  "Team lead experience",
  "Domain expertise",
];

export function HiringPreferencesStep({ data, onChange }: HiringPreferencesStepProps) {
  const [criteriaInput, setCriteriaInput] = useState("");
  const [attributeInput, setAttributeInput] = useState("");

  const addCriteria = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || data.evaluationCriteria.includes(trimmed)) return;
    if (data.evaluationCriteria.length >= 20) return;
    onChange({ ...data, evaluationCriteria: [...data.evaluationCriteria, trimmed] });
    setCriteriaInput("");
  };

  const removeCriteria = (index: number) => {
    onChange({
      ...data,
      evaluationCriteria: data.evaluationCriteria.filter((_, i) => i !== index),
    });
  };

  const addAttribute = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || data.preferredAttributes.includes(trimmed)) return;
    if (data.preferredAttributes.length >= 20) return;
    onChange({ ...data, preferredAttributes: [...data.preferredAttributes, trimmed] });
    setAttributeInput("");
  };

  const removeAttribute = (index: number) => {
    onChange({
      ...data,
      preferredAttributes: data.preferredAttributes.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Hiring Preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set your default evaluation criteria and preferred candidate attributes. These help AI
          tailor interview assessments.
        </p>
      </div>

      {/* Evaluation Criteria */}
      <div className="space-y-3">
        <Label>Evaluation Criteria</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add a criterion..."
            value={criteriaInput}
            onChange={(e) => setCriteriaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCriteria(criteriaInput);
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => addCriteria(criteriaInput)}
            disabled={!criteriaInput.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {data.evaluationCriteria.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.evaluationCriteria.map((criteria, i) => (
              <Badge key={i} variant="secondary" className="pl-3 pr-1 py-1.5">
                {criteria}
                <button
                  onClick={() => removeCriteria(i)}
                  className="ml-1.5 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_CRITERIA.filter((s) => !data.evaluationCriteria.includes(s)).map(
              (suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => addCriteria(suggestion)}
                  className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  + {suggestion}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Preferred Attributes */}
      <div className="space-y-3">
        <Label>Preferred Candidate Attributes</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add an attribute..."
            value={attributeInput}
            onChange={(e) => setAttributeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAttribute(attributeInput);
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => addAttribute(attributeInput)}
            disabled={!attributeInput.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {data.preferredAttributes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.preferredAttributes.map((attr, i) => (
              <Badge key={i} variant="secondary" className="pl-3 pr-1 py-1.5">
                {attr}
                <button
                  onClick={() => removeAttribute(i)}
                  className="ml-1.5 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_ATTRIBUTES.filter((s) => !data.preferredAttributes.includes(s)).map(
              (suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => addAttribute(suggestion)}
                  className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  + {suggestion}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
