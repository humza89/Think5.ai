"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, X, Plus } from "lucide-react";

interface Skill {
  skillName: string;
  skillCategory: string;
  importance: "REQUIRED" | "PREFERRED" | "NICE_TO_HAVE";
  minYears: string;
}

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
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
  });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState<Skill>({
    skillName: "",
    skillCategory: "",
    importance: "REQUIRED",
    minYears: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/jobs/${jobId}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([job, clientsData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setFormData({
        title: job.title || "",
        companyId: job.companyId || "",
        location: job.location || "",
        department: job.department || "",
        industry: job.industry || "",
        employmentType: job.employmentType || "FULL_TIME",
        remoteType: job.remoteType || "ONSITE",
        description: job.description || "",
        salaryMin: job.salaryMin ? String(job.salaryMin) : "",
        salaryMax: job.salaryMax ? String(job.salaryMax) : "",
        salaryCurrency: job.salaryCurrency || "USD",
        experienceMin: job.experienceMin ? String(job.experienceMin) : "",
        experienceMax: job.experienceMax ? String(job.experienceMax) : "",
        urgencyLevel: job.urgencyLevel ? String(job.urgencyLevel) : "3",
        closesAt: job.closesAt ? job.closesAt.split("T")[0] : "",
      });
      setSkills(
        (job.jobSkills || []).map((s: any) => ({
          skillName: s.skillName,
          skillCategory: s.skillCategory || "",
          importance: s.importance,
          minYears: s.minYears ? String(s.minYears) : "",
        }))
      );
      setLoading(false);
    });
  }, [jobId]);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function addSkill() {
    if (!newSkill.skillName.trim()) return;
    setSkills((prev) => [...prev, { ...newSkill }]);
    setNewSkill({ skillName: "", skillCategory: "", importance: "REQUIRED", minYears: "" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, skills }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("Job updated successfully");
      router.push(`/jobs/${jobId}`);
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="max-w-4xl mx-auto px-6 py-8">
          <button
            onClick={() => router.push(`/jobs/${jobId}`)}
            className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Job
          </button>

          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Job</h1>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Job Title</Label>
                  <Input value={formData.title} onChange={(e) => updateField("title", e.target.value)} />
                </div>
                <div>
                  <Label>Company</Label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => updateField("companyId", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a company</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Location</Label>
                    <Input value={formData.location} onChange={(e) => updateField("location", e.target.value)} />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Input value={formData.department} onChange={(e) => updateField("department", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Employment Type</Label>
                    <select
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
                    <Label>Work Arrangement</Label>
                    <select
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  className="min-h-[200px]"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Skill name"
                    value={newSkill.skillName}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, skillName: e.target.value }))}
                    className="flex-1"
                  />
                  <select
                    value={newSkill.importance}
                    onChange={(e) =>
                      setNewSkill((prev) => ({ ...prev, importance: e.target.value as Skill["importance"] }))
                    }
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="REQUIRED">Required</option>
                    <option value="PREFERRED">Preferred</option>
                    <option value="NICE_TO_HAVE">Nice to Have</option>
                  </select>
                  <Button type="button" onClick={addSkill} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill, i) => (
                    <Badge key={i} variant="outline" className="py-1.5 px-3">
                      {skill.skillName}
                      <button onClick={() => setSkills((prev) => prev.filter((_, j) => j !== i))} className="ml-2">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compensation & Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Salary Min</Label>
                    <Input type="number" value={formData.salaryMin} onChange={(e) => updateField("salaryMin", e.target.value)} />
                  </div>
                  <div>
                    <Label>Salary Max</Label>
                    <Input type="number" value={formData.salaryMax} onChange={(e) => updateField("salaryMax", e.target.value)} />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <select
                      value={formData.salaryCurrency}
                      onChange={(e) => updateField("salaryCurrency", e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Experience Min (years)</Label>
                    <Input type="number" value={formData.experienceMin} onChange={(e) => updateField("experienceMin", e.target.value)} />
                  </div>
                  <div>
                    <Label>Experience Max (years)</Label>
                    <Input type="number" value={formData.experienceMax} onChange={(e) => updateField("experienceMax", e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => router.push(`/jobs/${jobId}`)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
    </ProtectedRoute>
  );
}
