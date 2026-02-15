"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  Search,
  Linkedin,
  Bookmark,
  FolderKanban,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Plus,
  X
} from "lucide-react";

interface Experience {
  title: string;
  company: string;
  companyLogoCdnUrl?: string;
  startDate: string;
  endDate: string;
}

interface Education {
  school: string;
  schoolLogoCdnUrl?: string;
  degree: string;
  field: string;
  startYear: number;
  endYear: number;
}

interface Candidate {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  currentTitle?: string;
  currentCompany?: string;
  profileImage?: string;
  profilePhotoCdnUrl?: string;
  status: string;
  experienceYears?: number;
  skills: string[];
  experiences?: Experience[];
  education?: Education[];
  location?: string;
  industries?: string[];
  createdAt: string;
}

interface FilterState {
  titles: string[];
  companies: string[];
  schools: string[];
  locations: string[];
  industries: string[];
  degrees: string[];
  excludeTitles: string[];
  excludeCompanies: string[];
  excludeDegrees: string[];
  minYearsExperience?: number;
  maxYearsExperience?: number;
  graduationYearFrom?: number;
  graduationYearTo?: number;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Search states for filter dropdowns
  const [titleSearch, setTitleSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");

  // State for tracking expanded experiences/education
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());

  // Filter states
  const [filters, setFilters] = useState<FilterState>({
    titles: [],
    companies: [],
    schools: [],
    locations: [],
    industries: [],
    degrees: [],
    excludeTitles: [],
    excludeCompanies: [],
    excludeDegrees: [],
  });

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Extract unique values for dropdowns
  const [availableTitles, setAvailableTitles] = useState<Array<{ name: string; count: number }>>([]);
  const [availableCompanies, setAvailableCompanies] = useState<Array<{ name: string; logo?: string; count: number }>>([]);
  const [availableSchools, setAvailableSchools] = useState<Array<{ name: string; logo?: string; count: number }>>([]);
  const [availableLocations, setAvailableLocations] = useState<Array<{ name: string; count: number }>>([]);
  const [availableIndustries, setAvailableIndustries] = useState<Array<{ name: string; count: number }>>([]);
  const [availableDegrees, setAvailableDegrees] = useState<Array<{ name: string; count: number }>>([]);

  useEffect(() => {
    fetchCandidates();
  }, []);

  useEffect(() => {
    extractFilterOptions();
  }, [candidates]);

  useEffect(() => {
    filterCandidates();
  }, [candidates, searchQuery, filters]);

  async function fetchCandidates() {
    try {
      const response = await fetch("/api/candidates");
      if (response.ok) {
        const data = await response.json();
        setCandidates(data);
        setTotal(data.length);
      }
    } catch (error) {
      console.error("Error fetching candidates:", error);
    }
  }

