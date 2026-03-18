"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Bot,
} from "lucide-react"

export interface ExperienceEntry {
  id: string
  company: string
  title: string
  startDate: string
  endDate: string
  isCurrent: boolean
  description: string
  location: string
}

interface ExperienceStepProps {
  experiences: ExperienceEntry[]
  onChange: (experiences: ExperienceEntry[]) => void
}

function createEmptyExperience(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    title: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    location: "",
  }
}

export default function ExperienceStep({
  experiences,
  onChange,
}: ExperienceStepProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(experiences.map((e) => e.id))
  )

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function updateEntry(id: string, updates: Partial<ExperienceEntry>) {
    onChange(
      experiences.map((exp) =>
        exp.id === id ? { ...exp, ...updates } : exp
      )
    )
  }

  function addExperience() {
    const newEntry = createEmptyExperience()
    onChange([...experiences, newEntry])
    setExpandedIds((prev) => new Set([...prev, newEntry.id]))
  }

  function removeExperience(id: string) {
    onChange(experiences.filter((exp) => exp.id !== id))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Work Experience
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and edit your work history. This may have been pre-filled from
          your resume.
        </p>
      </div>

      {experiences.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {experiences.length} {experiences.length === 1 ? "entry" : "entries"}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Bot className="h-3 w-3" />
            Pre-filled from resume
          </Badge>
        </div>
      )}

      <div className="space-y-4">
        {experiences.map((exp) => {
          const isExpanded = expandedIds.has(exp.id)

          return (
            <Card key={exp.id} className="overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpanded(exp.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(exp.id); } }}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {exp.title || "Untitled Position"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {exp.company || "Company"}
                      {exp.startDate && ` \u00b7 ${exp.startDate}`}
                      {exp.isCurrent
                        ? " \u2013 Present"
                        : exp.endDate
                          ? ` \u2013 ${exp.endDate}`
                          : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeExperience(exp.id)
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="border-t border-border pt-4">
                  <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`company-${exp.id}`}>Company</Label>
                        <Input
                          id={`company-${exp.id}`}
                          placeholder="Company name"
                          value={exp.company}
                          onChange={(e) =>
                            updateEntry(exp.id, { company: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`title-${exp.id}`}>Job Title</Label>
                        <Input
                          id={`title-${exp.id}`}
                          placeholder="e.g. Software Engineer"
                          value={exp.title}
                          onChange={(e) =>
                            updateEntry(exp.id, { title: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`location-${exp.id}`}>Location</Label>
                      <Input
                        id={`location-${exp.id}`}
                        placeholder="e.g. San Francisco, CA"
                        value={exp.location}
                        onChange={(e) =>
                          updateEntry(exp.id, { location: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`start-${exp.id}`}>Start Date</Label>
                        <Input
                          id={`start-${exp.id}`}
                          placeholder="MM/YYYY"
                          value={exp.startDate}
                          onChange={(e) =>
                            updateEntry(exp.id, { startDate: e.target.value })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: MM/YYYY
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`end-${exp.id}`}>End Date</Label>
                        <Input
                          id={`end-${exp.id}`}
                          placeholder="MM/YYYY"
                          value={exp.endDate}
                          disabled={exp.isCurrent}
                          onChange={(e) =>
                            updateEntry(exp.id, { endDate: e.target.value })
                          }
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`current-${exp.id}`}
                            checked={exp.isCurrent}
                            onCheckedChange={(checked) =>
                              updateEntry(exp.id, {
                                isCurrent: checked === true,
                                endDate: checked === true ? "" : exp.endDate,
                              })
                            }
                          />
                          <Label
                            htmlFor={`current-${exp.id}`}
                            className="text-sm font-normal text-muted-foreground"
                          >
                            Currently working here
                          </Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`desc-${exp.id}`}>Description</Label>
                      <Textarea
                        id={`desc-${exp.id}`}
                        placeholder="Describe your role, responsibilities, and accomplishments..."
                        value={exp.description}
                        onChange={(e) =>
                          updateEntry(exp.id, { description: e.target.value })
                        }
                        rows={4}
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addExperience}
        className="w-full border-dashed"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Experience
      </Button>

      {experiences.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No work experience added yet. This step is optional.
        </p>
      )}
    </div>
  )
}
