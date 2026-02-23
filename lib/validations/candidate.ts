import { z } from "zod";

// Whitelist allowed fields for PATCH - prevents mass assignment
export const updateCandidateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  currentTitle: z.string().max(200).optional(),
  currentCompany: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  skills: z.array(z.string()).optional(),
  bio: z.string().max(5000).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
  yearsOfExperience: z.number().int().min(0).max(80).optional(),
  desiredSalary: z.string().max(100).optional(),
  availability: z.string().max(100).optional(),
  willingToRelocate: z.boolean().optional(),
  notes: z.string().max(10000).optional(),
}).strict();
