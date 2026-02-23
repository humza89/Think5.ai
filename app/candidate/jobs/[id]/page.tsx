"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Briefcase,
  DollarSign,
  Clock,
  Globe,
  Users,
  Loader2,
  CheckCircle,
} from "lucide-react";

const employmentLabels: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMP_TO_HIRE: "Temp to Hire",
};

export default function CandidateJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/candidate/jobs/${jobId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setJob(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load job");
        setLoading(false);
      });
  }, [jobId]);

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch(`/api/candidate/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to apply");
      } else {
        setApplied(true);
      }
    } catch {
      setError("Failed to apply");
    }
    setApplying(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Job Not Found</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <Button onClick={() => router.push("/candidate/jobs")}>Browse Jobs</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/candidate/jobs")}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Jobs
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="pt-6">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">{job.title}</h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {job.company.name}
                  </span>
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </span>
                  )}
                  <Badge variant="outline">
                    {employmentLabels[job.employmentType] || job.employmentType}
                  </Badge>
                  <Badge variant="outline">{job.remoteType}</Badge>
                </div>

                {/* Apply button */}
                {applied ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg mb-6">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 font-medium">Application submitted!</span>
                  </div>
                ) : (
                  <div className="mb-6">
                    {error && (
                      <p className="text-sm text-red-600 mb-2">{error}</p>
                    )}
                    <Button
                      onClick={handleApply}
                      disabled={applying}
                      className="w-full sm:w-auto"
                    >
                      {applying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Apply Now
                    </Button>
                  </div>
                )}

                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                  {job.description}
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            {job.jobSkills?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Required Skills</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {job.jobSkills.map((skill: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="font-medium text-gray-900">{skill.skillName}</span>
                        <div className="flex items-center gap-2">
                          {skill.minYears && (
                            <span className="text-xs text-gray-500">{skill.minYears}+ years</span>
                          )}
                          <Badge
                            className={
                              skill.importance === "REQUIRED"
                                ? "bg-blue-100 text-blue-700"
                                : skill.importance === "PREFERRED"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                            }
                          >
                            {skill.importance.toLowerCase().replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(job.salaryMin || job.salaryMax) && (
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Salary</p>
                      <p className="font-medium">
                        {job.salaryMin && `$${Number(job.salaryMin).toLocaleString()}`}
                        {job.salaryMin && job.salaryMax && " - "}
                        {job.salaryMax && `$${Number(job.salaryMax).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                )}
                {(job.experienceMin || job.experienceMax) && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Experience</p>
                      <p className="font-medium">
                        {job.experienceMin || 0} - {job.experienceMax || "10+"} years
                      </p>
                    </div>
                  </div>
                )}
                {job.department && (
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Department</p>
                      <p className="font-medium">{job.department}</p>
                    </div>
                  </div>
                )}
                {job.postedAt && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Posted</p>
                      <p className="font-medium">{new Date(job.postedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About {job.company.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.company.industry && (
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">Industry: </span>
                    {job.company.industry}
                  </p>
                )}
                {job.company.companySize && (
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">Size: </span>
                    {job.company.companySize}
                  </p>
                )}
                {job.company.headquarters && (
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">HQ: </span>
                    {job.company.headquarters}
                  </p>
                )}
                {job.company.description && (
                  <p className="text-sm text-gray-600 line-clamp-4">
                    {job.company.description}
                  </p>
                )}
                {job.company.website && (
                  <a
                    href={job.company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Globe className="h-3 w-3" />
                    Company Website
                  </a>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