  function extractFilterOptions() {
    const titlesCount = new Map<string, number>();
    const companiesMap = new Map<string, { logo?: string; count: number }>();
    const schoolsMap = new Map<string, { logo?: string; count: number }>();
    const locationsCount = new Map<string, number>();
    const industriesCount = new Map<string, number>();
    const degreesCount = new Map<string, number>();

    candidates.forEach(c => {
      if (c.currentTitle) {
        titlesCount.set(c.currentTitle, (titlesCount.get(c.currentTitle) || 0) + 1);
      }
      if (c.currentCompany) {
        if (!companiesMap.has(c.currentCompany)) {
          companiesMap.set(c.currentCompany, { count: 1 });
        } else {
          const existing = companiesMap.get(c.currentCompany)!;
          companiesMap.set(c.currentCompany, { ...existing, count: existing.count + 1 });
        }
      }
      if (c.location) {
        locationsCount.set(c.location, (locationsCount.get(c.location) || 0) + 1);
      }

      c.experiences?.forEach(exp => {
        if (exp.title) {
          titlesCount.set(exp.title, (titlesCount.get(exp.title) || 0) + 1);
        }
        if (exp.company) {
          if (!companiesMap.has(exp.company)) {
            companiesMap.set(exp.company, { logo: exp.companyLogoCdnUrl, count: 1 });
          } else {
            const existing = companiesMap.get(exp.company)!;
            companiesMap.set(exp.company, {
              logo: exp.companyLogoCdnUrl || existing.logo,
              count: existing.count + 1
            });
          }
        }
      });

      c.education?.forEach(edu => {
        if (edu.school) {
          if (!schoolsMap.has(edu.school)) {
            schoolsMap.set(edu.school, { logo: edu.schoolLogoCdnUrl, count: 1 });
          } else {
            const existing = schoolsMap.get(edu.school)!;
            schoolsMap.set(edu.school, {
              logo: edu.schoolLogoCdnUrl || existing.logo,
              count: existing.count + 1
            });
          }
        }
        if (edu.degree) {
          degreesCount.set(edu.degree, (degreesCount.get(edu.degree) || 0) + 1);
        }
      });

      c.industries?.forEach(ind => {
        industriesCount.set(ind, (industriesCount.get(ind) || 0) + 1);
      });
    });

    setAvailableTitles(
      Array.from(titlesCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
    setAvailableCompanies(
      Array.from(companiesMap.entries())
        .map(([name, { logo, count }]) => ({ name, logo, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
    setAvailableSchools(
      Array.from(schoolsMap.entries())
        .map(([name, { logo, count }]) => ({ name, logo, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
    setAvailableLocations(
      Array.from(locationsCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
    setAvailableIndustries(
      Array.from(industriesCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
    setAvailableDegrees(
      Array.from(degreesCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count) // Sort by count descending
    );
  }

  function filterCandidates() {
    let filtered = candidates;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.currentTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.currentCompany?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Title filter
    if (filters.titles.length > 0) {
      filtered = filtered.filter(c => 
        filters.titles.includes(c.currentTitle || '') ||
        c.experiences?.some(exp => filters.titles.includes(exp.title))
      );
    }

    // Company filter
    if (filters.companies.length > 0) {
      filtered = filtered.filter(c =>
        filters.companies.includes(c.currentCompany || '') ||
        c.experiences?.some(exp => filters.companies.includes(exp.company))
      );
    }

    // School filter
    if (filters.schools.length > 0) {
      filtered = filtered.filter(c =>
        c.education?.some(edu => filters.schools.includes(edu.school))
      );
    }

    // Location filter
    if (filters.locations.length > 0) {
      filtered = filtered.filter(c =>
        filters.locations.includes(c.location || '')
      );
    }

    // Industry filter
    if (filters.industries.length > 0) {
      filtered = filtered.filter(c =>
        c.industries?.some(ind => filters.industries.includes(ind))
      );
    }

    // Degree filter
    if (filters.degrees.length > 0) {
      filtered = filtered.filter(c =>
        c.education?.some(edu => filters.degrees.includes(edu.degree))
      );
    }

    // Exclude filters
    if (filters.excludeTitles.length > 0) {
      filtered = filtered.filter(c =>
        !filters.excludeTitles.includes(c.currentTitle || '') &&
        !c.experiences?.some(exp => filters.excludeTitles.includes(exp.title))
      );
    }

    if (filters.excludeCompanies.length > 0) {
      filtered = filtered.filter(c =>
        !filters.excludeCompanies.includes(c.currentCompany || '') &&
        !c.experiences?.some(exp => filters.excludeCompanies.includes(exp.company))
      );
    }

    // Years of experience filter
    if (filters.minYearsExperience !== undefined) {
      filtered = filtered.filter(c => 
        (c.experienceYears || 0) >= filters.minYearsExperience!
      );
    }

    if (filters.maxYearsExperience !== undefined) {
      filtered = filtered.filter(c =>
        (c.experienceYears || 0) <= filters.maxYearsExperience!
      );
    }

    setFilteredCandidates(filtered);
    setTotal(filtered.length);
  }

  function toggleFilter(filterType: keyof FilterState, value: string) {
    setFilters(prev => {
      const currentValues = prev[filterType] as string[];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      return { ...prev, [filterType]: newValues };
    });
  }

  function removeFilter(filterType: keyof FilterState, value: string) {
    setFilters(prev => {
      const currentValues = prev[filterType] as string[];
      return { ...prev, [filterType]: currentValues.filter(v => v !== value) };
    });
  }

  function clearAllFilters() {
    setFilters({
      titles: [],
      companies: [],
      schools: [],
      locations: [],
      industries: [],
      degrees: [],
      excludeTitles: [],
      excludeCompanies: [],
      excludeDegrees: [],
    });
  }

  function toggleExpanded(candidateId: string) {
    setExpandedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(candidateId)) {
        newSet.delete(candidateId);
      } else {
        newSet.add(candidateId);
      }
      return newSet;
    });
  }

  function handleSave(candidateId: string) {
    // TODO: Implement save to list functionality
    console.log("Save candidate:", candidateId);
    alert("Save functionality - Coming soon!");
  }

  function handleAddToProject(candidateId: string) {
    // TODO: Implement add to project functionality
    console.log("Add to project:", candidateId);
    alert("Add to Project functionality - Coming soon!");
  }

  function handleHide(candidateId: string) {
    // TODO: Implement hide candidate functionality
    console.log("Hide candidate:", candidateId);
    alert("Hide functionality - Coming soon!");
  }

  async function handleUpload() {
    if (!uploadFile && !linkedinUrl) {
      setUploadError("Please upload a resume or provide a LinkedIn URL");
      return;
    }

    setIsLoading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      if (uploadFile) {
        formData.append("file", uploadFile);
      }
      if (linkedinUrl) {
        formData.append("linkedinUrl", linkedinUrl);
      }

      const parseResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        throw new Error("Failed to parse resume");
      }

      const parsedData = await parseResponse.json();

      const createResponse = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData),
      });

      if (!createResponse.ok) {
        throw new Error("Failed to create candidate");
      }

      await fetchCandidates();
      setUploadFile(null);
      setLinkedinUrl("");
      setIsUploadOpen(false);
    } catch (error: any) {
      setUploadError(error.message || "Failed to upload candidate");
    } finally {
      setIsLoading(false);
    }
  }

  const startIndex = (currentPage - 1) * perPage + 1;
  const endIndex = Math.min(currentPage * perPage, total);

  // Get all active filters
  const activeFilters = [
    ...filters.titles.map(v => ({ type: 'titles' as keyof FilterState, value: v, label: v })),
    ...filters.companies.map(v => ({ type: 'companies' as keyof FilterState, value: v, label: v })),
    ...filters.schools.map(v => ({ type: 'schools' as keyof FilterState, value: v, label: v })),
    ...filters.locations.map(v => ({ type: 'locations' as keyof FilterState, value: v, label: v })),
    ...filters.industries.map(v => ({ type: 'industries' as keyof FilterState, value: v, label: v })),
    ...filters.degrees.map(v => ({ type: 'degrees' as keyof FilterState, value: v, label: v })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-2xl font-bold">
                Paraform
              </Link>
              <nav className="flex space-x-6">
                <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                  Dashboard
                </Link>
                <Link href="/candidates" className="text-blue-600 font-medium border-b-2 border-blue-600 pb-4">
                  Candidates
                </Link>
                <Link href="/clients" className="text-gray-600 hover:text-gray-900">
                  Clients
                </Link>
              </nav>
            </div>
            <Button onClick={() => setIsUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Add Candidate
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* Title */}
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Paraform Sourcing</h1>
          <p className="text-sm text-gray-600 mt-1">
            Source and submit candidates from our sourcing tool all within Paraform.{" "}
            <Link href="#" className="text-blue-600 hover:underline">Learn more</Link>
          </p>
        </div>

        {/* Filter Bar */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-gray-300 hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" />
            Suggested filters
          </Button>

          {/* Titles Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Titles <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Titles</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
                <Input
                  placeholder="Search a title..."
                  value={titleSearch}
                  onChange={(e) => setTitleSearch(e.target.value)}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableTitles
                  .filter(title => title.name.toLowerCase().includes(titleSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(title => (
                    <div
                      key={title.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleFilter('titles', title.name)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.titles.includes(title.name)}
                        onChange={() => {}}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm">{title.name}</span>
                      <span className="text-sm text-gray-500">{title.count.toLocaleString()}</span>
                    </div>
                  ))}
                {availableTitles.filter(title => title.name.toLowerCase().includes(titleSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No titles found</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Companies Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Companies <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Companies</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
                <Input
                  placeholder="Search a company..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableCompanies
                  .filter(company => company.name.toLowerCase().includes(companySearch.toLowerCase()))
                  .slice(0, 50)
                  .map(company => (
                    <div
                      key={company.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleFilter('companies', company.name)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.companies.includes(company.name)}
                        onChange={() => {}}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm truncate">{company.name}</span>
                      <span className="text-sm text-gray-500 mr-2">{company.count.toLocaleString()}</span>
                      <div className="w-7 h-7 bg-white border border-gray-200 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {company.logo ? (
                          <img
                            src={company.logo}
                            alt={company.name}
                            className="w-full h-full object-contain p-0.5"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-3 h-3 bg-gray-300 rounded"></div>
                        )}
                      </div>
                    </div>
                  ))}
                {availableCompanies.filter(company => company.name.toLowerCase().includes(companySearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No companies found</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Schools Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Schools <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Schools</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
                <Input
                  placeholder="Search a school..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableSchools
                  .filter(school => school.name.toLowerCase().includes(schoolSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(school => (
                    <div
                      key={school.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleFilter('schools', school.name)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.schools.includes(school.name)}
                        onChange={() => {}}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm truncate">{school.name}</span>
                      <span className="text-sm text-gray-500 mr-2">{school.count.toLocaleString()}</span>
                      <div className="w-7 h-7 bg-white border border-gray-200 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {school.logo ? (
                          <img
                            src={school.logo}
                            alt={school.name}
                            className="w-full h-full object-contain p-0.5"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-3 h-3 bg-gray-300 rounded"></div>
                        )}
                      </div>
                    </div>
                  ))}
                {availableSchools.filter(school => school.name.toLowerCase().includes(schoolSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No schools found</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Locations Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Locations <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Locations</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
                <Input
                  placeholder="Search a location..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableLocations
                  .filter(location => location.name.toLowerCase().includes(locationSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(location => (
                    <div
                      key={location.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleFilter('locations', location.name)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.locations.includes(location.name)}
                        onChange={() => {}}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm">{location.name}</span>
                      <span className="text-sm text-gray-500">{location.count.toLocaleString()}</span>
                    </div>
                  ))}
                {availableLocations.filter(location => location.name.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No locations found</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-xs w-48 border-gray-300"
              size={1}
            />
          </div>

          {/* Industry Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Industry <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Industry</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableIndustries.slice(0, 50).map(industry => (
                  <div
                    key={industry.name}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleFilter('industries', industry.name)}
                  >
                    <input
                      type="checkbox"
                      checked={filters.industries.includes(industry.name)}
                      onChange={() => {}}
                      className="rounded border-gray-300"
                    />
                    <span className="flex-1 text-sm">{industry.name}</span>
                    <span className="text-sm text-gray-500">{industry.count.toLocaleString()}</span>
                  </div>
                ))}
                {availableIndustries.length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No industries available</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Degrees Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                Degrees <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-3 py-2 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Degrees</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button className="hover:text-gray-700">Presets</button>
                    <span>|</span>
                    <button className="hover:text-gray-700">All time ▾</button>
                  </div>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {availableDegrees.slice(0, 50).map(degree => (
                  <div
                    key={degree.name}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleFilter('degrees', degree.name)}
                  >
                    <input
                      type="checkbox"
                      checked={filters.degrees.includes(degree.name)}
                      onChange={() => {}}
                      className="rounded border-gray-300"
                    />
                    <span className="flex-1 text-sm">{degree.name}</span>
                    <span className="text-sm text-gray-500">{degree.count.toLocaleString()}</span>
                  </div>
                ))}
                {availableDegrees.length === 0 && (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">No degrees available</div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More Filters */}
          <DropdownMenu open={showMoreFilters} onOpenChange={setShowMoreFilters}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-gray-300 hover:bg-gray-50">
                More filters <Plus className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Additional Filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-xs text-gray-500">
                Select filter categories above to refine your search
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            {activeFilters.map((filter, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="h-6 gap-1 px-2.5 text-xs font-normal bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              >
                {filter.label}
                <button
                  onClick={() => removeFilter(filter.type, filter.value)}
                  className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-gray-600 hover:text-gray-900" onClick={clearAllFilters}>
                Clear all
              </Button>
            )}
          </div>
        )}

        {/* Candidates Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Table Header */}
          <div className="border-b border-gray-200 bg-white px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-900">
                  All Profiles ({total.toLocaleString()})
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-600 hover:text-gray-900">
                      Saved searches <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuLabel>Your Saved Searches</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="p-2 text-xs text-gray-500 text-center">
                      No saved searches yet
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>{startIndex}-{endIndex} of {total.toLocaleString()}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={endIndex >= total}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Table Column Headers */}
          <div className="grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-gray-200 bg-gray-50/50 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <div className="col-span-3">Name</div>
            <div className="col-span-4">Experiences</div>
            <div className="col-span-3">Schools</div>
            <div className="col-span-2"></div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-gray-100">
            {filteredCandidates.slice(startIndex - 1, endIndex).map((candidate) => {
              const avatarUrl = candidate.profilePhotoCdnUrl || candidate.profileImage;
              const experiences = candidate.experiences || [];
              const education = candidate.education || [];

              return (
                <div key={candidate.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  {/* Name Column */}
                  <div className="col-span-3 flex items-start gap-3">
                    <input type="checkbox" className="mt-1 rounded border-gray-300" />
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0 overflow-hidden">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={candidate.fullName}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.nextElementSibling) {
                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-semibold text-lg"
                        style={{ display: avatarUrl ? 'none' : 'flex' }}
                      >
                        {candidate.fullName.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/candidates/${candidate.id}`}
                          className="font-medium text-sm text-gray-900 hover:text-blue-600 transition-colors"
                        >
                          {candidate.fullName}
                        </Link>
                        {candidate.linkedinUrl && (
                          <a
                            href={candidate.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:opacity-70 transition-opacity"
                            title="View LinkedIn Profile"
                          >
                            <svg className="h-3 w-3 fill-blue-600" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 truncate mt-0.5">
                        {candidate.currentTitle || "No title"}
                      </p>
                      {candidate.location && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{candidate.location}</p>
                      )}
                    </div>
                  </div>

                  {/* Experiences Column */}
                  <div className="col-span-4 space-y-1.5">
                    {(expandedCandidates.has(candidate.id) ? experiences : experiences.slice(0, 3)).map((exp, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 bg-white border border-gray-200 rounded flex-shrink-0 overflow-hidden">
                          {exp.companyLogoCdnUrl ? (
                            <img
                              src={exp.companyLogoCdnUrl}
                              alt={exp.company}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                if (target.nextElementSibling) {
                                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full flex items-center justify-center bg-purple-100"
                            style={{ display: exp.companyLogoCdnUrl ? 'none' : 'flex' }}
                          >
                            <div className="w-3 h-3 bg-purple-500 rounded"></div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{exp.title}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {exp.company} • {exp.startDate} - {exp.endDate}
                          </p>
                        </div>
                      </div>
                    ))}
                    {experiences.length === 0 && candidate.currentCompany && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 bg-gray-100 rounded flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {candidate.currentTitle || "Position"}
                          </p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {candidate.currentCompany} • Present
                          </p>
                        </div>
                      </div>
                    )}
                    {experiences.length > 3 && (
                      <button
                        onClick={() => toggleExpanded(candidate.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                      >
                        {expandedCandidates.has(candidate.id) ? 'Show less' : `Show all (${experiences.length})`}
                      </button>
                    )}
                  </div>

                  {/* Schools Column */}
                  <div className="col-span-3 space-y-1.5">
                    {(expandedCandidates.has(candidate.id) ? education : education.slice(0, 2)).map((edu, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 bg-white border border-gray-200 rounded flex-shrink-0 overflow-hidden">
                          {edu.schoolLogoCdnUrl ? (
                            <img
                              src={edu.schoolLogoCdnUrl}
                              alt={edu.school}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                if (target.nextElementSibling) {
                                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full flex items-center justify-center bg-blue-100"
                            style={{ display: edu.schoolLogoCdnUrl ? 'none' : 'flex' }}
                          >
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{edu.school}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {edu.degree}, {edu.field} • {edu.startYear} - {edu.endYear}
                          </p>
                        </div>
                      </div>
                    ))}
                    {education.length > 2 && (
                      <button
                        onClick={() => toggleExpanded(candidate.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                      >
                        {expandedCandidates.has(candidate.id) ? 'Show less' : `Show all (${education.length})`}
                      </button>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 justify-start text-xs font-normal border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      onClick={() => handleSave(candidate.id)}
                    >
                      <Bookmark className="h-3.5 w-3.5 mr-1.5" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 justify-start text-xs font-normal border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      onClick={() => handleAddToProject(candidate.id)}
                    >
                      <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
                      Project
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 justify-start text-xs font-normal border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      onClick={() => handleHide(candidate.id)}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                      Hide
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCandidates.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No candidates found</p>
              <Button onClick={() => setIsUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Add Your First Candidate
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Candidate</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="linkedin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="linkedin">LinkedIn URL</TabsTrigger>
              <TabsTrigger value="resume">Upload Resume</TabsTrigger>
            </TabsList>
            <TabsContent value="linkedin" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    LinkedIn Profile URL
                  </label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="https://www.linkedin.com/in/username"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="resume" className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700">
                    Click to upload
                  </span>
                  <span className="text-gray-600"> or drag and drop</span>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </label>
                {uploadFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {uploadFile.name}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  PDF or DOCX up to 10MB
                </p>
              </div>
            </TabsContent>
          </Tabs>
          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isLoading}>
              {isLoading ? "Processing..." : "Add Candidate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
