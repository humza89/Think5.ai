import ResumeUploadButton from "./ResumeUploadButton";

export default function DetailsSidebar({ candidate }: { candidate: any }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Candidate Details</h3>
        <div className="space-y-3 text-sm">
          {candidate.email && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400">📧</span>
              <a className="text-blue-600 hover:underline break-all" href={`mailto:${candidate.email}`}>
                {candidate.email}
              </a>
            </div>
          )}
          {candidate.phone && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400">📞</span>
              <span className="text-gray-900">{candidate.phone}</span>
            </div>
          )}
          {candidate.location && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400">📍</span>
              <span className="text-gray-900">{candidate.location}</span>
            </div>
          )}
          {candidate.currentCompany && (
            <div className="flex items-start gap-2">
              <span className="text-gray-400">🏢</span>
              <span className="text-gray-900">{candidate.currentCompany}</span>
            </div>
          )}
        </div>
      </div>

      {(candidate.linkedinUrl || candidate.resumeUrl) && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Links</h3>
          <div className="space-y-2 text-sm">
            {candidate.linkedinUrl && (
              <div>
                <a className="text-blue-600 hover:underline flex items-center gap-1"
                   target="_blank"
                   rel="noopener noreferrer"
                   href={candidate.linkedinUrl}>
                  <span>🔗</span> LinkedIn Profile
                </a>
              </div>
            )}
            {candidate.resumeUrl && (
              <div>
                <a className="text-blue-600 hover:underline flex items-center gap-1"
                   target="_blank"
                   rel="noopener noreferrer"
                   href={candidate.resumeUrl}>
                  <span>📄</span> Resume
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {(candidate.skills && Array.isArray(candidate.skills) && candidate.skills.length > 0) && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {candidate.skills.map((skill: string, idx: number) => (
              <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
        <ResumeUploadButton candidateId={candidate.id} />
      </div>
    </div>
  );
}
