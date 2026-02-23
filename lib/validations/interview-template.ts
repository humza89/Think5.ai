import { z } from "zod";

export const createInterviewTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: z.string().min(1).max(100),
  systemPrompt: z.string().min(1, "System prompt is required").max(50000),
  questions: z.array(z.string().min(1).max(2000)).optional(),
  duration: z.number().int().min(5).max(120).optional(),
  scoringCriteria: z.record(z.string(), z.any()).optional(),
});
