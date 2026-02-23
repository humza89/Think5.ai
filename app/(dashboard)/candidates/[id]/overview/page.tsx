import { prisma } from "@/lib/prisma";
import { companyLogo } from "@/lib/candidate-image";
import CompanyLogo from "@/components/candidate/CompanyLogo";
import ExpandableDescription from "@/components/candidate/ExpandableDescription";

export const dynamic = "force-dynamic";

// Helper function to calculate years of experience
function calculateYearsOfExperience(experiences: any[]) {
  if (!experiences || experiences.length === 0) return null;

  const sortedExperiences = experiences
    .filter(exp => exp.startDate)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  if (sortedExperiences.length === 0) return null;

  const firstStartDate = sortedExperiences[0].startDate;
  if (!firstStartDate) return null;

  const [startYear] = firstStartDate.split('-').map(Number);
  const currentYear = new Date().getFullYear();

  return currentYear - startYear;
}

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
  });

  if (!candidate) return null;

  const experiences = candidate.experiences as any[] || [];
  const education = candidate.education as any[] || [];
  const yearsOfExperience = calculateYearsOfExperience(experiences);
  const currentExperience = experiences.find(exp => exp.endDate === 'Present' || !exp.endDate);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-lg border shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current Role</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {candidate.currentTitle || currentExperience?.title || 'N/A'}
          </div>
          {(candidate.currentCompany || currentExperience?.company) && (
            <div className="mt-1 text-sm text-gray-600">
              {candidate.currentCompany || currentExperience?.company}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-lg border shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {yearsOfExperience ? `${yearsOfExperience}+ years` : 'N/A'}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {experiences.length} {experiences.length === 1 ? 'position' : 'positions'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Education</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {education[0]?.degree || education[0]?.school || 'N/A'}
          </div>
          {education[0]?.school && education[0]?.degree && (
            <div className="mt-1 text-sm text-gray-600">{education[0].school}</div>
          )}
        </div>
      </div>

      {/* About / Summary Section */}
      {(candidate.aiSummary || candidate.headline) && (
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-base">About</h3>
          </div>
          <div className="p-6">
            {candidate.headline && (
              <p className="text-sm font-medium text-gray-900 mb-3">{candidate.headline}</p>
            )}
            {candidate.aiSummary && (
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{candidate.aiSummary}</p>
            )}
          </div>
        </section>
      )}

      {/* Career Highlights */}
      {experiences.length > 0 && (
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-base">Career Highlights</h3>
          </div>
          <div className="p-6">
            <div className="space-y-5">
              {experiences.slice(0, 3).map((ex: any, idx: number) => (
                <div key={idx} className="flex gap-4 pb-5 last:pb-0 last:border-0 border-b border-gray-100">
                  <div className="flex-shrink-0">
                    <CompanyLogo
                      src={companyLogo(ex)}
                      alt={ex.company || "Company"}
                      className="h-12 w-12 rounded border object-contain bg-white"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-base font-semibold text-gray-900">{ex.title}</h4>
                        <div className="text-sm text-gray-700 mt-0.5">{ex.company}</div>
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap ml-4">
                        {ex.startDate && (
                          <span>{ex.startDate} - {ex.endDate || "Present"}</span>
                        )}
                      </div>
                    </div>
                    {ex.location && (
                      <div className="text-xs text-gray-500 mt-1">{ex.location}</div>
                    )}
                    {ex.description && (
                      <ExpandableDescription description={ex.description} maxLength={180} />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {experiences.length > 3 && (
              <div className="mt-4 pt-4 border-t">
                <a
                  href={`/candidates/${id}/linkedin`}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View all {experiences.length} positions →
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Skills Section */}
      {candidate.skills && Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-base">Skills & Expertise</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {(candidate.skills as string[]).map((skill, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full font-medium border border-blue-100"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Education Section */}
      {education.length > 0 && (
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-base">Education</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {education.map((edu: any, idx: number) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex-shrink-0">
                    {edu.schoolLogoCdnUrl ? (
                      <CompanyLogo
                        src={edu.schoolLogoCdnUrl}
                        alt={edu.school || "School"}
                        className="h-12 w-12 rounded border object-contain bg-white"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{edu.school}</div>
                    {edu.degree && (
                      <div className="text-sm text-gray-700 mt-0.5">
                        {edu.degree}{edu.field && `, ${edu.field}`}
                      </div>
                    )}
                    {(edu.startDate || edu.endDate) && (
                      <div className="text-xs text-gray-500 mt-1">
                        {[edu.startDate, edu.endDate].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact Information */}
      <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-base">Contact Information</h3>
        </div>
        <div className="p-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {candidate.email && (
              <>
                <dt className="font-medium text-gray-500">Email</dt>
                <dd className="text-gray-900">
                  <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline">
                    {candidate.email}
                  </a>
                </dd>
              </>
            )}
            {candidate.phone && (
              <>
                <dt className="font-medium text-gray-500">Phone</dt>
                <dd className="text-gray-900">{candidate.phone}</dd>
              </>
            )}
            {candidate.location && (
              <>
                <dt className="font-medium text-gray-500">Location</dt>
                <dd className="text-gray-900">{candidate.location}</dd>
              </>
            )}
            {candidate.linkedinUrl && (
              <>
                <dt className="font-medium text-gray-500">LinkedIn</dt>
                <dd className="text-gray-900">
                  <a
                    href={candidate.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    View Profile
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>
      </section>
    </div>
  );
}
