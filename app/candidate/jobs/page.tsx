"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

const employmentLabels: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMP_TO_HIRE: "Temp to Hire",
};

const remoteLabels: Record<string, string> = {
  REMOTE: "Remote",
  ONSITE: "On-site",
  HYBRID: "Hybrid",
};

export default function CandidateJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [remoteType, setRemoteType] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchJobs(params: Record<string, string> = {}) {
    setLoading(true);
    try {
      const qp = new URLSearchParams({
        page: params.page || String(pagination.page),
        ...(params.search || search ? { search: params.search || search } : {}),
        ...(params.location || location ? { location: params.location || location } : {}),
        ...(params.remoteType || remoteType ? { remoteType: params.remoteType || remoteType } : {}),
      });
      const res = await fetch(`/api/candidate/jobs?${qp}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchJobs({ page: "1" });
  }

  function formatSalary(min: number | null, max: number | null, currency: string | null) {
    if (!min && !max) return null;
    const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toString());
    const c = currency || "USD";
    if (min && max) return `$${fmt(min)} - $${fmt(max)} ${c}`;
    if (min) return `From $${fmt(min)} ${c}`;
    return `Up to $${fmt(max!)} ${c}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Browse Jobs</h1>
          <p className="text-gray-500 mt-1">Find your next opportunity</p>
        </div>

        {/* Search & Filters */}
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by title, company, keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="relative w-48">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={remoteType}
            onChange={(e) => {
              setRemoteType(e.target.value);
              fetchJobs({ remoteType: e.target.value, page: "1" });
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm w-36"
          >
            <option value="">All types</option>
            <option value="REMOTE">Remote</option>
            <option value="ONSITE">On-site</option>
            <option value="HYBRID">Hybrid</option>
          </select>
          <Button type="submit">
            <Filter className="h-4 w-4 mr-2" />
            Search
          </Button>
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <Card className="p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
            <p className="text-gray-500">
              Try adjusting your search or filters
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-2">
              {pagination.total} job{pagination.total !== 1 ? "s" : ""} found
            </p>
            {jobs.map((job: any) => (
              <Link key={job.id} href={`/candidate/jobs/${job.id}`}>
                <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {job.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3">
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
                          {employmentLabels[job.employmentType] || job.employmentType}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {remoteLabels[job.remoteType] || job.remoteType}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                        {job.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {job.jobSkills?.slice(0, 6).map((s: any, i: number) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              s.importance === "REQUIRED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-gray-50 text-gray-600"
                            }`}
                          >
                            {s.skillName}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ml-6 text-right shrink-0">
                      {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency) && (
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
                        </p>
                      )}
                      {job.postedAt && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                          <Clock className="h-3 w-3" />
                          {new Date(job.postedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages}
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
        )}
      </div>
    </div>
  );
}
