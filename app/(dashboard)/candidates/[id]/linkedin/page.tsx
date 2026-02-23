import { prisma } from "@/lib/prisma";
import { companyLogo } from "@/lib/candidate-image";
import CompanyLogo from "@/components/candidate/CompanyLogo";
import ExpandableDescription from "@/components/candidate/ExpandableDescription";

export const dynamic = "force-dynamic";

// Group experiences by company
function groupExperiencesByCompany(experiences: any[]) {
  const grouped: { [key: string]: any[] } = {};

  experiences.forEach((exp) => {
    const companyKey = exp.company || 'Unknown Company';
    if (!grouped[companyKey]) {
      grouped[companyKey] = [];
    }
    grouped[companyKey].push(exp);
  });

  return Object.entries(grouped).map(([company, roles]) => ({
    company,
    companyLogo: roles[0].companyLogoCdnUrl || null,
    totalDuration: calculateTotalDuration(roles),
    roles: roles.sort((a, b) => {
      // Sort by start date, most recent first
      const dateA = a.startDate || '';
      const dateB = b.startDate || '';
      return dateB.localeCompare(dateA);
    }),
  }));
}

// Calculate total duration across all roles at a company
function calculateTotalDuration(roles: any[]) {
  if (roles.length === 0) return '';

  // Find earliest start date
  const startDates = roles.map(r => r.startDate).filter(Boolean);
  if (startDates.length === 0) return '';

  const earliestStart = startDates.sort()[0];

  // Find latest end date (or Present if any role is current)
  const hasCurrentRole = roles.some(r => r.endDate === 'Present' || !r.endDate);
  const latestEnd = hasCurrentRole ? 'Present' : roles.map(r => r.endDate).filter(Boolean).sort().reverse()[0];

  // Calculate duration in a simple way
  if (earliestStart && latestEnd) {
    const [startYear, startMonth] = earliestStart.split('-').map(Number);

    let endYear, endMonth;
    if (latestEnd === 'Present') {
      const now = new Date();
      endYear = now.getFullYear();
      endMonth = now.getMonth() + 1;
    } else {
      [endYear, endMonth] = latestEnd.split('-').map(Number);
    }

    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    if (years > 0 && months > 0) {
      return `${years} yr${years > 1 ? 's' : ''} ${months} mo${months > 1 ? 's' : ''}`;
    } else if (years > 0) {
      return `${years} yr${years > 1 ? 's' : ''}`;
    } else if (months > 0) {
      return `${months} mo${months > 1 ? 's' : ''}`;
    }
  }

  return '';
}

export default async function LinkedInTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
  });

  if (!candidate) return null;

  const experiences = candidate.experiences as any[] || [];
  const education = candidate.education as any[] || [];
  const skills = candidate.skills as string[] || [];
  const groupedExperiences = groupExperiencesByCompany(experiences);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* LinkedIn Profile Link */}
      <div className="flex items-center justify-between bg-blue-50 px-5 py-3 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2.5">
          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z"/>
          </svg>
          <div>
            <div className="font-semibold text-blue-900 text-sm">LinkedIn Profile</div>
            <div className="text-xs text-blue-700">View full profile on LinkedIn</div>
          </div>
        </div>
        {candidate.linkedinUrl && (
          <a
            href={candidate.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Open LinkedIn
          </a>
        )}
      </div>

      {/* Experiences Section */}
      <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-base">Experiences</h3>
        </div>

        {experiences.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">
            No experience data available
          </div>
        ) : (
          <div className="divide-y">
            {groupedExperiences.map((group, groupIdx) => (
              <article key={groupIdx} className="p-6">
                <div className="flex gap-4">
                  {/* Company Logo */}
                  <div className="flex-shrink-0">
                    {group.companyLogo ? (
                      <CompanyLogo
                        src={group.companyLogo}
                        alt={group.company}
                        className="h-12 w-12 rounded border object-contain bg-white"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Company and Roles */}
                  <div className="flex-1 min-w-0">
                    {/* Company Header */}
                    <div className="mb-4">
                      <h4 className="text-base font-semibold text-gray-900">{group.company}</h4>
                      {group.totalDuration && (
                        <div className="text-xs text-gray-500 mt-0.5">{group.totalDuration}</div>
                      )}
                    </div>

                    {/* Roles under this company */}
                    <div className="relative">
                      {group.roles.map((role, roleIdx) => (
                        <div key={roleIdx} className="relative pl-6 pb-6 last:pb-0">
                          {/* Timeline dot */}
                          <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-gray-300"></div>

                          {/* Timeline line (except for last item) */}
                          {roleIdx < group.roles.length - 1 && (
                            <div className="absolute left-0.5 top-3 w-0.5 h-full bg-gray-200"></div>
                          )}

                          <div>
                            <div className="font-medium text-gray-900">{role.title}</div>
                            {role.startDate && (
                              <div className="text-sm text-gray-600 mt-0.5">
                                {role.startDate} - {role.endDate || "Present"}
                              </div>
                            )}
                            {role.location && (
                              <div className="text-xs text-gray-500 mt-0.5">{role.location}</div>
                            )}

                            {role.description && (
                              <ExpandableDescription description={role.description} maxLength={200} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Education Section */}
      <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-base">Education</h3>
        </div>

        {education.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">
            No education data available
          </div>
        ) : (
          <div className="divide-y">
            {education.map((edu: any, idx: number) => (
              <article key={idx} className="p-6">
                <div className="flex gap-4">
                  {/* School Logo */}
                  <div className="flex-shrink-0">
                    {edu.schoolLogoCdnUrl ? (
                      <CompanyLogo
                        src={edu.schoolLogoCdnUrl}
                        alt={edu.school || 'School'}
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

                  {/* Education Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900">{edu.school}</h4>
                    {edu.degree && (
                      <div className="text-sm text-gray-700 mt-1">
                        {edu.degree}{edu.field ? `, ${edu.field}` : ''}
                      </div>
                    )}
                    {(edu.startDate || edu.endDate) && (
                      <div className="text-sm text-gray-600 mt-1">
                        {edu.startDate && edu.endDate ? `${edu.startDate} - ${edu.endDate}` : edu.startDate || edu.endDate}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Skills Section */}
      {skills.length > 0 && (
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-base">Skills & Expertise</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {skills.map((skill: string, idx: number) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-full border border-blue-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
