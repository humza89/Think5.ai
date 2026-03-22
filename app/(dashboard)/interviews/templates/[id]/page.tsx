"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ArrowLeft, Plus, X, Loader2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";

interface Question {
  text: string;
  type: string;
  category: string;
  followUpDepth: number;
}

const questionTypes = ["behavioral", "technical", "situational", "coding", "case_study"];

const interviewModes = [
  { value: "GENERAL_PROFILE", label: "General Profile" },
  { value: "JOB_FIT", label: "Job Fit" },
  { value: "CULTURAL_FIT", label: "Cultural Fit" },
  { value: "TECHNICAL_DEEP_DIVE", label: "Technical Deep Dive" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "SCREENING", label: "Screening" },
  { value: "FINAL_ROUND", label: "Final Round" },
];

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState<Question>({
    text: "",
    type: "behavioral",
    category: "",
    followUpDepth: 2,
  });

  // AI Config
  const [personality, setPersonality] = useState("professional");
  const [followUpDepth, setFollowUpDepth] = useState("2");
  const [antiCheatLevel, setAntiCheatLevel] = useState("standard");

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState("GENERAL_PROFILE");
  const [strategicObjectives, setStrategicObjectives] = useState("");
  const [customScreeningQuestions, setCustomScreeningQuestions] = useState("");
  const [maxDurationMinutes, setMaxDurationMinutes] = useState("");
  const [minDurationMinutes, setMinDurationMinutes] = useState("");

  useEffect(() => {
    async function fetchTemplate() {
      try {
        const res = await fetch(`/api/interview-templates/${id}`);
        if (!res.ok) throw new Error("Template not found");
        const data = await res.json();

        setName(data.name || "");
        setDescription(data.description || "");
        setRoleType(data.roleType || "");
        setDurationMinutes(String(data.durationMinutes || 30));
        setQuestions(data.questions || []);
        setMode(data.mode || "GENERAL_PROFILE");
        setStrategicObjectives(data.strategicObjectives || "");
        setCustomScreeningQuestions(
          Array.isArray(data.customScreeningQuestions)
            ? data.customScreeningQuestions.join("\n")
            : data.customScreeningQuestions || ""
        );
        setMaxDurationMinutes(data.maxDurationMinutes ? String(data.maxDurationMinutes) : "");
        setMinDurationMinutes(data.minDurationMinutes ? String(data.minDurationMinutes) : "");

        if (data.aiConfig) {
          setPersonality(data.aiConfig.personality || "professional");
          setFollowUpDepth(String(data.aiConfig.followUpDepth || 2));
          setAntiCheatLevel(data.aiConfig.antiCheatLevel || "standard");
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to load template");
        router.push("/interviews/templates");
      } finally {
        setLoading(false);
      }
    }
    fetchTemplate();
  }, [id, router]);

  function addQuestion() {
    if (!newQuestion.text.trim()) return;
    setQuestions((prev) => [...prev, { ...newQuestion }]);
    setNewQuestion({ text: "", type: "behavioral", category: "", followUpDepth: 2 });
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.warning("Template name is required");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, any> = {
        name,
        description,
        roleType,
        durationMinutes: parseInt(durationMinutes),
        questions,
        aiConfig: {
          personality,
          followUpDepth: parseInt(followUpDepth),
          antiCheatLevel,
        },
        mode,
        strategicObjectives: strategicObjectives || null,
        customScreeningQuestions: customScreeningQuestions
          ? customScreeningQuestions.split("\n").filter((q) => q.trim())
          : null,
      };

      if (maxDurationMinutes) body.maxDurationMinutes = parseInt(maxDurationMinutes);
      if (minDurationMinutes) body.minDurationMinutes = parseInt(minDurationMinutes);

      const res = await fetch(`/api/interview-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast.success("Template updated successfully");
      router.push("/interviews/templates");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
        <div className="max-w-3xl mx-auto px-6 py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/interviews/templates")}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Templates
        </button>

        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Interview Template</h1>

        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Template Name *</Label>
                <Input
                  placeholder="e.g. Senior Engineer Technical Screen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe when to use this template..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Role Type</Label>
                  <Input
                    placeholder="e.g. Software Engineer"
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Interview Mode</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {interviewModes.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader>
              <CardTitle>Questions ({questions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <GripVertical className="h-5 w-5 text-gray-300 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{q.text}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {q.type}
                      </Badge>
                      {q.category && (
                        <Badge variant="outline" className="text-xs">
                          {q.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeQuestion(i)}>
                    <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}

              <div className="border-t pt-4 space-y-3">
                <Textarea
                  placeholder="Enter interview question..."
                  value={newQuestion.text}
                  onChange={(e) =>
                    setNewQuestion((prev) => ({ ...prev, text: e.target.value }))
                  }
                />
                <div className="flex gap-2">
                  <select
                    value={newQuestion.type}
                    onChange={(e) =>
                      setNewQuestion((prev) => ({ ...prev, type: e.target.value }))
                    }
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {questionTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Category"
                    value={newQuestion.category}
                    onChange={(e) =>
                      setNewQuestion((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-40"
                  />
                  <Button type="button" onClick={addQuestion} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Config */}
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>AI Personality</Label>
                <select
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="challenging">Challenging</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <Label>Follow-up Depth</Label>
                <select
                  value={followUpDepth}
                  onChange={(e) => setFollowUpDepth(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="1">Shallow (1 follow-up)</option>
                  <option value="2">Standard (2 follow-ups)</option>
                  <option value="3">Deep (3 follow-ups)</option>
                </select>
              </div>
              <div>
                <Label>Anti-Cheat Level</Label>
                <select
                  value={antiCheatLevel}
                  onChange={(e) => setAntiCheatLevel(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="relaxed">Relaxed</option>
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Settings */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle>Advanced Settings</CardTitle>
                {showAdvanced ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </CardHeader>
            {showAdvanced && (
              <CardContent className="space-y-4">
                <div>
                  <Label>Strategic Objectives</Label>
                  <Textarea
                    placeholder="What are the key objectives for this interview? e.g. Validate distributed systems expertise..."
                    value={strategicObjectives}
                    onChange={(e) => setStrategicObjectives(e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Custom Screening Questions (one per line)</Label>
                  <Textarea
                    placeholder="Enter custom questions, one per line..."
                    value={customScreeningQuestions}
                    onChange={(e) => setCustomScreeningQuestions(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Min Duration (minutes)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 15"
                      value={minDurationMinutes}
                      onChange={(e) => setMinDurationMinutes(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Max Duration (minutes)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 45"
                      value={maxDurationMinutes}
                      onChange={(e) => setMaxDurationMinutes(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push("/interviews/templates")}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
