import type { OnboardingStatus } from "@prisma/client";

export interface ApprovalCandidate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  linkedinUrl: string | null;
  location: string | null;
  profileImage: string | null;
  onboardingStatus: OnboardingStatus;
  invitationSource: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    candidateSkills: number;
    candidateExperiences: number;
  };
}

export interface ApprovalActionRecord {
  id: string;
  action: string;
  reason: string | null;
  adminUserId: string;
  adminEmail: string | null;
  createdAt: string;
}

export interface ApprovalCandidateDetail extends ApprovalCandidate {
  skills: Array<{
    id: string;
    skillName: string;
    category: string | null;
    proficiency: number | null;
    yearsExp: number | null;
  }>;
  experiences: Array<{
    id: string;
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
    location: string | null;
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string | null;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuingOrg: string | null;
    issueDate: string | null;
    expiryDate: string | null;
  }>;
  documents: Array<{
    id: string;
    type: string;
    fileUrl: string;
    filename: string;
    mimeType: string | null;
  }>;
  jobPreferences: {
    jobTypes: string[];
    preferredLocations: string[];
    remotePreference: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string;
    availability: string;
    willingToRelocate: boolean;
    noticePeriod: string | null;
    preferredIndustries: string[];
    preferredCompanies: string[];
  } | null;
  approvalHistory: ApprovalActionRecord[];
}

export interface ApprovalsListResponse {
  candidates: ApprovalCandidate[];
  total: number;
  page: number;
  totalPages: number;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    onHold: number;
    all: number;
  };
}

export type ApprovalActionType = "approved" | "rejected" | "on_hold";

export interface ApprovalRecruiter {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  linkedinUrl: string | null;
  profileImage: string | null;
  bio: string | null;
  onboardingStep: number;
  onboardingCompleted: boolean;
  onboardingStatus: string;
  hiringPreferences: any;
  createdAt: string;
}

export interface ApprovalRecruiterDetail extends ApprovalRecruiter {
  company: {
    id: string;
    name: string;
    industry: string | null;
    companySize: string | null;
    website: string | null;
    description: string | null;
  } | null;
}

export interface RecruiterApprovalsListResponse {
  recruiters: ApprovalRecruiter[];
  total: number;
  page: number;
  totalPages: number;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    all: number;
  };
}
