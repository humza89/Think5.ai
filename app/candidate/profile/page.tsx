"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  User,
  Mail,
  Briefcase,
  Building2,
  MapPin,
  FileText,
  ExternalLink,
  Check,
  Loader2,
  GraduationCap,
  Award,
  Star,
  Calendar,
} from "lucide-react";

interface Experience {
  id: string;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  location: string | null;
}

interface Education {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface Certification {
  id: string;
  name: string;
  issuingOrg: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  credentialId: string | null;
}

interface SkillDetail {
  id: string;
  skillName: string;
  category: string | null;
  proficiency: number | null;
  yearsExp: number | null;
}

interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experienceYears: number | null;
  industries: string[];
  resumeUrl: string | null;
  linkedinUrl: string | null;
  location: string | null;
  headline: string | null;
  profileImage: string | null;
  summary: string | null;
  experiences: Experience[];
  education: Education[];
  certifications: Certification[];
  candidateSkills: SkillDetail[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function ProficiencyStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${
            i <= level
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function CandidateProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/candidate/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setFirstName(data.firstName);
          setLastName(data.lastName);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/candidate/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 max-w-3xl py-10">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="w-8 h-8 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-6 max-w-3xl py-10">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Failed to load profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 max-w-3xl">
      <Link
        href="/candidate/dashboard"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="space-y-6">
        {/* Profile Header Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600" />

          <div className="px-8 pb-8">
            {/* Avatar */}
            <div className="-mt-12 mb-4">
              {profile.profileImage ? (
                <Image
                  src={profile.profileImage}
                  alt={`${profile.firstName} ${profile.lastName}`}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-full border-4 border-card object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-card bg-muted flex items-center justify-center">
                  <User className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Name & Headline */}
            <h1 className="text-2xl font-bold text-foreground">
              {profile.firstName} {profile.lastName}
            </h1>
            {profile.headline && (
              <p className="text-base text-muted-foreground mt-1">
                {profile.headline}
              </p>
            )}
            {(profile.currentTitle || profile.currentCompany) && !profile.headline && (
              <p className="text-base text-muted-foreground mt-1">
                {profile.currentTitle}
                {profile.currentTitle && profile.currentCompany && " at "}
                {profile.currentCompany}
              </p>
            )}

            {/* Location & Links */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {profile.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> {profile.email}
                <Badge className="bg-green-400/10 text-green-400 border-green-400/20 text-[10px] ml-1">
                  Verified
                </Badge>
              </span>
            </div>

            <div className="flex gap-3 mt-4">
              {profile.linkedinUrl && (
                <a
                  href={profile.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> LinkedIn
                </a>
              )}
              {profile.resumeUrl && (
                <a
                  href={profile.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 font-medium"
                >
                  <FileText className="w-3.5 h-3.5" /> Resume
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Edit Name */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-400" />
            Account Information
          </h2>
          <form onSubmit={handleSave} className="flex items-end gap-4">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1.5 block">First Name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Last Name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <><Check className="w-4 h-4 mr-1" /> Saved</>
              ) : (
                "Save"
              )}
            </Button>
          </form>
        </div>

        {/* About */}
        {profile.summary && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-3">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {profile.summary}
            </p>
          </div>
        )}

        {/* Experience */}
        {profile.experiences.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-400" />
              Experience
            </h2>
            <div className="space-y-5">
              {profile.experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="flex gap-4 pb-5 last:pb-0 last:border-0 border-b border-border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {exp.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {exp.company}
                        </p>
                      </div>
                      {exp.isCurrent && (
                        <Badge variant="outline" className="text-green-500 border-green-500/30 text-[10px] shrink-0">
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {(exp.startDate || exp.endDate) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(exp.startDate)}
                          {" - "}
                          {exp.isCurrent ? "Present" : formatDate(exp.endDate)}
                        </span>
                      )}
                      {exp.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {exp.location}
                        </span>
                      )}
                    </div>
                    {exp.description && (
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        {exp.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {profile.education.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-400" />
              Education
            </h2>
            <div className="space-y-5">
              {profile.education.map((edu) => (
                <div
                  key={edu.id}
                  className="flex gap-4 pb-5 last:pb-0 last:border-0 border-b border-border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {edu.institution}
                    </h3>
                    {(edu.degree || edu.field) && (
                      <p className="text-sm text-muted-foreground">
                        {edu.degree}
                        {edu.degree && edu.field && ", "}
                        {edu.field}
                      </p>
                    )}
                    {(edu.startDate || edu.endDate) && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(edu.startDate)}
                        {edu.startDate && edu.endDate && " - "}
                        {formatDate(edu.endDate)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {profile.candidateSkills.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-blue-400" />
              Skills
            </h2>
            <div className="space-y-2">
              {profile.candidateSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium">
                      {skill.skillName}
                    </span>
                    {skill.category && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {skill.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {skill.yearsExp != null && (
                      <span className="text-xs text-muted-foreground">
                        {skill.yearsExp}y
                      </span>
                    )}
                    {skill.proficiency != null && (
                      <ProficiencyStars level={skill.proficiency} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          Array.isArray(profile.skills) && profile.skills.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-blue-400" />
                Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, i) => (
                  <Badge
                    key={i}
                    className="bg-blue-500/10 text-blue-500 border-blue-500/20"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )
        )}

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-400" />
              Certifications
            </h2>
            <div className="space-y-4">
              {profile.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="flex gap-4 pb-4 last:pb-0 last:border-0 border-b border-border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Award className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {cert.name}
                    </h3>
                    {cert.issuingOrg && (
                      <p className="text-sm text-muted-foreground">
                        {cert.issuingOrg}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {cert.issueDate && (
                        <span>Issued {formatDate(cert.issueDate)}</span>
                      )}
                      {cert.expiryDate && (
                        <span>Expires {formatDate(cert.expiryDate)}</span>
                      )}
                      {cert.credentialId && (
                        <span>ID: {cert.credentialId}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
