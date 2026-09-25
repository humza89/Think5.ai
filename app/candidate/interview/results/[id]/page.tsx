import { permanentRedirect } from "next/navigation";

/**
 * T4: this route used to render hard-coded mock results. The real,
 * policy-filtered report lives at /candidate/interviews/[id]/report; keep the
 * old URL working for bookmarks with a permanent redirect.
 */
export default async function LegacyCandidateResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/candidate/interviews/${id}/report`);
}
