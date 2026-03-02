"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User,
  FileText,
  Briefcase,
  GraduationCap,
  Sparkles,
  Settings,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  bio: string;
  location: string;
  linkedinUrl: string;
  profileImage: string;
}

interface ResumeData {
  id: string;
  fileUrl: string;
  filename: string;
}

interface ExperienceEntry {
  id?: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  location: string;
}

interface EducationEntry {
  id?: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

interface CertificationEntry {
  id?: string;
  name: string;
  issuingOrg: string;
  issueDate: string;
  expiryDate: string;
  credentialId: string;
}

interface SkillEntry {
  id?: string;
  skillName: string;
  category: string;
  proficiency: number;
  yearsExp: number;
}

interface JobPreferences {
  jobTypes: string[];
  preferredLocations: string[];
  remotePreference: string;
  salaryMin: number | string;
  salaryMax: number | string;
  salaryCurrency: string;
  availability: string;
  willingToRelocate: boolean;
}

interface PrefillData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  linkedinUrl?: string;
  skills?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Resume", icon: FileText },
  { label: "Experience", icon: Briefcase },
  { label: "Education", icon: GraduationCap },
  { label: "Skills", icon: Sparkles },
  { label: "Preferences", icon: Settings },
  { label: "Review", icon: CheckCircle },
];

const JOB_TYPE_OPTIONS = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Internship",
];

const REMOTE_OPTIONS = ["Remote", "Hybrid", "On-site", "Flexible"];

const AVAILABILITY_OPTIONS = [
  "Immediately",
  "2 Weeks",
  "1 Month",
  "3 Months",
  "Not Looking",
];

const SKILL_CATEGORIES = ["Technical", "Soft Skills", "Domain", "Other"];

const PROFICIENCY_LABELS = ["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"];

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPersonalInfo(): PersonalInfo {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTitle: "",
    bio: "",
    location: "",
    linkedinUrl: "",
    profileImage: "",
  };
}

function emptyExperience(): ExperienceEntry {
  return {
    company: "",
    title: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    location: "",
  };
}

function emptyEducation(): EducationEntry {
  return {
    institution: "",
    degree: "",
    field: "",
    startDate: "",
    endDate: "",
  };
}

function emptyCertification(): CertificationEntry {
  return {
    name: "",
    issuingOrg: "",
    issueDate: "",
    expiryDate: "",
    credentialId: "",
  };
}

