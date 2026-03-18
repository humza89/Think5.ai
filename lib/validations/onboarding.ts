import { z } from "zod";

// LinkedIn URL regex — accepts standard LinkedIn profile URLs
const linkedinUrlRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;

// ============================================
// Step 1: Personal Info
// ============================================
export const personalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(30).optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  linkedinUrl: z
    .string()
    .min(1, "LinkedIn profile URL is required")
    .regex(linkedinUrlRegex, "Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)"),
  jobTitle: z.string().max(200).optional().or(z.literal("")),
  profileImage: z.string().optional().or(z.literal("")),
});

// ============================================
// Step 2: Resume Upload
// ============================================
export const resumeUploadSchema = z.object({
  fileUrl: z.string().min(1, "Resume file URL is required"),
  filename: z.string().min(1, "Filename is required"),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
});

// ============================================
// Step 3: AI Profile Review (user corrections)
// ============================================
export const aiProfileReviewSchema = z.object({
  fullName: z.string().optional(),
  currentTitle: z.string().optional().or(z.literal("")),
  currentCompany: z.string().optional().or(z.literal("")),
  skills: z.array(z.string()).optional(),
  experienceYears: z.number().int().min(0).max(80).optional().nullable(),
  summary: z.string().max(5000).optional().or(z.literal("")),
});

// ============================================
// Step 4: Experience
// ============================================
export const experienceEntrySchema = z.object({
  company: z.string().min(1, "Company name is required").max(200),
  title: z.string().min(1, "Job title is required").max(200),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  isCurrent: z.boolean().optional().default(false),
  description: z.string().max(5000).optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
});

export const experienceStepSchema = z.object({
  experiences: z.array(experienceEntrySchema).default([]),
});

// ============================================
// Step 5: Skills & Education
// ============================================
export const skillEntrySchema = z.object({
  skillName: z.string().min(1, "Skill name is required").max(100),
  category: z.string().max(100).optional().or(z.literal("")),
  proficiency: z.number().int().min(1).max(5).optional().nullable(),
  yearsExp: z.number().min(0).max(80).optional().nullable(),
});

export const educationEntrySchema = z.object({
  institution: z.string().min(1, "Institution is required").max(200),
  degree: z.string().max(200).optional().or(z.literal("")),
  field: z.string().max(200).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
});

export const certificationEntrySchema = z.object({
  name: z.string().min(1, "Certification name is required").max(200),
  issuingOrg: z.string().max(200).optional().or(z.literal("")),
  issueDate: z.string().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  credentialId: z.string().max(200).optional().or(z.literal("")),
});

export const skillsEducationStepSchema = z.object({
  skills: z.array(skillEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  certifications: z.array(certificationEntrySchema).default([]),
});

// ============================================
// Step 6: Preferences
// ============================================
export const preferencesStepSchema = z.object({
  preferredTitles: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  remotePreference: z.enum(["REMOTE", "HYBRID", "ONSITE", "FLEXIBLE"]).default("FLEXIBLE"),
  salaryMin: z.number().int().min(0).optional().nullable(),
  salaryMax: z.number().int().min(0).optional().nullable(),
  salaryCurrency: z.string().max(10).default("USD"),
  availability: z.enum(["IMMEDIATELY", "TWO_WEEKS", "ONE_MONTH", "THREE_MONTHS", "NOT_LOOKING"]).default("IMMEDIATELY"),
  willingToRelocate: z.boolean().default(false),
  noticePeriod: z.string().max(100).optional().or(z.literal("")),
  visaStatus: z.string().max(200).optional().or(z.literal("")),
  preferredIndustries: z.array(z.string()).default([]),
  preferredCompanies: z.array(z.string()).default([]),
  jobTypes: z.array(z.string()).default([]),
});

// ============================================
// Step 7: Review & Submit
// ============================================
export const reviewSubmitSchema = z.object({
  consentGdpr: z.literal(true, {
    message: "You must consent to data processing to proceed",
  }),
  consentDataProcessing: z.literal(true, {
    message: "You must consent to data sharing to proceed",
  }),
});

// ============================================
// Type exports
// ============================================
export type PersonalInfoData = z.infer<typeof personalInfoSchema>;
export type ResumeUploadData = z.infer<typeof resumeUploadSchema>;
export type AIProfileReviewData = z.infer<typeof aiProfileReviewSchema>;
export type ExperienceStepData = z.infer<typeof experienceStepSchema>;
export type SkillsEducationStepData = z.infer<typeof skillsEducationStepSchema>;
export type PreferencesStepData = z.infer<typeof preferencesStepSchema>;
export type ReviewSubmitData = z.infer<typeof reviewSubmitSchema>;
