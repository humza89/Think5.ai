"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
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
} from "lucide-react";

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

  return (
    <main className="min-h-screen bg-black">
      <Header />

      <div className="pt-28 pb-24">
        <div className="container mx-auto px-6 max-w-3xl">
          <Link
            href="/candidate/dashboard"
            className="inline-flex items-center text-sm text-white/50 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>

          <h1 className="text-4xl font-bold text-white mb-2">Your Profile</h1>
          <p className="text-white/50 mb-10">
            Manage your account information.
          </p>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/40">Loading profile...</p>
            </div>
          ) : profile ? (
            <div className="space-y-8">
              {/* Editable Fields */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
                <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-400" />
                  Account Information
                </h2>
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Label className="text-white/80 mb-2 block">
                        First Name
                      </Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-white/80 mb-2 block">
                        Last Name
                      </Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-white/80 mb-2 block">Email</Label>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-white/40" />
                      <span className="text-white/60">{profile.email}</span>
                      <Badge className="bg-green-400/10 text-green-400 border-green-400/20 text-xs">
                        Verified
                      </Badge>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl h-10 px-6"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : saved ? (
                        <Check className="w-4 h-4 mr-2" />
                      ) : null}
                      {saved ? "Saved" : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Read-only Profile Data (from recruiter-managed Candidate records) */}
              {(profile.currentTitle ||
                profile.currentCompany ||
                (Array.isArray(profile.skills) &&
                  profile.skills.length > 0) ||
                profile.location ||
                profile.linkedinUrl ||
                profile.resumeUrl) && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
                  <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-blue-400" />
                    Professional Information
                  </h2>
                  <p className="text-xs text-white/30 mb-6">
                    This information is managed by your recruiter.
                  </p>

                  <div className="space-y-4">
                    {profile.currentTitle && (
                      <div className="flex items-center gap-3">
                        <Briefcase className="w-4 h-4 text-white/30" />
                        <span className="text-white/70">{profile.currentTitle}</span>
                      </div>
                    )}
                    {profile.currentCompany && (
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-white/30" />
                        <span className="text-white/70">{profile.currentCompany}</span>
                      </div>
                    )}
                    {profile.location && (
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-white/30" />
                        <span className="text-white/70">{profile.location}</span>
                      </div>
                    )}
                    {Array.isArray(profile.skills) &&
                      profile.skills.length > 0 && (
                        <div>
                          <p className="text-xs text-white/40 uppercase tracking-wide mb-2">
                            Skills
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {profile.skills.map((skill: string, i: number) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="border-white/10 text-white/60"
                              >
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    {profile.linkedinUrl && (
                      <a
                        href={profile.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        LinkedIn Profile
                      </a>
                    )}
                    {profile.resumeUrl && (
                      <a
                        href={profile.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Resume
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <p className="text-white/40">Failed to load profile.</p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}
