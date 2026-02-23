"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  FileText,
  Wrench,
  Settings,
  MessageSquare,
  Eye,
  X,
  Plus,
  Loader2,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface Skill {
  skillName: string;
  skillCategory: string;
  importance: "REQUIRED" | "PREFERRED" | "NICE_TO_HAVE";
  minYears: string;
}

const STEPS = [
  { label: "Basic Info", icon: Building2 },
  { label: "Description", icon: FileText },
  { label: "Skills", icon: Wrench },
  { label: "Details", icon: Settings },
  { label: "Questions", icon: MessageSquare },
  { label: "Review", icon: Eye },
];

export function JobCreationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    companyId: "",
    location: "",
    department: "",
    industry: "",
    employmentType: "FULL_TIME",
    remoteType: "ONSITE",
    description: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "USD",
    experienceMin: "",
    experienceMax: "",
    urgencyLevel: "3",
    closesAt: "",
    customQuestions: "",
  });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState<Skill>({
    skillName: "",
    skillCategory: "",
    importance: "REQUIRED",
    minYears: "",
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  }, []);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function addSkill() {
    if (!newSkill.skillName.trim()) return;
    setSkills((prev) => [...prev, { ...newSkill }]);
    setNewSkill({ skillName: "", skillCategory: "", importance: "REQUIRED", minYears: "" });
  }

  function removeSkill(index: number) {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!formData.title && !!formData.companyId;
      case 1:
        return !!formData.description;
      default:
        return true;
    }
  }

  async function handleSubmit(status: "DRAFT" | "ACTIVE") {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          status,
          skills,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create job");
      }

      const job = await res.json();
      toast.success("Job created successfully");
      router.push(`/jobs/${job.id}`);
    } catch (error: any) {
      toast.error(error.message);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  i === step
                    ? "bg-blue-50 text-blue-600"
                    : i < step
                    ? "text-green-600 cursor-pointer hover:bg-green-50"
                    : "text-gray-400"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    i === step
                      ? "bg-blue-600 text-white"
                      : i < step
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className="hidden md:inline text-sm font-medium">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 ${i < step ? "bg-green-300" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 0: Basic Info */}
          {step === 0 && (
            <>
              <div>
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Senior Software Engineer"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="company">Company *</Label>
                <select
                  id="company"
                  value={formData.companyId}
                  onChange={(e) => updateField("companyId", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a company</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g. San Francisco, CA"
                    value={formData.location}
                    onChange={(e) => updateField("location", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="e.g. Engineering"
                    value={formData.department}
                    onChange={(e) => updateField("department", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="employmentType">Employment Type</Label>
                  <select
                    id="employmentType"
                    value={formData.employmentType}
                    onChange={(e) => updateField("employmentType", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="FULL_TIME">Full-time</option>
                    <option value="PART_TIME">Part-time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="TEMP_TO_HIRE">Temp to Hire</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="remoteType">Work Arrangement</Label>
                  <select
                    id="remoteType"
                    value={formData.remoteType}
                    onChange={(e) => updateField("remoteType", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="ONSITE">On-site</option>
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="e.g. Technology, Healthcare"
                  value={formData.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                />
              </div>
            </>
          )}

          {/* Step 1: Description */}
          {step === 1 && (
            <div>
              <Label htmlFor="description">Job Description *</Label>
              <Textarea
                id="description"
                placeholder="Provide a detailed job description including responsibilities, qualifications, and benefits..."
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                className="min-h-[300px]"
              />
            </div>
          )}

          {/* Step 2: Skills */}
          {step === 2 && (
            <>
              <div className="space-y-3">
                <Label>Add Required Skills</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Skill name (e.g. React)"
                    value={newSkill.skillName}
                    onChange={(e) =>
                      setNewSkill((prev) => ({ ...prev, skillName: e.target.value }))
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Category"
                    value={newSkill.skillCategory}
                    onChange={(e) =>
                      setNewSkill((prev) => ({ ...prev, skillCategory: e.target.value }))
                    }
                    className="w-32"
                  />
                  <select
                    value={newSkill.importance}
                    onChange={(e) =>
                      setNewSkill((prev) => ({
                        ...prev,
                        importance: e.target.value as Skill["importance"],
                      }))
                    }
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="REQUIRED">Required</option>
                    <option value="PREFERRED">Preferred</option>
                    <option value="NICE_TO_HAVE">Nice to Have</option>
                  </select>
                  <Input
                    placeholder="Min yrs"
                    value={newSkill.minYears}
                    onChange={(e) =>
                      setNewSkill((prev) => ({ ...prev, minYears: e.target.value }))
                    }
                    className="w-20"
                    type="number"
                  />
                  <Button type="button" onClick={addSkill} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {skills.length > 0 && (
                <div className="space-y-2">
                  <Label>Added Skills ({skills.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`py-1.5 px-3 ${
                          skill.importance === "REQUIRED"
                            ? "border-blue-200 bg-blue-50"
                            : skill.importance === "PREFERRED"
                            ? "border-yellow-200 bg-yellow-50"
                            : "border-gray-200"
                        }`}
                      >
                        {skill.skillName}
                        {skill.minYears && ` (${skill.minYears}+ yrs)`}
                        <button onClick={() => removeSkill(i)} className="ml-2">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="salaryMin">Salary Min</Label>
                  <Input
                    id="salaryMin"
                    type="number"
                    placeholder="e.g. 80000"
                    value={formData.salaryMin}
                    onChange={(e) => updateField("salaryMin", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="salaryMax">Salary Max</Label>
                  <Input
                    id="salaryMax"
                    type="number"
                    placeholder="e.g. 120000"
                    value={formData.salaryMax}
                    onChange={(e) => updateField("salaryMax", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="salaryCurrency">Currency</Label>
                  <select
                    id="salaryCurrency"
                    value={formData.salaryCurrency}
                    onChange={(e) => updateField("salaryCurrency", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="experienceMin">Experience Min (years)</Label>
                  <Input
                    id="experienceMin"
                    type="number"
                    placeholder="e.g. 3"
                    value={formData.experienceMin}
                    onChange={(e) => updateField("experienceMin", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="experienceMax">Experience Max (years)</Label>
                  <Input
                    id="experienceMax"
                    type="number"
                    placeholder="e.g. 8"
                    value={formData.experienceMax}
                    onChange={(e) => updateField("experienceMax", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="urgencyLevel">Urgency Level</Label>
                  <select
                    id="urgencyLevel"
                    value={formData.urgencyLevel}
                    onChange={(e) => updateField("urgencyLevel", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="1">1 - Low</option>
                    <option value="2">2 - Moderate</option>
                    <option value="3">3 - Normal</option>
                    <option value="4">4 - High</option>
                    <option value="5">5 - Urgent</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="closesAt">Closing Date</Label>
                  <Input
                    id="closesAt"
                    type="date"
                    value={formData.closesAt}
                    onChange={(e) => updateField("closesAt", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 4: Custom Questions */}
          {step === 4 && (
            <div>
              <Label htmlFor="customQuestions">
                Custom Interview Questions (optional)
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Add custom questions that will be included in AI interviews for this job.
                One question per line.
              </p>
              <Textarea
                id="customQuestions"
                placeholder="What experience do you have with...&#10;Describe a time when you...&#10;How would you approach..."
                value={formData.customQuestions}
                onChange={(e) => updateField("customQuestions", e.target.value)}
                className="min-h-[200px]"
              />
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Job Title</h3>
                  <p className="text-gray-900 font-medium">{formData.title || "—"}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Company</h3>
                  <p className="text-gray-900">
                    {clients.find((c) => c.id === formData.companyId)?.name || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
                  <p className="text-gray-900">{formData.location || "—"}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Department</h3>
                  <p className="text-gray-900">{formData.department || "—"}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Employment Type</h3>
                  <p className="text-gray-900">
                    {formData.employmentType.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Work Arrangement</h3>
                  <p className="text-gray-900">{formData.remoteType}</p>
                </div>
                {(formData.salaryMin || formData.salaryMax) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Salary Range</h3>
                    <p className="text-gray-900">
                      {formData.salaryMin && `$${Number(formData.salaryMin).toLocaleString()}`}
                      {formData.salaryMin && formData.salaryMax && " - "}
                      {formData.salaryMax && `$${Number(formData.salaryMax).toLocaleString()}`}
                      {" "}{formData.salaryCurrency}
                    </p>
                  </div>
                )}
                {(formData.experienceMin || formData.experienceMax) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Experience</h3>
                    <p className="text-gray-900">
                      {formData.experienceMin && `${formData.experienceMin}`}
                      {formData.experienceMin && formData.experienceMax && " - "}
                      {formData.experienceMax && `${formData.experienceMax}`}
                      {" years"}
                    </p>
                  </div>
                )}
              </div>
              {formData.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap line-clamp-6">
                    {formData.description}
                  </p>
                </div>
              )}
              {skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Skills ({skills.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill, i) => (
                      <Badge key={i} variant="outline" className="py-1">
                        {skill.skillName}
                        {skill.importance !== "REQUIRED" && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({skill.importance.toLowerCase().replace("_", " ")})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => (step > 0 ? setStep(step - 1) : router.push("/jobs"))}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {step > 0 ? "Back" : "Cancel"}
        </Button>

        <div className="flex gap-3">
          {step === STEPS.length - 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSubmit("DRAFT")}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save as Draft
              </Button>
              <Button onClick={() => handleSubmit("ACTIVE")} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Publish Job
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
