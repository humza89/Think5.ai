"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  CheckCircle2,
  User,
  FileText,
  Briefcase,
  Wrench,
  GraduationCap,
  Settings2,
  ShieldCheck,
} from "lucide-react"

import type { ExperienceEntry } from "./ExperienceStep"
import type { Skill, EducationEntry, CertificationEntry } from "./SkillsEducationStep"
import type { JobPreferences } from "./PreferencesStep"

interface PersonalInfo {
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
  linkedIn: string
  profileImage?: string
}

interface ResumeInfo {
  fileName: string
  uploadedAt?: string
}

interface ReviewSubmitStepProps {
  personalInfo: PersonalInfo
  resume: ResumeInfo | null
  professionalSummary: string
  experiences: ExperienceEntry[]
  skills: Skill[]
  education: EducationEntry[]
  certifications: CertificationEntry[]
  preferences: JobPreferences
  onConsentChange: (consent: { consentGdpr: boolean; consentDataProcessing: boolean }) => void
}

function SectionHeader({
  icon: Icon,
  title,
  hasData,
}: {
  icon: React.ElementType
  title: string
  hasData: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      {hasData && (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      )}
    </div>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | undefined
}) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        {label}:
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

export default function ReviewSubmitStep({
  personalInfo,
  resume,
  professionalSummary,
  experiences,
  skills,
  education,
  certifications,
  preferences,
  onConsentChange,
}: ReviewSubmitStepProps) {
  const [consentData, setConsentData] = useState(false)
  const [consentShare, setConsentShare] = useState(false)

  function updateConsent(field: "data" | "share", value: boolean) {
    const newData = field === "data" ? value : consentData
    const newShare = field === "share" ? value : consentShare
    if (field === "data") setConsentData(value)
    if (field === "share") setConsentShare(value)
    onConsentChange({ consentGdpr: newData, consentDataProcessing: newShare })
  }

  const hasPersonalInfo = !!(
    personalInfo.firstName ||
    personalInfo.lastName ||
    personalInfo.email
  )
  const hasResume = !!resume?.fileName
  const hasSummary = !!professionalSummary
  const hasExperience = experiences.length > 0
  const hasSkills = skills.length > 0
  const hasEducation = education.length > 0 || certifications.length > 0
  const hasPreferences =
    preferences.preferredTitles.length > 0 ||
    preferences.preferredLocations.length > 0 ||
    !!preferences.remotePreference ||
    !!preferences.availability

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Review & Submit
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your information before submitting. You can go back to any step
          to make changes.
        </p>
      </div>

      {/* Personal Info */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={User}
            title="Personal Information"
            hasData={hasPersonalInfo}
          />
          <div className="mt-4 grid gap-1.5 pl-11">
            {personalInfo.profileImage && (
              <div className="mb-2">
                <img
                  src={personalInfo.profileImage}
                  alt="Profile"
                  className="h-16 w-16 rounded-full border border-border object-cover"
                />
              </div>
            )}
            <InfoRow
              label="Name"
              value={
                [personalInfo.firstName, personalInfo.lastName]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            <InfoRow label="Email" value={personalInfo.email} />
            <InfoRow label="Phone" value={personalInfo.phone} />
            <InfoRow label="Location" value={personalInfo.location} />
            <InfoRow label="LinkedIn" value={personalInfo.linkedIn} />
            {!hasPersonalInfo && (
              <p className="text-sm italic text-muted-foreground">
                No personal information provided
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resume */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={FileText}
            title="Resume"
            hasData={hasResume}
          />
          <div className="mt-4 pl-11">
            {hasResume ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{resume!.fileName}</Badge>
                {resume!.uploadedAt && (
                  <span className="text-xs text-muted-foreground">
                    Uploaded {resume!.uploadedAt}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No resume uploaded
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Professional Summary */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={FileText}
            title="Professional Summary"
            hasData={hasSummary}
          />
          <div className="mt-4 pl-11">
            {hasSummary ? (
              <p className="text-sm leading-relaxed text-foreground">
                {professionalSummary}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No professional summary provided
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Work Experience */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={Briefcase}
            title="Work Experience"
            hasData={hasExperience}
          />
          <div className="mt-4 space-y-3 pl-11">
            {hasExperience ? (
              experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="rounded-md border border-border bg-muted/30 p-3"
                >
                  <p className="font-medium text-foreground">{exp.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {exp.company}
                    {exp.location && ` \u00b7 ${exp.location}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exp.startDate || "N/A"}
                    {" \u2013 "}
                    {exp.isCurrent
                      ? "Present"
                      : exp.endDate || "N/A"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No work experience added
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={Wrench}
            title="Skills"
            hasData={hasSkills}
          />
          <div className="mt-4 pl-11">
            {hasSkills ? (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Badge key={skill.id} variant="secondary">
                    {skill.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No skills added
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Education & Certifications */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={GraduationCap}
            title="Education & Certifications"
            hasData={hasEducation}
          />
          <div className="mt-4 space-y-3 pl-11">
            {education.length > 0 ? (
              education.map((edu) => (
                <div
                  key={edu.id}
                  className="rounded-md border border-border bg-muted/30 p-3"
                >
                  <p className="font-medium text-foreground">
                    {edu.degree}
                    {edu.fieldOfStudy && ` in ${edu.fieldOfStudy}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {edu.institution}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {edu.startDate || "N/A"} \u2013 {edu.endDate || "N/A"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No education added
              </p>
            )}

            {certifications.length > 0 && (
              <>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Certifications
                </p>
                {certifications.map((cert) => (
                  <div
                    key={cert.id}
                    className="rounded-md border border-border bg-muted/30 p-3"
                  >
                    <p className="font-medium text-foreground">{cert.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {cert.issuingOrganization}
                    </p>
                    {cert.issueDate && (
                      <p className="text-xs text-muted-foreground">
                        Issued: {cert.issueDate}
                        {cert.expiryDate && ` \u00b7 Expires: ${cert.expiryDate}`}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Job Preferences */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            icon={Settings2}
            title="Job Preferences"
            hasData={hasPreferences}
          />
          <div className="mt-4 grid gap-1.5 pl-11">
            {preferences.preferredTitles.length > 0 && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Preferred Titles:
                </span>
                <div className="flex flex-wrap gap-1">
                  {preferences.preferredTitles.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {preferences.preferredLocations.length > 0 && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Preferred Locations:
                </span>
                <div className="flex flex-wrap gap-1">
                  {preferences.preferredLocations.map((l) => (
                    <Badge key={l} variant="secondary">
                      {l}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <InfoRow
              label="Remote Preference"
              value={
                preferences.remotePreference
                  ? preferences.remotePreference.charAt(0).toUpperCase() +
                    preferences.remotePreference.slice(1)
                  : undefined
              }
            />
            {preferences.employmentTypes.length > 0 && (
              <InfoRow
                label="Employment Type"
                value={preferences.employmentTypes.join(", ")}
              />
            )}
            {(preferences.salaryMin || preferences.salaryMax) && (
              <InfoRow
                label="Salary Range"
                value={`${preferences.currency || "USD"} ${
                  preferences.salaryMin
                    ? Number(preferences.salaryMin).toLocaleString()
                    : "?"
                } \u2013 ${
                  preferences.salaryMax
                    ? Number(preferences.salaryMax).toLocaleString()
                    : "?"
                }`}
              />
            )}
            <InfoRow
              label="Availability"
              value={
                preferences.availability
                  ? preferences.availability
                      .replace(/-/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                  : undefined
              }
            />
            <InfoRow label="Notice Period" value={preferences.noticePeriod} />
            {preferences.willingToRelocate && (
              <InfoRow label="Relocation" value="Willing to relocate" />
            )}
            <InfoRow
              label="Work Authorization"
              value={preferences.workAuthorization}
            />
            {!hasPreferences && (
              <p className="text-sm italic text-muted-foreground">
                No job preferences specified
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Consent & Submit */}
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">
              Consent & Submission
            </h3>
          </div>

          <div className="mt-4 space-y-4 pl-11">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-data"
                checked={consentData}
                onCheckedChange={(checked) =>
                  updateConsent("data", checked === true)
                }
              />
              <Label
                htmlFor="consent-data"
                className="text-sm font-normal leading-relaxed text-muted-foreground"
              >
                I consent to the processing of my personal data in accordance
                with the privacy policy. I understand my data will be stored
                securely and used for recruitment purposes.
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-share"
                checked={consentShare}
                onCheckedChange={(checked) =>
                  updateConsent("share", checked === true)
                }
              />
              <Label
                htmlFor="consent-share"
                className="text-sm font-normal leading-relaxed text-muted-foreground"
              >
                I consent to sharing my profile with recruiters and hiring
                managers on the Paraform platform. I can withdraw my consent at
                any time.
              </Label>
            </div>

            {!consentData || !consentShare ? (
              <p className="text-xs text-muted-foreground">
                Please accept both consent checkboxes to submit your profile.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
