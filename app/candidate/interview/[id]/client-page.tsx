"use client";

import { useState } from "react";
import { InterviewPreCheck } from "@/components/interview/InterviewPreCheck";
import { InterviewRoom } from "@/components/interview/InterviewRoom";

export default function CandidateInterviewClient({ 
  interviewId, 
  candidateName, 
  jobTitle, 
  accessToken 
}: { 
  interviewId: string, 
  candidateName: string, 
  jobTitle: string, 
  accessToken: string 
}) {
  const [preCheckPassed, setPreCheckPassed] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground">
      {!preCheckPassed ? (
        <InterviewPreCheck onComplete={() => setPreCheckPassed(true)} />
      ) : (
        <InterviewRoom 
          interviewId={interviewId} 
          candidateName={candidateName}
          jobTitle={jobTitle}
          accessToken={accessToken}
        />
      )}
    </div>
  );
}
