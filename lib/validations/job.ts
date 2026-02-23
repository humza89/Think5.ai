import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  salary: z.string().optional(),
  type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]).optional(),
  remote: z.boolean().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional(),
  requirements: z.array(z.string()).optional(),
  clientId: z.string().uuid().optional(),
});

export const updateJobSchema = createJobSchema.partial();
