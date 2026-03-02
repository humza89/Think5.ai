"use client";

import { useState, type KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Send, Plus, Save, Loader2 } from "lucide-react";

interface ProfileData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  currentCompany: string;
  linkedinUrl: string;
  skills: string[];
  notes: string;
}

interface ProfilePreviewCardProps {
  initialData?: Partial<ProfileData>;
  profileId?: string;
  onSave?: (data: ProfileData) => Promise<void>;
  onSaveAndNew?: (data: ProfileData) => Promise<void>;
  onSendInvitation?: (data: ProfileData) => void;
}

function buildProfileData(fields: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  currentCompany: string;
  linkedinUrl: string;
  skills: string[];
  notes: string;
  id?: string;
}): ProfileData {
  return {
    id: fields.id,
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    currentTitle: fields.currentTitle,
    currentCompany: fields.currentCompany,
    linkedinUrl: fields.linkedinUrl,
    skills: fields.skills,
    notes: fields.notes,
  };
}

export default function ProfilePreviewCard({
  initialData,
  profileId,
  onSave,
  onSaveAndNew,
  onSendInvitation,
}: ProfilePreviewCardProps) {
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [currentTitle, setCurrentTitle] = useState(initialData?.currentTitle ?? "");
  const [currentCompany, setCurrentCompany] = useState(initialData?.currentCompany ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialData?.linkedinUrl ?? "");
  const [skills, setSkills] = useState<string[]>(initialData?.skills ?? []);
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAndNew, setSavingAndNew] = useState(false);

  function getFormData(): ProfileData {
    return buildProfileData({
      id: profileId ?? initialData?.id,
      firstName,
      lastName,
      email,
      phone,
      currentTitle,
      currentCompany,
      linkedinUrl,
      skills,
      notes,
    });
  }

  function handleSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = skillInput.trim();
      if (value && !skills.includes(value)) {
        setSkills((prev) => [...prev, value]);
      }
      setSkillInput("");
    }
  }

  function addSkill() {
    const value = skillInput.trim();
    if (value && !skills.includes(value)) {
      setSkills((prev) => [...prev, value]);
    }
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(getFormData());
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndNew() {
    if (!onSaveAndNew) return;
    setSavingAndNew(true);
    try {
      await onSaveAndNew(getFormData());
    } finally {
      setSavingAndNew(false);
    }
  }

  function handleSendInvitation() {
    if (!onSendInvitation) return;
    onSendInvitation(getFormData());
  }

  const isProcessing = saving || savingAndNew;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Candidate Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pp-first-name">First Name</Label>
            <Input
              id="pp-first-name"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pp-last-name">Last Name</Label>
            <Input
              id="pp-last-name"
              placeholder="Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* Contact row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pp-email">Email</Label>
            <Input
              id="pp-email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pp-phone">Phone</Label>
            <Input
              id="pp-phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* Professional row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pp-title">Current Title</Label>
            <Input
              id="pp-title"
              placeholder="Senior Software Engineer"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pp-company">Company</Label>
            <Input
              id="pp-company"
              placeholder="Acme Inc."
              value={currentCompany}
              onChange={(e) => setCurrentCompany(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* LinkedIn URL */}
        <div className="space-y-2">
          <Label htmlFor="pp-linkedin">LinkedIn URL</Label>
          <Input
            id="pp-linkedin"
            placeholder="https://linkedin.com/in/username"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            disabled={isProcessing}
          />
        </div>

        {/* Skills */}
        <div className="space-y-2">
          <Label>Skills</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  disabled={isProcessing}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Type a skill and press Enter"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              disabled={isProcessing}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addSkill}
              disabled={isProcessing || !skillInput.trim()}
              aria-label="Add skill"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="pp-notes">Notes</Label>
          <Textarea
            id="pp-notes"
            placeholder="Add any notes about this candidate..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isProcessing}
            rows={3}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          {onSave && (
            <Button onClick={handleSave} disabled={isProcessing}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          )}
          {onSaveAndNew && (
            <Button variant="outline" onClick={handleSaveAndNew} disabled={isProcessing}>
              {savingAndNew ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Save &amp; Add Another
            </Button>
          )}
          {onSendInvitation && (
            <Button variant="secondary" onClick={handleSendInvitation} disabled={isProcessing}>
              <Send className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
