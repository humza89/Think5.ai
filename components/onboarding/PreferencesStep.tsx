"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  X,
  Briefcase,
  DollarSign,
  Clock,
  Settings2,
} from "lucide-react"

export interface JobPreferences {
  preferredTitles: string[]
  preferredLocations: string[]
  remotePreference: string
  employmentTypes: string[]
  salaryMin: string
  salaryMax: string
  currency: string
  availability: string
  noticePeriod: string
  willingToRelocate: boolean
  workAuthorization: string
  preferredIndustries: string[]
  preferredCompanies: string[]
}

export interface PreferencesErrors {
  preferredTitles?: string
  preferredLocations?: string
  remotePreference?: string
  employmentTypes?: string
  salaryMin?: string
  salaryMax?: string
  availability?: string
  noticePeriod?: string
  workAuthorization?: string
  preferredIndustries?: string
  preferredCompanies?: string
}

export function validatePreferences(prefs: JobPreferences): PreferencesErrors {
  const errors: PreferencesErrors = {}
  if (!prefs.preferredTitles.length) errors.preferredTitles = "At least one preferred job title is required"
  if (!prefs.preferredLocations.length) errors.preferredLocations = "At least one preferred location is required"
  if (!prefs.remotePreference) errors.remotePreference = "Remote preference is required"
  if (!prefs.employmentTypes.length) errors.employmentTypes = "At least one employment type is required"
  if (!prefs.salaryMin || isNaN(Number(prefs.salaryMin))) errors.salaryMin = "Minimum salary is required"
  if (!prefs.salaryMax || isNaN(Number(prefs.salaryMax))) errors.salaryMax = "Maximum salary is required"
  if (prefs.salaryMin && prefs.salaryMax && Number(prefs.salaryMax) < Number(prefs.salaryMin)) errors.salaryMax = "Maximum salary must be greater than minimum"
  if (!prefs.availability) errors.availability = "Availability is required"
  if (!prefs.noticePeriod.trim()) errors.noticePeriod = "Notice period is required"
  if (!prefs.workAuthorization.trim()) errors.workAuthorization = "Visa / work authorization status is required"
  if (!prefs.preferredIndustries.length) errors.preferredIndustries = "At least one preferred industry is required"
  if (!prefs.preferredCompanies.length) errors.preferredCompanies = "At least one preferred company is required"
  return errors
}

interface PreferencesStepProps {
  preferences: JobPreferences
  onChange: (preferences: JobPreferences) => void
  errors?: PreferencesErrors
}

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Temp-to-Hire"]
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY", "CHF"]

function TagInput({
  id,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  id: string
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder: string
}) {
  const [input, setInput] = useState("")

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const trimmed = input.trim()
      if (trimmed && !tags.includes(trimmed)) {
        onAdd(trimmed)
      }
      setInput("")
    }
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add
      </p>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

function RequiredStar() {
  return <span className="text-destructive">*</span>
}

