/**
 * Template Snapshot
 *
 * Captures an immutable snapshot of an interview template and its skill modules
 * at interview creation time for audit trail and reproducibility.
 */

import { prisma } from "@/lib/prisma";
import { computeJsonHash } from "@/lib/versioning";

export interface TemplateSnapshot {
  id: string;
  name: string;
  roleType: string | null;
  durationMinutes: number;
  questions: unknown;
  aiConfig: unknown;
  candidateReportPolicy: unknown;
  skillModules: Array<{
    order: number;
    module: {
      id: string;
      name: string;
      category: string;
      duration: number;
      rubric: unknown;
      prompts: unknown;
      difficulty: string;
    };
  }>;
  capturedAt: string;
}

/**
 * Capture a frozen snapshot of a template and its modules.
 * Returns the snapshot object and its SHA-256 hash.
 */
export async function captureTemplateSnapshot(
  templateId: string
): Promise<{ snapshot: TemplateSnapshot; hash: string }> {
  const template = await prisma.interviewTemplate.findUnique({
    where: { id: templateId },
    include: {
      skillModules: {
        include: { module: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const snapshot: TemplateSnapshot = {
    id: template.id,
    name: template.name,
    roleType: template.roleType,
    durationMinutes: template.durationMinutes,
    questions: template.questions,
    aiConfig: template.aiConfig,
    candidateReportPolicy: template.candidateReportPolicy,
    skillModules: template.skillModules.map((tm: any) => ({
      order: tm.order,
      module: {
        id: tm.module.id,
        name: tm.module.name,
        category: tm.module.category,
        duration: tm.module.duration,
        rubric: tm.module.rubric,
        prompts: tm.module.prompts,
        difficulty: tm.module.difficulty,
      },
    })),
    capturedAt: new Date().toISOString(),
  };

  const hash = computeJsonHash(snapshot);
  return { snapshot, hash };
}
