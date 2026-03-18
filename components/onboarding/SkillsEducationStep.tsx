"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Award,
  Wrench,
  Star,
} from "lucide-react"

export interface Skill {
  id: string
  name: string
  proficiency: number // 1-5
}

export interface EducationEntry {
  id: string
  institution: string
  degree: string
  fieldOfStudy: string
  startDate: string
  endDate: string
}

export interface CertificationEntry {
  id: string
  name: string
  issuingOrganization: string
  issueDate: string
  expiryDate: string
  credentialId: string
}

interface SkillsEducationStepProps {
  skills: Skill[]
  education: EducationEntry[]
  certifications: CertificationEntry[]
  onChange: (data: {
    skills: Skill[]
    education: EducationEntry[]
    certifications: CertificationEntry[]
  }) => void
}

function ProficiencyStars({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className="p-0.5 transition-colors"
          title={`Proficiency: ${level}/5`}
        >
          <Star
            className={`h-3.5 w-3.5 ${
              level <= value
                ? "fill-primary text-primary"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function SkillsEducationStep({
  skills,
  education,
  certifications,
  onChange,
}: SkillsEducationStepProps) {
  const [skillInput, setSkillInput] = useState("")
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["skills", "education", "certifications"])
  )

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Skills
  function addSkill(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
      return
    const newSkill: Skill = {
      id: crypto.randomUUID(),
      name: trimmed,
      proficiency: 3,
    }
    onChange({
      skills: [...skills, newSkill],
      education,
      certifications,
    })
  }

  function removeSkill(id: string) {
    onChange({
      skills: skills.filter((s) => s.id !== id),
      education,
      certifications,
    })
  }

  function updateSkillProficiency(id: string, proficiency: number) {
    onChange({
      skills: skills.map((s) => (s.id === id ? { ...s, proficiency } : s)),
      education,
      certifications,
    })
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const parts = skillInput.split(",")
      parts.forEach((part) => addSkill(part))
      setSkillInput("")
    }
  }

  // Education
  function addEducation() {
    const newEntry: EducationEntry = {
      id: crypto.randomUUID(),
      institution: "",
      degree: "",
      fieldOfStudy: "",
      startDate: "",
      endDate: "",
    }
    onChange({
      skills,
      education: [...education, newEntry],
      certifications,
    })
  }

  function updateEducation(id: string, updates: Partial<EducationEntry>) {
    onChange({
      skills,
      education: education.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
      certifications,
    })
  }

  function removeEducation(id: string) {
    onChange({
      skills,
      education: education.filter((e) => e.id !== id),
      certifications,
    })
  }

  // Certifications
  function addCertification() {
    const newEntry: CertificationEntry = {
      id: crypto.randomUUID(),
      name: "",
      issuingOrganization: "",
      issueDate: "",
      expiryDate: "",
      credentialId: "",
    }
    onChange({
      skills,
      education,
      certifications: [...certifications, newEntry],
    })
  }

  function updateCertification(
    id: string,
    updates: Partial<CertificationEntry>
  ) {
    onChange({
      skills,
      education,
      certifications: certifications.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })
  }

  function removeCertification(id: string) {
    onChange({
      skills,
      education,
      certifications: certifications.filter((c) => c.id !== id),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Skills & Education
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your skills, education, and certifications. Some may have been
          pre-filled from your resume.
        </p>
      </div>

      {/* Skills Section */}
      <Card>
        <button
          type="button"
          onClick={() => toggleSection("skills")}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Skills</h3>
              <p className="text-sm text-muted-foreground">
                {skills.length} skill{skills.length !== 1 ? "s" : ""} added
              </p>
            </div>
          </div>
          {expandedSections.has("skills") ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {expandedSections.has("skills") && (
          <CardContent className="border-t border-border pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-input">Add Skills</Label>
                <Input
                  id="skill-input"
                  placeholder="Type a skill and press Enter or comma to add..."
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                />
                <p className="text-xs text-muted-foreground">
                  Press Enter or comma to add a skill. Click stars to set
                  proficiency.
                </p>
              </div>

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1.5"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {skill.name}
                      </span>
                      <ProficiencyStars
                        value={skill.proficiency}
                        onChange={(v) => updateSkillProficiency(skill.id, v)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSkill(skill.id)}
                        className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Education Section */}
      <Card>
        <button
          type="button"
          onClick={() => toggleSection("education")}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Education</h3>
              <p className="text-sm text-muted-foreground">
                {education.length} entr{education.length !== 1 ? "ies" : "y"}{" "}
                added
              </p>
            </div>
          </div>
          {expandedSections.has("education") ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {expandedSections.has("education") && (
          <CardContent className="border-t border-border pt-4">
            <div className="space-y-4">
              {education.map((edu) => (
                <div
                  key={edu.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {edu.institution || "New Education Entry"}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEducation(edu.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`edu-inst-${edu.id}`}>
                          Institution
                        </Label>
                        <Input
                          id={`edu-inst-${edu.id}`}
                          placeholder="University or school name"
                          value={edu.institution}
                          onChange={(e) =>
                            updateEducation(edu.id, {
                              institution: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`edu-degree-${edu.id}`}>Degree</Label>
                        <Input
                          id={`edu-degree-${edu.id}`}
                          placeholder="e.g. Bachelor of Science"
                          value={edu.degree}
                          onChange={(e) =>
                            updateEducation(edu.id, { degree: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`edu-field-${edu.id}`}>
                        Field of Study
                      </Label>
                      <Input
                        id={`edu-field-${edu.id}`}
                        placeholder="e.g. Computer Science"
                        value={edu.fieldOfStudy}
                        onChange={(e) =>
                          updateEducation(edu.id, {
                            fieldOfStudy: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`edu-start-${edu.id}`}>
                          Start Date
                        </Label>
                        <Input
                          id={`edu-start-${edu.id}`}
                          placeholder="MM/YYYY"
                          value={edu.startDate}
                          onChange={(e) =>
                            updateEducation(edu.id, {
                              startDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`edu-end-${edu.id}`}>End Date</Label>
                        <Input
                          id={`edu-end-${edu.id}`}
                          placeholder="MM/YYYY"
                          value={edu.endDate}
                          onChange={(e) =>
                            updateEducation(edu.id, {
                              endDate: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addEducation}
                className="w-full border-dashed"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Education
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Certifications Section */}
      <Card>
        <button
          type="button"
          onClick={() => toggleSection("certifications")}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Certifications</h3>
              <p className="text-sm text-muted-foreground">
                {certifications.length} certification
                {certifications.length !== 1 ? "s" : ""} added
              </p>
            </div>
          </div>
          {expandedSections.has("certifications") ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {expandedSections.has("certifications") && (
          <CardContent className="border-t border-border pt-4">
            <div className="space-y-4">
              {certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {cert.name || "New Certification"}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCertification(cert.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cert-name-${cert.id}`}>
                          Certification Name
                        </Label>
                        <Input
                          id={`cert-name-${cert.id}`}
                          placeholder="e.g. AWS Solutions Architect"
                          value={cert.name}
                          onChange={(e) =>
                            updateCertification(cert.id, {
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cert-org-${cert.id}`}>
                          Issuing Organization
                        </Label>
                        <Input
                          id={`cert-org-${cert.id}`}
                          placeholder="e.g. Amazon Web Services"
                          value={cert.issuingOrganization}
                          onChange={(e) =>
                            updateCertification(cert.id, {
                              issuingOrganization: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cert-issue-${cert.id}`}>
                          Issue Date
                        </Label>
                        <Input
                          id={`cert-issue-${cert.id}`}
                          placeholder="MM/YYYY"
                          value={cert.issueDate}
                          onChange={(e) =>
                            updateCertification(cert.id, {
                              issueDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cert-expiry-${cert.id}`}>
                          Expiry Date
                        </Label>
                        <Input
                          id={`cert-expiry-${cert.id}`}
                          placeholder="MM/YYYY"
                          value={cert.expiryDate}
                          onChange={(e) =>
                            updateCertification(cert.id, {
                              expiryDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cert-cred-${cert.id}`}>
                          Credential ID
                        </Label>
                        <Input
                          id={`cert-cred-${cert.id}`}
                          placeholder="Optional"
                          value={cert.credentialId}
                          onChange={(e) =>
                            updateCertification(cert.id, {
                              credentialId: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addCertification}
                className="w-full border-dashed"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Certification
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
