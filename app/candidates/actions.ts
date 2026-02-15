"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteCandidate(candidateId: string) {
  try {
    await prisma.candidate.delete({
      where: { id: candidateId },
    });

    revalidatePath("/candidates");
  } catch (error) {
    console.error("Failed to delete candidate:", error);
    throw new Error("Failed to delete candidate");
  }

  // Redirect must be outside try/catch because it throws a special error
  redirect("/candidates");
}
