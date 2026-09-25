import { redirect } from "next/navigation";

/** /interviews/[id] has no view of its own; the report is the interview page (Phase 0 T10). */
export default async function InterviewIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/interviews/${id}/report`);
}
