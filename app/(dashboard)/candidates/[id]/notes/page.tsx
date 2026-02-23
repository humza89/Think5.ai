import { prisma } from "@/lib/prisma";
import NotesClient from "./NotesClient";

export const dynamic = "force-dynamic";

export default async function NotesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const notes = await prisma.note.findMany({
    where: { candidateId: id },
    orderBy: { createdAt: "desc" },
  });

  return <NotesClient candidateId={id} initialNotes={notes} />;
}
