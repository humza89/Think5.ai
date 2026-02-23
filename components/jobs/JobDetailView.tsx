"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "./JobStatusBadge";
import { PipelineKanban } from "./PipelineKanban";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Briefcase,
  Clock,
  DollarSign,
  Users,
  BarChart3,
  MessageSquare,
  Edit,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Send,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";

interface JobDetailViewProps {
  job: any;
}

const applicationStatusColors: Record<string, string> = {
  APPLIED: "bg-blue-100 text-blue-700",
  SCREENING: "bg-purple-100 text-purple-700",
  INTERVIEWING: "bg-yellow-100 text-yellow-700",
  SHORTLISTED: "bg-cyan-100 text-cyan-700",
  OFFERED: "bg-orange-100 text-orange-700",
  HIRED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-700",
};

const interviewStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
};

export function JobDetailView({ job }: JobDetailViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [pipelineView, setPipelineView] = useState<"board" | "list">("board");
  const [statusLoading, setStatusLoading] = useState(false);

  async function handleStatusChange(newStatus: string) {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success("Status updated successfully");
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update status");
      }
    } catch {
      toast.error("Failed to update status");
    }
    setStatusLoading(false);
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pipeline", label: `Pipeline (${job._count.applications})` },
    { id: "matches", label: `Matches (${job._count.matches})` },
    { id: "interviews", label: `Interviews (${job._count.interviews})` },
  ];

  const statusActions: Record<string, { label: string; icon: any; status: string; variant: any }[]> = {
    DRAFT: [{ label: "Publish", icon: Play, status: "ACTIVE", variant: "default" }],
    ACTIVE: [
      { label: "Pause", icon: Pause, status: "PAUSED", variant: "outline" },
      { label: "Close", icon: XCircle, status: "CLOSED", variant: "outline" },
      { label: "Mark Filled", icon: CheckCircle, status: "FILLED", variant: "default" },
    ],
    PAUSED: [
      { label: "Resume", icon: Play, status: "ACTIVE", variant: "default" },
      { label: "Close", icon: XCircle, status: "CLOSED", variant: "outline" },
    ],
    CLOSED: [{ label: "Reopen", icon: Play, status: "ACTIVE", variant: "outline" }],
    FILLED: [],
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/jobs")}
              className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Jobs
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{job.title}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
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
              <span className="flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                {job.employmentType.replace("_", " ")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Created {new Date(job.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(statusActions[job.status] || []).map((action: any) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.status}
                  variant={action.variant}
                  size="sm"
                  onClick={() => handleStatusChange(action.status)}
                  disabled={statusLoading}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {action.label}
                </Button>
              );
            })}
            <Link href={`/jobs/${job.id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Applications</p>
                  <p className="text-2xl font-bold">{job._count.applications}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Matches</p>
                  <p className="text-2xl font-bold">{job._count.matches}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Interviews</p>
                  <p className="text-2xl font-bold">{job._count.interviews}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Invitations</p>
                  <p className="text-2xl font-bold">{job._count.invitations}</p>
                </div>
                <Send className="h-8 w-8 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {job.description}
                  </div>
                </CardContent>
              </Card>

              {job.jobSkills.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Required Skills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {job.jobSkills.map((skill: any) => (
                        <div
                          key={skill.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-gray-900">{skill.skillName}</span>
                            {skill.skillCategory && (
                              <span className="text-xs text-gray-400">{skill.skillCategory}</span>
                            )}
                          </div>
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
                        <p className="text-sm text-gray-500">Salary Range</p>
                        <p className="font-medium">
                          {job.salaryMin && `$${Number(job.salaryMin).toLocaleString()}`}
                          {job.salaryMin && job.salaryMax && " - "}
                          {job.salaryMax && `$${Number(job.salaryMax).toLocaleString()}`}
                          {" "}{job.salaryCurrency || "USD"}
                        </p>
                      </div>
                    </div>
                  )}
                  {job.department && (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Department</p>
                        <p className="font-medium">{job.department}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Work Arrangement</p>
                      <p className="font-medium">{job.remoteType}</p>
                    </div>
                  </div>
                  {(job.experienceMin || job.experienceMax) && (
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Experience</p>
                        <p className="font-medium">
                          {job.experienceMin && `${job.experienceMin}`}
                          {job.experienceMin && job.experienceMax && " - "}
                          {job.experienceMax && `${job.experienceMax}`} years
                        </p>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Posted By</p>
                    <p className="font-medium">{job.recruiter.name}</p>
                  </div>
                  {job.postedAt && (
                    <div>
                      <p className="text-sm text-gray-500">Published</p>
                      <p className="font-medium">{new Date(job.postedAt).toLocaleDateString()}</p>
                    </div>
                  )}
                  {job.closesAt && (
                    <div>
                      <p className="text-sm text-gray-500">Closes</p>
                      <p className="font-medium">{new Date(job.closesAt).toLocaleDateString()}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "pipeline" && (
          <div className="space-y-4">
            {/* View Toggle */}
            {job.applications.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {job.applications.length} application{job.applications.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setPipelineView("board")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                      pipelineView === "board"
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                    aria-label="Board view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Board
                  </button>
                  <button
                    onClick={() => setPipelineView("list")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 transition-colors ${
                      pipelineView === "list"
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                    List
                  </button>
                </div>
              </div>
            )}

            {/* Board View (Kanban) */}
            {pipelineView === "board" && (
              <PipelineKanban
                jobId={job.id}
                applications={job.applications.map((app: any) => ({
                  id: app.id,
                  status: app.status,
                  appliedAt: app.appliedAt,
                  candidate: {
                    id: app.candidate.id,
                    fullName: app.candidate.fullName,
                    currentTitle: app.candidate.currentTitle || null,
                    currentCompany: app.candidate.currentCompany || null,
                    profileImage: app.candidate.profileImage || null,
                    ariaOverallScore: app.candidate.ariaOverallScore ?? null,
                  },
                }))}
              />
            )}

            {/* List View (Original) */}
            {pipelineView === "list" && (
              <>
                {job.applications.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No applications yet</h3>
                    <p className="text-gray-500">Applications will appear here as candidates apply</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {job.applications.map((app: any) => (
                      <Card key={app.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                              {app.candidate.fullName.charAt(0)}
                            </div>
                            <div>
                              <Link
                                href={`/candidates/${app.candidate.id}`}
                                className="font-medium text-gray-900 hover:text-blue-600"
                              >
                                {app.candidate.fullName}
                              </Link>
                              <p className="text-sm text-gray-500">
                                {app.candidate.currentTitle}
                                {app.candidate.currentCompany && ` at ${app.candidate.currentCompany}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {app.candidate.ariaOverallScore && (
                              <span className="text-sm font-medium text-gray-600">
                                Score: {Math.round(app.candidate.ariaOverallScore)}
                              </span>
                            )}
                            <Badge className={applicationStatusColors[app.status] || "bg-gray-100 text-gray-700"}>
                              {app.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {new Date(app.appliedAt).toLocaleDateString()}
                            </span>
                            <Link href={`/candidates/${app.candidate.id}`}>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </Link>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "matches" && (
          <div className="space-y-4">
            {job.matches.length === 0 ? (
              <Card className="p-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No matches yet</h3>
                <p className="text-gray-500">AI-matched candidates will appear here</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {job.matches.map((match: any) => (
                  <Card key={match.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                          {Math.round(match.fitScore)}%
                        </div>
                        <div>
                          <Link
                            href={`/candidates/${match.candidate.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {match.candidate.fullName}
                          </Link>
                          <p className="text-sm text-gray-500">
                            {match.candidate.currentTitle}
                            {match.candidate.currentCompany && ` at ${match.candidate.currentCompany}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {match.reasoning && (
                          <span className="text-sm text-gray-500 max-w-xs truncate">
                            {match.reasoning}
                          </span>
                        )}
                        <Link href={`/candidates/${match.candidate.id}`}>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "interviews" && (
          <div className="space-y-4">
            {job.interviews.length === 0 ? (
              <Card className="p-12 text-center">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews yet</h3>
                <p className="text-gray-500">Interviews for this job will appear here</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {job.interviews.map((interview: any) => (
                  <Card key={interview.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {interview.candidate.fullName.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/candidates/${interview.candidate.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {interview.candidate.fullName}
                          </Link>
                          <p className="text-sm text-gray-500">
                            {interview.type} interview
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {interview.overallScore && (
                          <span className="text-sm font-medium">
                            Score: {Math.round(interview.overallScore)}
                          </span>
                        )}
                        <Badge className={interviewStatusColors[interview.status] || "bg-gray-100 text-gray-700"}>
                          {interview.status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </span>
                        <Link href={`/interviews/${interview.id}/report`}>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
