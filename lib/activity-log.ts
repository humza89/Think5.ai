import { prisma } from "@/lib/prisma";

interface LogActivityParams {
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({ data: params });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
