"use client";

import { useState } from "react";
import { InterviewPreCheck } from "@/components/interview/InterviewPreCheck";
import { InterviewRoom } from "@/components/interview/InterviewRoom";

export default function CandidateInterviewPage({ params }: { params: { id: string } }) {
  const [preCheckPassed, setPreCheckPassed] = useState(false);

  // In a real implementation: Parse 'id' from URL to fetch candidateName and jobTitle from DB
  const mockCandidateName = "Jane Doe";
  const mockJobTitle = "Senior Project Manager";

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground">
      {!preCheckPassed ? (
        <InterviewPreCheck onComplete={() => setPreCheckPassed(true)} />
      ) : (
        <InterviewRoom 
          interviewId={params.id} 
          candidateName={mockCandidateName}
          jobTitle={mockJobTitle}
        />
      )}
    </div>
  );
}