export default function PreferencesStep({
  preferences,
  onChange,
  errors = {},
}: PreferencesStepProps) {
  function update(updates: Partial<JobPreferences>) {
    onChange({ ...preferences, ...updates })
  }

  function addTag(field: keyof JobPreferences, tag: string) {
    const current = preferences[field] as string[]
    if (!current.includes(tag)) {
      update({ [field]: [...current, tag] })
    }
  }

  function removeTag(field: keyof JobPreferences, tag: string) {
    const current = preferences[field] as string[]
    update({ [field]: current.filter((t) => t !== tag) })
  }

  function toggleEmploymentType(type: string) {
    const current = preferences.employmentTypes
    if (current.includes(type)) {
      update({ employmentTypes: current.filter((t) => t !== type) })
    } else {
      update({ employmentTypes: [...current, type] })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Job Preferences
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what you are looking for. All fields are required to help us
          match you with the right opportunities.
        </p>
      </div>

      {/* Job Search Preferences */}
      <Card>
        <div className="flex items-center gap-3 p-6 pb-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">
            Job Search Preferences
          </h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="preferred-titles">Preferred Job Titles <RequiredStar /></Label>
              <TagInput
                id="preferred-titles"
                tags={preferences.preferredTitles}
                onAdd={(tag) => addTag("preferredTitles", tag)}
                onRemove={(tag) => removeTag("preferredTitles", tag)}
                placeholder="e.g. Software Engineer, Frontend Developer"
              />
              <FieldError message={errors.preferredTitles} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preferred-locations">Preferred Locations <RequiredStar /></Label>
              <TagInput
                id="preferred-locations"
                tags={preferences.preferredLocations}
                onAdd={(tag) => addTag("preferredLocations", tag)}
                onRemove={(tag) => removeTag("preferredLocations", tag)}
                placeholder="e.g. San Francisco, New York, Remote"
              />
              <FieldError message={errors.preferredLocations} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Remote Preference <RequiredStar /></Label>
                <Select
                  value={preferences.remotePreference}
                  onValueChange={(value) =>
                    update({ remotePreference: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={errors.remotePreference} />
              </div>

              <div className="space-y-1.5">
                <Label>Employment Type <RequiredStar /></Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {EMPLOYMENT_TYPES.map((type) => {
                    const isSelected =
                      preferences.employmentTypes.includes(type)
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleEmploymentType(type)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
                <FieldError message={errors.employmentTypes} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compensation */}
      <Card>
        <div className="flex items-center gap-3 p-6 pb-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Compensation</h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="salary-min">Salary Range Min <RequiredStar /></Label>
              <Input
                id="salary-min"
                type="number"
                placeholder="e.g. 100000"
                value={preferences.salaryMin}
                onChange={(e) => update({ salaryMin: e.target.value })}
              />
              <FieldError message={errors.salaryMin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salary-max">Salary Range Max <RequiredStar /></Label>
              <Input
                id="salary-max"
                type="number"
                placeholder="e.g. 150000"
                value={preferences.salaryMax}
                onChange={(e) => update({ salaryMax: e.target.value })}
              />
              <FieldError message={errors.salaryMax} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select
                value={preferences.currency}
                onValueChange={(value) => update({ currency: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Availability */}
      <Card>
        <div className="flex items-center gap-3 p-6 pb-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Availability</h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Availability <RequiredStar /></Label>
                <Select
                  value={preferences.availability}
                  onValueChange={(value) => update({ availability: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediately">Immediately</SelectItem>
                    <SelectItem value="2-weeks">2 Weeks</SelectItem>
                    <SelectItem value="1-month">1 Month</SelectItem>
                    <SelectItem value="3-months">3 Months</SelectItem>
                    <SelectItem value="not-looking">Not Looking</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={errors.availability} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notice-period">Notice Period <RequiredStar /></Label>
                <Input
                  id="notice-period"
                  placeholder="e.g. 2 weeks, 30 days"
                  value={preferences.noticePeriod}
                  onChange={(e) => update({ noticePeriod: e.target.value })}
                />
                <FieldError message={errors.noticePeriod} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="relocate"
                checked={preferences.willingToRelocate}
                onCheckedChange={(checked) =>
                  update({ willingToRelocate: checked === true })
                }
              />
              <Label
                htmlFor="relocate"
                className="text-sm font-normal text-muted-foreground"
              >
                Willing to relocate for the right opportunity
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional */}
      <Card>
        <div className="flex items-center gap-3 p-6 pb-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Additional</h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="work-auth">
                Visa / Work Authorization Status <RequiredStar />
              </Label>
              <Input
                id="work-auth"
                placeholder="e.g. US Citizen, H-1B, Green Card"
                value={preferences.workAuthorization}
                onChange={(e) =>
                  update({ workAuthorization: e.target.value })
                }
              />
              <FieldError message={errors.workAuthorization} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preferred-industries">
                Preferred Industries <RequiredStar />
              </Label>
              <TagInput
                id="preferred-industries"
                tags={preferences.preferredIndustries}
                onAdd={(tag) => addTag("preferredIndustries", tag)}
                onRemove={(tag) => removeTag("preferredIndustries", tag)}
                placeholder="e.g. FinTech, Healthcare, SaaS"
              />
              <FieldError message={errors.preferredIndustries} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preferred-companies">Preferred Companies <RequiredStar /></Label>
              <TagInput
                id="preferred-companies"
                tags={preferences.preferredCompanies}
                onAdd={(tag) => addTag("preferredCompanies", tag)}
                onRemove={(tag) => removeTag("preferredCompanies", tag)}
                placeholder="e.g. Google, Stripe, Airbnb"
              />
              <FieldError message={errors.preferredCompanies} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
