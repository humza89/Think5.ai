import { prisma } from "./prisma";
import {
  generateEmbedding,
  cosineSimilarity,
  generateMatchReasoning,
} from "./openai";

export async function generateCandidateEmbedding(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  // Create a rich text representation of the candidate
  const candidateText = `
    Title: ${candidate.currentTitle || ""}
    Company: ${candidate.currentCompany || ""}
    Skills: ${(candidate.skills as string[]).join(", ")}
    Experience: ${candidate.experienceYears || 0} years
    Industries: ${(candidate.industries as string[]).join(", ")}
    Summary: ${candidate.aiSummary || ""}
    ${candidate.resumeText || ""}
  `.trim();

  const embedding = await generateEmbedding(candidateText);

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { embedding },
  });

  return embedding;
}

export async function generateRoleEmbedding(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { client: true },
  });

  if (!role) {
    throw new Error("Role not found");
  }

  // Create a rich text representation of the role
  const roleText = `
    Title: ${role.title}
    Company: ${role.client.name}
    Industry: ${role.client.industry || ""}
    Required Skills: ${(role.skillsRequired as string[]).join(", ")}
    Location: ${role.location || ""}
    Experience: ${role.experienceYears || ""}
    Description: ${role.description}
  `.trim();

  const embedding = await generateEmbedding(roleText);

  await prisma.role.update({
    where: { id: roleId },
    data: { embedding },
  });

  return embedding;
}

export async function calculateMatch(
  candidateId: string,
  roleId: string
): Promise<{ fitScore: number; reasoning: string }> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { client: true },
  });

  if (!candidate || !role) {
    throw new Error("Candidate or role not found");
  }

  // Ensure both have embeddings
  let candidateEmbedding = candidate.embedding as number[] | null;
  let roleEmbedding = role.embedding as number[] | null;

  if (!candidateEmbedding) {
    candidateEmbedding = await generateCandidateEmbedding(candidateId);
  }

  if (!roleEmbedding) {
    roleEmbedding = await generateRoleEmbedding(roleId);
  }

  // Calculate cosine similarity
  const similarity = cosineSimilarity(candidateEmbedding, roleEmbedding);

  // Convert to 0-100 scale
  const fitScore = Math.max(0, Math.min(100, (similarity + 1) * 50));

  // Generate reasoning
  const reasoning = await generateMatchReasoning(
    {
      fullName: candidate.fullName,
      skills: candidate.skills as string[],
      experienceYears: candidate.experienceYears,
      industries: candidate.industries as string[],
    },
    {
      title: role.title,
      skillsRequired: role.skillsRequired as string[],
      description: role.description,
    },
    fitScore / 100
  );

  return { fitScore, reasoning };
}

export async function generateMatchesForRole(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
  });

  if (!role) {
    throw new Error("Role not found");
  }

  // Get all candidates
  const candidates = await prisma.candidate.findMany({
    where: {
      status: {
        in: ["SOURCED", "CONTACTED", "INTERVIEWED"],
      },
    },
  });

  const matches = [];

  for (const candidate of candidates) {
    try {
      const { fitScore, reasoning } = await calculateMatch(candidate.id, roleId);

      // Only create matches with score > 50
      if (fitScore > 50) {
        const match = await prisma.match.upsert({
          where: {
            candidateId_roleId: {
              candidateId: candidate.id,
              roleId: roleId,
            },
          },
          update: {
            fitScore,
            reasoning,
          },
          create: {
            candidateId: candidate.id,
            roleId: roleId,
            fitScore,
            reasoning,
          },
        });

        matches.push(match);
      }
    } catch (error) {
      console.error(
        `Error matching candidate ${candidate.id} to role ${roleId}:`,
        error
      );
    }
  }

  return matches;
}

export async function generateMatchesForCandidate(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  // Get all active roles
  const roles = await prisma.role.findMany({
    include: { client: true },
  });

  const matches = [];

  for (const role of roles) {
    try {
      const { fitScore, reasoning } = await calculateMatch(candidateId, role.id);

      // Only create matches with score > 50
      if (fitScore > 50) {
        const match = await prisma.match.upsert({
          where: {
            candidateId_roleId: {
              candidateId: candidateId,
              roleId: role.id,
            },
          },
          update: {
            fitScore,
            reasoning,
          },
          create: {
            candidateId: candidateId,
            roleId: role.id,
            fitScore,
            reasoning,
          },
        });

        matches.push(match);
      }
    } catch (error) {
      console.error(
        `Error matching candidate ${candidateId} to role ${role.id}:`,
        error
      );
    }
  }

  return matches;
}
