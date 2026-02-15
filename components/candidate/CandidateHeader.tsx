import Image from "next/image";
import { pickAvatar } from "@/lib/candidate-image";
import DeleteCandidateButton from "./DeleteCandidateButton";

export default function CandidateHeader({ candidate }: { candidate: any }) {
  const img = pickAvatar(candidate);
  return (
    <div className="px-6 py-5 flex items-center justify-between bg-white border-b">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full overflow-hidden bg-gray-100 ring-2 ring-gray-200">
          {img ? (
            <Image src={img} alt={candidate.fullName} width={64} height={64} className="h-full w-full object-cover" unoptimized/>
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600 text-white text-2xl font-bold">
              {candidate.fullName?.charAt(0) || '?'}
            </div>
          )}
        </div>
        <div>
          <div className="text-xl font-semibold">{candidate.fullName}</div>
          {candidate.headline && <div className="text-sm text-gray-600 mt-0.5">{candidate.headline}</div>}
          {candidate.location && <div className="text-xs text-gray-500 mt-1">📍 {candidate.location}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {candidate.linkedinUrl && (
          <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer"
             className="text-sm px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            View on LinkedIn
          </a>
        )}
        <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.fullName} />
      </div>
    </div>
  );
}
