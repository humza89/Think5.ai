"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "./JobStatusBadge";
import {
  MapPin,
  Clock,
  Users,
  Search,
  Plus,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  location: string | null;
  status: string;
  employmentType: string;
  remoteType: string;
  department: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  createdAt: string;
  postedAt: string | null;
  company: { id: string; name: string; logoUrl: string | null };
  recruiter: { id: string; name: string };
  _count: { applications: number; matches: number; interviews: number };
  jobSkills: { id: string; skillName: string; importance: string }[];
}

interface JobListTableProps {
  initialJobs: Job[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const employmentTypeLabels: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMP_TO_HIRE: "Temp to Hire",
};

const remoteTypeLabels: Record<string, string> = {
  REMOTE: "Remote",
  ONSITE: "On-site",
  HYBRID: "Hybrid",
};

export function JobListTable({ initialJobs, initialPagination }: JobListTableProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [pagination, setPagination] = useState(initialPagination);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchJobs(params: Record<string, string> = {}) {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page || String(pagination.page),
        limit: String(pagination.limit),
        ...(params.search || search ? { search: params.search || search } : {}),
        ...(params.status || statusFilter ? { status: params.status || statusFilter } : {}),
      });

      const res = await fetch(`/api/jobs?${queryParams}`);
      const data = await res.json();
      setJobs(data.jobs);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchJobs({ page: "1" });
  }

  function handleStatusFilter(status: string) {
    setStatusFilter(status);
    fetchJobs({ status, page: "1" });
  }

  function formatSalary(min: number | null, max: number | null, currency: string | null) {
    if (!min && !max) return null;
    const fmt = (n: number) => {
      if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
      return n.toString();
    };
    const c = currency || "USD";
    if (min && max) return `$${fmt(min)} - $${fmt(max)} ${c}`;
    if (min) return `From $${fmt(min)} ${c}`;
    return `Up to $${fmt(max!)} ${c}`;
  }

  const statusTabs = [
    { value: "", label: "All" },
    { value: "ACTIVE", label: "Active" },
    { value: "DRAFT", label: "Draft" },
    { value: "PAUSED", label: "Paused" },
    { value: "CLOSED", label: "Closed" },
    { value: "FILLED", label: "Filled" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total} job{pagination.total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link href="/jobs/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Job
          </Button>
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleStatusFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.value
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search jobs by title, location, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>

      {/* Job List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : jobs.length === 0 ? (
          <Card className="p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
            <p className="text-gray-500 mb-4">
              {search || statusFilter
                ? "Try adjusting your filters"
                : "Create your first job posting to get started"}
            </p>
            {!search && !statusFilter && (
              <Link href="/jobs/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Job
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {job.title}
                      </h3>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {job.company.name}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {employmentTypeLabels[job.employmentType] || job.employmentType}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                        {remoteTypeLabels[job.remoteType] || job.remoteType}
                      </span>
                    </div>
                    {job.jobSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {job.jobSkills.slice(0, 5).map((skill) => (
                          <span
                            key={skill.id}
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              skill.importance === "REQUIRED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-gray-50 text-gray-600"
                            }`}
                          >
                            {skill.skillName}
                          </span>
                        ))}
                        {job.jobSkills.length > 5 && (
                          <span className="text-xs text-gray-400">
                            +{job.jobSkills.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency) && (
                        <span>{formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 ml-6 text-center">
                    <div>
                      <div className="text-xl font-bold text-gray-900">{job._count.applications}</div>
                      <div className="text-xs text-gray-500">Applications</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-gray-900">{job._count.matches}</div>
                      <div className="text-xs text-gray-500">Matches</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-gray-900">{job._count.interviews}</div>
                      <div className="text-xs text-gray-500">Interviews</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} jobs
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchJobs({ page: String(pagination.page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchJobs({ page: String(pagination.page + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
