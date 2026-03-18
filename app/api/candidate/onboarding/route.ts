import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  handleAuthError,
  AuthError,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Helper: find or create candidate record for this user
async function getOrCreateCandidate(userId: string, email: string, firstName: string, lastName: string) {
  let candidate = await prisma.candidate.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!candidate) {
    // Need a recruiter for the relation — use a system/platform recruiter or the first one
    let systemRecruiter = await prisma.recruiter.findFirst({
      where: { email: "system@think5.ai" },
    });
    if (!systemRecruiter) {
      systemRecruiter = await prisma.recruiter.findFirst();
    }
    if (!systemRecruiter) {
      // Auto-create system recruiter instead of blocking candidate onboarding
      systemRecruiter = await prisma.recruiter.create({
        data: {
          name: "System",
          email: "system@think5.ai",
        },
      });
    }

    candidate = await prisma.candidate.create({
      data: {
        fullName: `${firstName} ${lastName}`.trim() || "New Candidate",
        email,
        recruiterId: systemRecruiter.id,
        status: "SOURCED",
        onboardingStep: 0,
        onboardingCompleted: false,
      },
    });
  }

  return candidate;
}

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const candidate = await getOrCreateCandidate(
      user.id,
      profile.email,
      profile.first_name,
      profile.last_name
    );

    // Fetch all related data in parallel
    const [skills, experiences, education, certifications, documents, jobPreference] =
      await Promise.all([
        prisma.candidateSkill.findMany({
          where: { candidateId: candidate.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.candidateExperience.findMany({
          where: { candidateId: candidate.id },
          orderBy: { startDate: "desc" },
        }),
        prisma.candidateEducation.findMany({
          where: { candidateId: candidate.id },
          orderBy: { startDate: "desc" },
        }),
        prisma.candidateCertification.findMany({
          where: { candidateId: candidate.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.document.findMany({
          where: { candidateId: candidate.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.jobPreference.findUnique({
          where: { candidateId: candidate.id },
        }),
      ]);

    // Check for linked passive profile (pre-fill data)
    const passiveProfile = await prisma.passiveProfile.findFirst({
      where: {
        email: { equals: profile.email, mode: "insensitive" },
        status: { in: ["INVITED", "LINKED"] },
      },
    });

    return NextResponse.json({
      step: candidate.onboardingStep,
      completed: candidate.onboardingCompleted,
      onboardingStatus: candidate.onboardingStatus,
      rejectionReason: candidate.rejectionReason,
      personalInfo: {
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
        phone: (profile as Record<string, unknown>).phone || null,
        jobTitle: (profile as Record<string, unknown>).job_title || null,
        bio: (profile as Record<string, unknown>).bio || null,
        location: candidate.location,
        linkedinUrl: candidate.linkedinUrl,
        profileImage: candidate.profileImage,
      },
      resume: documents.find((d: { type: string }) => d.type === "RESUME") || null,
      experiences,
      education,
      certifications,
      skills,
      jobPreferences: jobPreference,
      documents,
      // Pre-fill from passive profile if available
      prefill: passiveProfile
        ? {
            firstName: passiveProfile.firstName,
            lastName: passiveProfile.lastName,
            phone: passiveProfile.phone,
            currentTitle: passiveProfile.currentTitle,
            currentCompany: passiveProfile.currentCompany,
            linkedinUrl: passiveProfile.linkedinUrl,
            skills: passiveProfile.skills,
          }
        : null,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const body = await req.json();
    const { step, data } = body;

    if (typeof step !== "number" || step < 1 || step > 7) {
      return NextResponse.json(
        { error: "Step must be between 1 and 7" },
        { status: 400 }
      );
    }

    const candidate = await getOrCreateCandidate(
      user.id,
      profile.email,
      profile.first_name,
      profile.last_name
    );

    switch (step) {
      case 1: {
        // Personal Info — update Supabase profile + Candidate record
        const supabase = await createSupabaseServerClient();
        const profileUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (data.firstName) profileUpdate.first_name = data.firstName;
        if (data.lastName) profileUpdate.last_name = data.lastName;
        if (data.phone !== undefined) profileUpdate.phone = data.phone;
        if (data.jobTitle !== undefined) profileUpdate.job_title = data.jobTitle;
        if (data.bio !== undefined) profileUpdate.bio = data.bio;

        await supabase.from("profiles").update(profileUpdate).eq("id", user.id);

        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            fullName:
              `${data.firstName || profile.first_name} ${data.lastName || profile.last_name}`.trim(),
            location: data.location || candidate.location,
            linkedinUrl: data.linkedinUrl || candidate.linkedinUrl,
            profileImage: data.profileImage || candidate.profileImage,
            phone: data.phone || candidate.phone,
            currentTitle: data.jobTitle || candidate.currentTitle,
            onboardingStep: Math.max(candidate.onboardingStep, step),
          },
        });
        break;
      }

      case 2: {
        // Resume Upload — save document reference
        if (data.fileUrl && data.filename) {
          // Remove old resume if exists
          await prisma.document.deleteMany({
            where: { candidateId: candidate.id, type: "RESUME" },
          });

          await prisma.document.create({
            data: {
              candidateId: candidate.id,
              type: "RESUME",
              fileUrl: data.fileUrl,
              filename: data.filename,
              mimeType: data.mimeType || null,
              fileSize: data.fileSize || null,
            },
          });

          await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              resumeUrl: data.fileUrl,
              onboardingStep: Math.max(candidate.onboardingStep, step),
            },
          });
        } else {
          // Skip step (no resume)
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              onboardingStep: Math.max(candidate.onboardingStep, step),
            },
          });
        }
        break;
      }

      case 3: {
        // Work Experience — upsert entries
        const experiences = data.experiences || [];

        // Delete all existing and re-create
        await prisma.candidateExperience.deleteMany({
          where: { candidateId: candidate.id },
        });

        if (experiences.length > 0) {
          await prisma.candidateExperience.createMany({
            data: experiences.map(
              (exp: {
                company: string;
                title: string;
                startDate?: string;
                endDate?: string;
                isCurrent?: boolean;
                description?: string;
                location?: string;
              }) => ({
                candidateId: candidate.id,
                company: exp.company,
                title: exp.title,
                startDate: exp.startDate ? new Date(exp.startDate) : null,
                endDate: exp.endDate ? new Date(exp.endDate) : null,
                isCurrent: exp.isCurrent || false,
                description: exp.description || null,
                location: exp.location || null,
              })
            ),
          });
        }

        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            onboardingStep: Math.max(candidate.onboardingStep, step),
            experienceYears: experiences.length > 0 ? experiences.length : null,
          },
        });
        break;
      }

      case 4: {
        // Education & Certifications
        const educationEntries = data.education || [];
        const certEntries = data.certifications || [];

        // Replace all existing
        await Promise.all([
          prisma.candidateEducation.deleteMany({
            where: { candidateId: candidate.id },
          }),
          prisma.candidateCertification.deleteMany({
            where: { candidateId: candidate.id },
          }),
        ]);

        if (educationEntries.length > 0) {
          await prisma.candidateEducation.createMany({
            data: educationEntries.map(
              (edu: {
                institution: string;
                degree?: string;
                field?: string;
                startDate?: string;
                endDate?: string;
              }) => ({
                candidateId: candidate.id,
                institution: edu.institution,
                degree: edu.degree || null,
                field: edu.field || null,
                startDate: edu.startDate ? new Date(edu.startDate) : null,
                endDate: edu.endDate ? new Date(edu.endDate) : null,
              })
            ),
          });
        }

        if (certEntries.length > 0) {
          await prisma.candidateCertification.createMany({
            data: certEntries.map(
              (cert: {
                name: string;
                issuingOrg?: string;
                issueDate?: string;
                expiryDate?: string;
                credentialId?: string;
              }) => ({
                candidateId: candidate.id,
                name: cert.name,
                issuingOrg: cert.issuingOrg || null,
                issueDate: cert.issueDate ? new Date(cert.issueDate) : null,
                expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : null,
                credentialId: cert.credentialId || null,
              })
            ),
          });
        }

        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            onboardingStep: Math.max(candidate.onboardingStep, step),
          },
        });
        break;
      }

      case 5: {
        // Skills
        const skillEntries = data.skills || [];

        await prisma.candidateSkill.deleteMany({
          where: { candidateId: candidate.id },
        });

        if (skillEntries.length > 0) {
          await prisma.candidateSkill.createMany({
            data: skillEntries.map(
              (skill: {
                skillName: string;
                category?: string;
                proficiency?: number;
                yearsExp?: number;
              }) => ({
                candidateId: candidate.id,
                skillName: skill.skillName,
                category: skill.category || null,
                proficiency: skill.proficiency || null,
                yearsExp: skill.yearsExp || null,
                source: "onboarding",
              })
            ),
          });
        }

        // Also store as JSON on candidate for quick access
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            skills: skillEntries.map(
              (s: { skillName: string }) => s.skillName
            ),
            onboardingStep: Math.max(candidate.onboardingStep, step),
          },
        });
        break;
      }

      case 6: {
        // Job Preferences
        await prisma.jobPreference.upsert({
          where: { candidateId: candidate.id },
          create: {
            candidateId: candidate.id,
            jobTypes: data.jobTypes || [],
            preferredLocations: data.preferredLocations || [],
            remotePreference: data.remotePreference || "FLEXIBLE",
            salaryMin: data.salaryMin || null,
            salaryMax: data.salaryMax || null,
            salaryCurrency: data.salaryCurrency || "USD",
            availability: data.availability || "IMMEDIATELY",
            willingToRelocate: data.willingToRelocate || false,
            noticePeriod: data.noticePeriod || null,
            preferredCurrency: data.preferredCurrency || "USD",
            preferredIndustries: data.preferredIndustries || [],
            preferredCompanies: data.preferredCompanies || [],
          },
          update: {
            jobTypes: data.jobTypes || [],
            preferredLocations: data.preferredLocations || [],
            remotePreference: data.remotePreference || "FLEXIBLE",
            salaryMin: data.salaryMin || null,
            salaryMax: data.salaryMax || null,
            salaryCurrency: data.salaryCurrency || "USD",
            availability: data.availability || "IMMEDIATELY",
            willingToRelocate: data.willingToRelocate || false,
            noticePeriod: data.noticePeriod || null,
            preferredCurrency: data.preferredCurrency || "USD",
            preferredIndustries: data.preferredIndustries || [],
            preferredCompanies: data.preferredCompanies || [],
          },
        });

        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            onboardingStep: Math.max(candidate.onboardingStep, step),
          },
        });
        break;
      }

      case 7: {
        // Review & Submit — mark onboarding complete, set pending approval
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            onboardingCompleted: true,
            onboardingStep: 7,
            onboardingStatus: "PENDING_APPROVAL",
            rejectionReason: null,
            consentGdpr: data.consentGdpr || false,
            consentDataProcessing: data.consentDataProcessing || false,
            consentedAt: data.consentGdpr || data.consentDataProcessing ? new Date() : undefined,
          },
        });

        // Link passive profile if exists
        const passiveProfile = await prisma.passiveProfile.findFirst({
          where: {
            email: { equals: profile.email, mode: "insensitive" },
            status: { in: ["CREATED", "INVITED"] },
          },
        });

        if (passiveProfile) {
          await prisma.passiveProfile.update({
            where: { id: passiveProfile.id },
            data: {
              status: "LINKED",
              linkedCandidateId: candidate.id,
            },
          });
        }
        break;
      }
    }

    return NextResponse.json({ success: true, step });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
