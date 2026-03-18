export interface RecruiterPersonalInfo {
  name: string;
  title: string;
  department: string;
  phone: string;
  linkedinUrl: string;
  profileImage: string;
  bio: string;
}

export interface CompanySetupData {
  mode: "create" | "join" | null;
  companyId?: string;
  name?: string;
  industry?: string;
  companySize?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  linkedinUrl?: string;
  domain?: string;
  brandColor?: string;
  tagline?: string;
  regions?: string[];
  headquarters?: string;
  foundedYear?: number;
  employeeCount?: number;
}

export interface TeamInvitationEntry {
  email: string;
  name: string;
  role: string;
  department: string;
}

export interface HiringPreferencesData {
  defaultTemplateId?: string;
  evaluationCriteria: string[];
  preferredAttributes: string[];
}

export interface RecruiterOnboardingData {
  personalInfo: RecruiterPersonalInfo;
  company: CompanySetupData;
  teamInvitations: TeamInvitationEntry[];
  hiringPreferences: HiringPreferencesData;
  acknowledged: boolean;
}

export interface RecruiterOnboardingResponse {
  step: number;
  completed: boolean;
  status: string;
  recruiter: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    title: string | null;
    department: string | null;
    linkedinUrl: string | null;
    profileImage: string | null;
    bio: string | null;
    hiringPreferences: HiringPreferencesData | null;
  };
  company: {
    id: string;
    name: string;
    industry: string | null;
    companySize: string | null;
    website: string | null;
    description: string | null;
    logoUrl: string | null;
    domain: string | null;
    brandColor: string | null;
    tagline: string | null;
    regions: string[];
    headquarters: string | null;
  } | null;
  teamInvitations: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    createdAt: string;
  }>;
}
