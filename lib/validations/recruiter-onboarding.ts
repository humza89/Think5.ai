import { z } from "zod";

// ============================================
// Step 1: Personal Info
// ============================================
export const personalInfoSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  title: z.string().max(200).optional().or(z.literal("")),
  department: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  profileImage: z.string().url().optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
});

// ============================================
// Step 2: Company Setup
// ============================================
export const companyCreateSchema = z.object({
  mode: z.literal("create"),
  name: z.string().min(1, "Company name is required").max(200),
  industry: z.string().max(200).optional().or(z.literal("")),
  companySize: z.string().max(100).optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  domain: z.string().max(200).optional().or(z.literal("")),
  brandColor: z.string().max(20).optional().or(z.literal("")),
  tagline: z.string().max(500).optional().or(z.literal("")),
  regions: z.array(z.string()).optional().default([]),
  headquarters: z.string().max(200).optional().or(z.literal("")),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  employeeCount: z.number().int().min(0).optional().nullable(),
});

export const companyJoinSchema = z.object({
  mode: z.literal("join"),
  companyId: z.string().min(1, "Company selection is required"),
});

export const companySetupSchema = z.discriminatedUnion("mode", [
  companyCreateSchema,
  companyJoinSchema,
]);

// ============================================
// Step 3: Team Configuration
// ============================================
export const teamInvitationEntrySchema = z.object({
  email: z.string().email("Must be a valid email"),
  name: z.string().max(200).optional().or(z.literal("")),
  role: z.enum(["recruiter", "hiring_manager"]).default("recruiter"),
  department: z.string().max(200).optional().or(z.literal("")),
});

export const teamConfigSchema = z.object({
  invitations: z.array(teamInvitationEntrySchema).max(20, "Maximum 20 invitations").default([]),
  skip: z.boolean().optional().default(false),
});

// ============================================
// Step 4: Hiring Preferences
// ============================================
export const hiringPreferencesSchema = z.object({
  defaultTemplateId: z.string().optional().or(z.literal("")),
  evaluationCriteria: z.array(z.string().max(200)).max(20).default([]),
  preferredAttributes: z.array(z.string().max(200)).max(20).default([]),
});

// ============================================
// Step 5: Review & Submit
// ============================================
export const reviewSubmitSchema = z.object({
  acknowledged: z.literal(true, {
    message: "You must confirm the information is accurate",
  }),
});

// ============================================
// Type exports
// ============================================
export type PersonalInfoData = z.infer<typeof personalInfoSchema>;
export type CompanySetupData = z.infer<typeof companySetupSchema>;
export type TeamConfigData = z.infer<typeof teamConfigSchema>;
export type HiringPreferencesData = z.infer<typeof hiringPreferencesSchema>;
export type ReviewSubmitData = z.infer<typeof reviewSubmitSchema>;