function emptyPreferences(): JobPreferences {
  return {
    jobTypes: [],
    preferredLocations: [],
    remotePreference: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "USD",
    availability: "",
    willingToRelocate: false,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- core state --
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [highestCompletedStep, setHighestCompletedStep] = useState(0);

  // -- data state --
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>(emptyPersonalInfo());
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([]);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [certifications, setCertifications] = useState<CertificationEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [jobPreferences, setJobPreferences] = useState<JobPreferences>(emptyPreferences());

  // -- transient UI state --
  const [newSkillName, setNewSkillName] = useState("");
  const [newLocationTag, setNewLocationTag] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch onboarding data on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch("/api/candidate/onboarding");
        if (!res.ok) throw new Error("Failed to fetch onboarding data");
        const data = await res.json();

        if (cancelled) return;

        if (data.completed) {
          router.replace("/candidate/dashboard");
          return;
        }

        // Personal info (merge with prefill)
        const pi = data.personalInfo || {};
        const pf: PrefillData = data.prefill || {};
        setPersonalInfo({
          firstName: pi.firstName || pf.firstName || "",
          lastName: pi.lastName || pf.lastName || "",
          email: pi.email || "",
          phone: pi.phone || pf.phone || "",
          jobTitle: pi.jobTitle || pf.currentTitle || "",
          bio: pi.bio || "",
          location: pi.location || "",
          linkedinUrl: pi.linkedinUrl || pf.linkedinUrl || "",
          profileImage: pi.profileImage || "",
        });

        if (data.resume) setResume(data.resume);
        if (data.experiences?.length) setExperiences(data.experiences);
        if (data.education?.length) setEducation(data.education);
        if (data.certifications?.length) setCertifications(data.certifications);

        // Skills (merge prefill skills)
        if (data.skills?.length) {
          setSkills(data.skills);
        } else if (pf.skills?.length) {
          setSkills(
            pf.skills.map((s: string) => ({
              skillName: s,
              category: "Technical",
              proficiency: 3,
              yearsExp: 0,
            }))
          );
        }

        if (data.jobPreferences) {
          setJobPreferences({
            ...emptyPreferences(),
            ...data.jobPreferences,
          });
        }

        const apiStep = Math.max(data.step || 0, 0);
        setCurrentStep(apiStep >= 1 ? apiStep : 1);
        setHighestCompletedStep(apiStep > 0 ? apiStep - 1 : 0);
      } catch {
        toast.error("Failed to load onboarding data. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // -----------------------------------------------------------------------
  // Save step
  // -----------------------------------------------------------------------

  const saveStep = useCallback(
    async (step: number): Promise<boolean> => {
      setSaving(true);
      try {
        let data: Record<string, unknown> = {};

        switch (step) {
          case 1:
            data = { personalInfo };
            break;
          case 2:
            data = { resume };
            break;
          case 3:
            data = { experiences };
            break;
          case 4:
            data = { education, certifications };
            break;
          case 5:
            data = { skills };
            break;
          case 6:
            data = { jobPreferences };
            break;
          case 7:
            data = {};
            break;
        }

        const res = await fetch("/api/candidate/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, data }),
        });

        if (!res.ok) throw new Error("Save failed");
        return true;
      } catch {
        toast.error("Failed to save. Please try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [personalInfo, resume, experiences, education, certifications, skills, jobPreferences]
  );

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!personalInfo.firstName.trim() || !personalInfo.lastName.trim()) {
        toast.error("First name and last name are required.");
        return;
      }
    }

    const ok = await saveStep(currentStep);
    if (!ok) return;

    setHighestCompletedStep((prev) => Math.max(prev, currentStep));
    setCurrentStep((prev) => Math.min(prev + 1, 7));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleStepClick = (step: number) => {
    if (step <= highestCompletedStep + 1 && step !== currentStep) {
      setCurrentStep(step);
    }
  };

  const handleComplete = async () => {
    const ok = await saveStep(7);
    if (!ok) return;
    toast.success("Welcome to Think5! Your profile is complete.");
    router.push("/candidate/dashboard");
  };

  // -----------------------------------------------------------------------
  // File upload
  // -----------------------------------------------------------------------

  const uploadFile = async (file: File) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF and DOCX files are accepted.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      setResume({ id: "", fileUrl: result.url, filename: result.filename });
      toast.success("Resume uploaded successfully.");
    } catch {
      toast.error("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const removeResume = () => {
    setResume(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // -----------------------------------------------------------------------
  // Experience helpers
  // -----------------------------------------------------------------------

  const addExperience = () => {
    setExperiences((prev) => [emptyExperience(), ...prev]);
  };

  const updateExperience = (index: number, field: keyof ExperienceEntry, value: string | boolean) => {
    setExperiences((prev) =>
      prev.map((exp, i) => (i === index ? { ...exp, [field]: value } : exp))
    );
  };

  const removeExperience = (index: number) => {
    setExperiences((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------------
  // Education helpers
  // -----------------------------------------------------------------------

  const addEducation = () => {
    setEducation((prev) => [emptyEducation(), ...prev]);
  };

  const updateEducation = (index: number, field: keyof EducationEntry, value: string) => {
    setEducation((prev) =>
      prev.map((ed, i) => (i === index ? { ...ed, [field]: value } : ed))
    );
  };

  const removeEducation = (index: number) => {
    setEducation((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------------
  // Certification helpers
  // -----------------------------------------------------------------------

  const addCertification = () => {
    setCertifications((prev) => [emptyCertification(), ...prev]);
  };

  const updateCertification = (index: number, field: keyof CertificationEntry, value: string) => {
    setCertifications((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const removeCertification = (index: number) => {
    setCertifications((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------------
  // Skill helpers
  // -----------------------------------------------------------------------

  const addSkill = () => {
    const name = newSkillName.trim();
    if (!name) return;
    setSkills((prev) => [
      ...prev,
      { skillName: name, category: "Technical", proficiency: 3, yearsExp: 0 },
    ]);
    setNewSkillName("");
  };

  const updateSkill = (index: number, field: keyof SkillEntry, value: string | number) => {
    setSkills((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  };

  // -----------------------------------------------------------------------
  // Preferences helpers
  // -----------------------------------------------------------------------

  const toggleJobType = (type: string) => {
    setJobPreferences((prev) => ({
      ...prev,
      jobTypes: prev.jobTypes.includes(type)
        ? prev.jobTypes.filter((t) => t !== type)
        : [...prev.jobTypes, type],
    }));
  };

  const addPreferredLocation = () => {
    const loc = newLocationTag.trim();
    if (!loc) return;
    if (jobPreferences.preferredLocations.includes(loc)) {
      setNewLocationTag("");
      return;
    }
    setJobPreferences((prev) => ({
      ...prev,
      preferredLocations: [...prev.preferredLocations, loc],
    }));
    setNewLocationTag("");
  };

  const removePreferredLocation = (loc: string) => {
    setJobPreferences((prev) => ({
      ...prev,
      preferredLocations: prev.preferredLocations.filter((l) => l !== loc),
    }));
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPreferredLocation();
    }
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step progress bar
  // -----------------------------------------------------------------------

  const renderProgressBar = () => (
    <div className="mb-8">
      <div className="flex items-start justify-between relative">
        {/* Connecting lines */}
        <div className="absolute top-5 left-[calc(100%/14)] right-[calc(100%/14)] h-0.5 bg-muted" />
        {STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum <= highestCompletedStep;
          const isClickable = stepNum <= highestCompletedStep + 1;

          return (
            <div
              key={step.label}
              className="relative flex flex-col items-center z-10"
              style={{ width: `${100 / STEPS.length}%` }}
            >
              <button
                type="button"
                onClick={() => handleStepClick(stepNum)}
                disabled={!isClickable}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all text-sm font-semibold",
                  isCompleted
                    ? "bg-green-500 border-green-500 text-white cursor-pointer"
                    : isActive
                    ? "bg-blue-600 border-blue-600 text-white"
                    : isClickable
                    ? "bg-background border-muted-foreground/30 text-muted-foreground cursor-pointer hover:border-blue-400"
                    : "bg-muted border-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  stepNum
                )}
              </button>
              <span
                className={cn(
                  "text-xs mt-2 font-medium text-center leading-tight",
                  isActive
                    ? "text-blue-600"
                    : isCompleted
                    ? "text-green-600"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Step 1: Personal Info
  // -----------------------------------------------------------------------

  const renderPersonalInfo = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          Personal Information
        </CardTitle>
        <CardDescription>Tell us a bit about yourself.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={personalInfo.firstName}
              onChange={(e) =>
                setPersonalInfo((prev) => ({ ...prev, firstName: e.target.value }))
              }
              placeholder="John"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={personalInfo.lastName}
              onChange={(e) =>
                setPersonalInfo((prev) => ({ ...prev, lastName: e.target.value }))
              }
              placeholder="Doe"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={personalInfo.email}
            readOnly
            className="bg-muted cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={personalInfo.phone}
              onChange={(e) =>
                setPersonalInfo((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Current Job Title</Label>
            <Input
              id="jobTitle"
              value={personalInfo.jobTitle}
              onChange={(e) =>
                setPersonalInfo((prev) => ({ ...prev, jobTitle: e.target.value }))
              }
              placeholder="Software Engineer"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            value={personalInfo.linkedinUrl}
            onChange={(e) =>
              setPersonalInfo((prev) => ({ ...prev, linkedinUrl: e.target.value }))
            }
            placeholder="https://linkedin.com/in/johndoe"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Short Bio</Label>
          <Textarea
            id="bio"
            value={personalInfo.bio}
            onChange={(e) =>
              setPersonalInfo((prev) => ({ ...prev, bio: e.target.value }))
            }
            placeholder="Tell us about yourself in a few sentences..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={personalInfo.location}
            onChange={(e) =>
              setPersonalInfo((prev) => ({ ...prev, location: e.target.value }))
            }
            placeholder="San Francisco, CA"
          />
        </div>
      </CardContent>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Step 2: Resume Upload
  // -----------------------------------------------------------------------

  const renderResumeUpload = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Resume
        </CardTitle>
        <CardDescription>Upload your resume so employers can learn more about you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume ? (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="font-medium text-sm">{resume.filename}</p>
                <p className="text-muted-foreground text-xs">Uploaded</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeResume}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors",
              dragOver
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/20"
                : "border-muted-foreground/25 hover:border-blue-400"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              className="hidden"
            />
            {uploading ? (
              <div className="text-center space-y-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="font-medium text-sm">
                  Drop your resume here or click to browse
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  PDF or DOCX only
                </p>
              </>
            )}
          </div>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={handleNext}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Skip for now
          </button>
        </div>
      </CardContent>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Step 3: Work Experience
  // -----------------------------------------------------------------------

  const renderExperience = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              Work Experience
            </CardTitle>
            <CardDescription>Add your professional experience.</CardDescription>
          </div>
          <Button size="sm" onClick={addExperience} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-1" />
            Add Experience
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {experiences.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              No experience added yet. Click &quot;Add Experience&quot; to get started.
            </p>
          </div>
        )}
        {experiences.map((exp, i) => (
          <Card key={i} className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeExperience(i)}
              className="absolute top-3 right-3 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company *</Label>
                  <Input
                    value={exp.company}
                    onChange={(e) => updateExperience(i, "company", e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={exp.title}
                    onChange={(e) => updateExperience(i, "title", e.target.value)}
                    placeholder="Job title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="month"
                    value={exp.startDate}
                    onChange={(e) => updateExperience(i, "startDate", e.target.value)}
                  />
                </div>
                {!exp.isCurrent && (
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="month"
                      value={exp.endDate}
                      onChange={(e) => updateExperience(i, "endDate", e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`current-${i}`}
                  checked={exp.isCurrent}
                  onChange={(e) => {
                    updateExperience(i, "isCurrent", e.target.checked);
                    if (e.target.checked) updateExperience(i, "endDate", "");
                  }}
                  className="rounded border-muted-foreground/30"
                />
                <Label htmlFor={`current-${i}`} className="text-sm font-normal cursor-pointer">
                  I currently work here
                </Label>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={exp.location}
                  onChange={(e) => updateExperience(i, "location", e.target.value)}
                  placeholder="City, State"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={exp.description}
                  onChange={(e) => updateExperience(i, "description", e.target.value)}
                  placeholder="Describe your responsibilities and achievements..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Step 4: Education & Certifications
  // -----------------------------------------------------------------------

  const renderEducation = () => (
    <div className="space-y-6">
      {/* Education */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                Education
              </CardTitle>
              <CardDescription>Add your educational background.</CardDescription>
            </div>
            <Button size="sm" onClick={addEducation} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Add Education
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {education.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <GraduationCap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                No education added yet.
              </p>
            </div>
          )}
          {education.map((ed, i) => (
            <Card key={i} className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEducation(i)}
                className="absolute top-3 right-3 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Institution *</Label>
                  <Input
                    value={ed.institution}
                    onChange={(e) => updateEducation(i, "institution", e.target.value)}
                    placeholder="University or school name"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Degree</Label>
                    <Input
                      value={ed.degree}
                      onChange={(e) => updateEducation(i, "degree", e.target.value)}
                      placeholder="e.g. Bachelor of Science"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Field of Study</Label>
                    <Input
                      value={ed.field}
                      onChange={(e) => updateEducation(i, "field", e.target.value)}
                      placeholder="e.g. Computer Science"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Year</Label>
                    <Input
                      value={ed.startDate}
                      onChange={(e) => updateEducation(i, "startDate", e.target.value)}
                      placeholder="2018"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Year</Label>
                    <Input
                      value={ed.endDate}
                      onChange={(e) => updateEducation(i, "endDate", e.target.value)}
                      placeholder="2022"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Certifications
              </CardTitle>
              <CardDescription>Add any professional certifications.</CardDescription>
            </div>
            <Button size="sm" onClick={addCertification} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Add Certification
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {certifications.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                No certifications added yet.
              </p>
            </div>
          )}
          {certifications.map((cert, i) => (
            <Card key={i} className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeCertification(i)}
                className="absolute top-3 right-3 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Certification Name *</Label>
                    <Input
                      value={cert.name}
                      onChange={(e) => updateCertification(i, "name", e.target.value)}
                      placeholder="e.g. AWS Solutions Architect"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Issuing Organization</Label>
                    <Input
                      value={cert.issuingOrg}
                      onChange={(e) => updateCertification(i, "issuingOrg", e.target.value)}
                      placeholder="e.g. Amazon Web Services"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Issue Date</Label>
                    <Input
                      type="month"
                      value={cert.issueDate}
                      onChange={(e) => updateCertification(i, "issueDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <Input
                      type="month"
                      value={cert.expiryDate}
                      onChange={(e) => updateCertification(i, "expiryDate", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Credential ID / URL</Label>
                  <Input
                    value={cert.credentialId}
                    onChange={(e) => updateCertification(i, "credentialId", e.target.value)}
                    placeholder="Credential ID or verification URL"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  // -----------------------------------------------------------------------
  // Step 5: Skills
  // -----------------------------------------------------------------------

  const renderSkills = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          Skills
        </CardTitle>
        <CardDescription>Add your skills and rate your proficiency.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add skill input */}
        <div className="flex gap-2">
          <Input
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            onKeyDown={handleSkillKeyDown}
            placeholder="Type a skill and press Enter..."
            className="flex-1"
          />
          <Button
            onClick={addSkill}
            disabled={!newSkillName.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Skill cards grid */}
        {skills.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              No skills added yet. Type a skill name above and press Enter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map((skill, i) => (
              <Card key={i} className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSkill(i)}
                  className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
                <CardContent className="pt-4 pb-4 space-y-3">
                  <p className="font-semibold text-sm pr-6">{skill.skillName}</p>

                  {/* Category */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select
                      value={skill.category}
                      onValueChange={(val) => updateSkill(i, "category", val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SKILL_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Proficiency */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Proficiency: {PROFICIENCY_LABELS[skill.proficiency - 1]}
                    </Label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => updateSkill(i, "proficiency", level)}
                          className={cn(
                            "h-7 w-7 rounded text-xs font-medium transition-colors",
                            level <= skill.proficiency
                              ? "bg-blue-600 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                          )}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Years of experience */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Years of Experience</Label>
                    <Input
                      type="number"
                      min={0}
                      value={skill.yearsExp || ""}
                      onChange={(e) =>
                        updateSkill(i, "yearsExp", parseInt(e.target.value) || 0)
                      }
                      className="h-8 text-xs"
                      placeholder="0"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Step 6: Job Preferences
  // -----------------------------------------------------------------------

  const renderPreferences = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          Job Preferences
        </CardTitle>
        <CardDescription>Tell us what you are looking for in your next role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Job Types */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Job Types</Label>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPE_OPTIONS.map((type) => {
              const selected = jobPreferences.jobTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleJobType(type)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                    selected
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  )}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Remote Preference */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Remote Preference</Label>
          <div className="flex flex-wrap gap-2">
            {REMOTE_OPTIONS.map((option) => {
              const selected = jobPreferences.remotePreference === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setJobPreferences((prev) => ({ ...prev, remotePreference: option }))
                  }
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                    selected
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preferred Locations */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preferred Locations</Label>
          <div className="flex gap-2">
            <Input
              value={newLocationTag}
              onChange={(e) => setNewLocationTag(e.target.value)}
              onKeyDown={handleLocationKeyDown}
              placeholder="Type a location and press Enter..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addPreferredLocation}
              disabled={!newLocationTag.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {jobPreferences.preferredLocations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {jobPreferences.preferredLocations.map((loc) => (
                <Badge key={loc} variant="secondary" className="pl-3 pr-1 py-1 gap-1">
                  {loc}
                  <button
                    type="button"
                    onClick={() => removePreferredLocation(loc)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Salary Range */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Salary Range</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Minimum</Label>
              <Input
                type="number"
                value={jobPreferences.salaryMin}
                onChange={(e) =>
                  setJobPreferences((prev) => ({ ...prev, salaryMin: e.target.value }))
                }
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Maximum</Label>
              <Input
                type="number"
                value={jobPreferences.salaryMax}
                onChange={(e) =>
                  setJobPreferences((prev) => ({ ...prev, salaryMax: e.target.value }))
                }
                placeholder="120000"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Select
                value={jobPreferences.salaryCurrency}
                onValueChange={(val) =>
                  setJobPreferences((prev) => ({ ...prev, salaryCurrency: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((cur) => (
                    <SelectItem key={cur} value={cur}>
                      {cur}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Availability</Label>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_OPTIONS.map((option) => {
              const selected = jobPreferences.availability === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setJobPreferences((prev) => ({ ...prev, availability: option }))
                  }
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                    selected
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Willing to Relocate */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label className="text-sm font-medium">Willing to Relocate</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Are you open to relocating for the right opportunity?
            </p>
          </div>
          <Switch
            checked={jobPreferences.willingToRelocate}
            onCheckedChange={(checked) =>
              setJobPreferences((prev) => ({ ...prev, willingToRelocate: checked }))
            }
          />
        </div>
      </CardContent>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Step 7: Review & Submit
  // -----------------------------------------------------------------------

  const renderReview = () => {
    const formatSalary = () => {
      const min = jobPreferences.salaryMin;
      const max = jobPreferences.salaryMax;
      if (!min && !max) return "Not specified";
      const cur = jobPreferences.salaryCurrency || "USD";
      if (min && max) return `${cur} ${Number(min).toLocaleString()} - ${Number(max).toLocaleString()}`;
      if (min) return `${cur} ${Number(min).toLocaleString()}+`;
      return `Up to ${cur} ${Number(max).toLocaleString()}`;
    };

    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <CheckCircle className="w-10 h-10 text-blue-600 mx-auto mb-2" />
          <h2 className="text-xl font-bold">Review Your Profile</h2>
          <p className="text-muted-foreground text-sm">
            Make sure everything looks good before completing your profile.
          </p>
        </div>

        {/* Personal Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Personal Information</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(1)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {personalInfo.firstName} {personalInfo.lastName}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {personalInfo.email || "Not provided"}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {personalInfo.phone || "Not provided"}
            </p>
            <p>
              <span className="text-muted-foreground">Title:</span>{" "}
              {personalInfo.jobTitle || "Not provided"}
            </p>
            <p>
              <span className="text-muted-foreground">Location:</span>{" "}
              {personalInfo.location || "Not provided"}
            </p>
          </CardContent>
        </Card>

        {/* Resume */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Resume</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(2)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{resume ? resume.filename : "Not uploaded"}</p>
          </CardContent>
        </Card>

        {/* Experience */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Experience</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(3)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {experiences.length === 0 ? (
              <p className="text-muted-foreground">No experience added</p>
            ) : (
              <ul className="space-y-1">
                {experiences.map((exp, i) => (
                  <li key={i}>
                    {exp.company} &mdash; {exp.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Education</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(4)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {education.length === 0 ? (
              <p className="text-muted-foreground">No education added</p>
            ) : (
              <ul className="space-y-1">
                {education.map((ed, i) => (
                  <li key={i}>
                    {ed.institution} {ed.degree ? `\u2014 ${ed.degree}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Certifications</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(4)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {certifications.length === 0 ? (
              <p className="text-muted-foreground">No certifications added</p>
            ) : (
              <ul className="space-y-1">
                {certifications.map((cert, i) => (
                  <li key={i}>{cert.name}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Skills</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(5)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent>
            {skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills added</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, i) => (
                  <Badge key={i} variant="secondary">
                    {skill.skillName}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Job Preferences</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(6)}
              className="text-blue-600 hover:text-blue-700"
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Job Types:</span>{" "}
              {jobPreferences.jobTypes.length > 0
                ? jobPreferences.jobTypes.join(", ")
                : "Not specified"}
            </p>
            <p>
              <span className="text-muted-foreground">Remote:</span>{" "}
              {jobPreferences.remotePreference || "Not specified"}
            </p>
            <p>
              <span className="text-muted-foreground">Salary:</span>{" "}
              {formatSalary()}
            </p>
            <p>
              <span className="text-muted-foreground">Availability:</span>{" "}
              {jobPreferences.availability || "Not specified"}
            </p>
            <p>
              <span className="text-muted-foreground">Willing to Relocate:</span>{" "}
              {jobPreferences.willingToRelocate ? "Yes" : "No"}
            </p>
          </CardContent>
        </Card>

        {/* Complete button */}
        <div className="pt-4">
          <Button
            onClick={handleComplete}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Completing...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Profile
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render current step
  // -----------------------------------------------------------------------

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderPersonalInfo();
      case 2:
        return renderResumeUpload();
      case 3:
        return renderExperience();
      case 4:
        return renderEducation();
      case 5:
        return renderSkills();
      case 6:
        return renderPreferences();
      case 7:
        return renderReview();
      default:
        return null;
    }
  };

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Complete Your Profile</h1>
          <p className="text-muted-foreground">
            Set up your profile to get matched with the best opportunities on Think5.
          </p>
        </div>

        {/* Progress bar */}
        {renderProgressBar()}

        {/* Step content */}
        {renderCurrentStep()}

        {/* Navigation buttons (hidden on review step which has its own complete button) */}
        {currentStep < 7 && (
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Back button on review step */}
        {currentStep === 7 && (
          <div className="mt-6">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
