import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  getRecruiterForUser,
  handleAuthError,
  AuthError,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-log";
import {
  sendRecruiterWelcomeEmail,
  sendTeamInvitationEmail,
} from "@/lib/email/resend";
import {
  personalInfoSchema,
  companyCreateSchema,
  companyJoinSchema,
  teamConfigSchema,
  hiringPreferencesSchema,
  reviewSubmitSchema,
} from "@/lib/validations/recruiter-onboarding";

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "recruiter") {
      throw new AuthError("Forbidden: recruiters only", 403);
    }

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    // Fetch company and team invitations if recruiter has a company
    const [company, teamInvitations] = await Promise.all([
      recruiter.companyId
        ? prisma.client.findUnique({ where: { id: recruiter.companyId } })
        : null,
      recruiter.companyId
        ? prisma.teamInvitation.findMany({
            where: { companyId: recruiter.companyId, invitedById: recruiter.id },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);

    return NextResponse.json({
      step: recruiter.onboardingStep,
      completed: recruiter.onboardingCompleted,
      status: recruiter.onboardingStatus,
      recruiter: {
        id: recruiter.id,
        name: recruiter.name,
        email: recruiter.email,
        phone: recruiter.phone,
        title: recruiter.title,
        department: recruiter.department,
        linkedinUrl: recruiter.linkedinUrl,
        profileImage: recruiter.profileImage,
        bio: recruiter.bio,
        hiringPreferences: recruiter.hiringPreferences,
      },
      company,
      teamInvitations,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "recruiter") {
      throw new AuthError("Forbidden: recruiters only", 403);
    }

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const body = await request.json();
    const { step, data } = body;

    if (typeof step !== "number" || step < 1 || step > 5) {
      return NextResponse.json(
        { error: "Invalid step. Must be 1-5" },
        { status: 400 }
      );
    }

    switch (step) {
      case 1: {
        // Personal Info
        const parsed = personalInfoSchema.parse(data);

        await prisma.recruiter.update({
          where: { id: recruiter.id },
          data: {
            name: parsed.name,
            title: parsed.title || null,
            department: parsed.department || null,
            phone: parsed.phone || null,
            linkedinUrl: parsed.linkedinUrl || null,
            profileImage: parsed.profileImage || null,
            bio: parsed.bio || null,
            onboardingStep: Math.max(recruiter.onboardingStep, 1),
            onboardingStatus: "IN_PROGRESS",
          },
        });

        // Update Supabase profile
        const nameParts = parsed.name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const supabase = await createSupabaseServerClient();
        await supabase
          .from("profiles")
          .update({
            first_name: firstName,
            last_name: lastName,
            phone: parsed.phone || null,
          })
          .eq("id", user.id);

        logActivity({
          userId: user.id,
          userRole: "recruiter",
          action: "recruiter.onboarding.personal_info",
          entityType: "Recruiter",
          entityId: recruiter.id,
        }).catch(console.error);

        return NextResponse.json({ success: true, step: 1 });
      }

      case 2: {
        // Company Setup
        if (data.mode === "create") {
          const parsed = companyCreateSchema.parse(data);

          const newCompany = await prisma.client.create({
            data: {
              name: parsed.name,
              industry: parsed.industry || null,
              companySize: parsed.companySize || null,
              website: parsed.website || null,
              description: parsed.description || null,
              logoUrl: parsed.logoUrl || null,
              linkedinUrl: parsed.linkedinUrl || null,
              domain: parsed.domain || null,
              brandColor: parsed.brandColor || null,
              tagline: parsed.tagline || null,
              regions: parsed.regions || [],
              headquarters: parsed.headquarters || null,
              foundedYear: parsed.foundedYear ?? null,
              employeeCount: parsed.employeeCount ?? null,
            },
          });

          await prisma.recruiter.update({
            where: { id: recruiter.id },
            data: {
              companyId: newCompany.id,
              onboardingStep: Math.max(recruiter.onboardingStep, 2),
            },
          });

          logActivity({
            userId: user.id,
            userRole: "recruiter",
            action: "company.created",
            entityType: "Client",
            entityId: newCompany.id,
            metadata: { companyName: newCompany.name },
          }).catch(console.error);

          return NextResponse.json({ success: true, step: 2, company: newCompany });
        } else if (data.mode === "join") {
          const parsed = companyJoinSchema.parse(data);

          const company = await prisma.client.findUnique({
            where: { id: parsed.companyId },
          });
          if (!company) {
            return NextResponse.json(
              { error: "Company not found" },
              { status: 404 }
            );
          }

          await prisma.recruiter.update({
            where: { id: recruiter.id },
            data: {
              companyId: company.id,
              onboardingStep: Math.max(recruiter.onboardingStep, 2),
            },
          });

          logActivity({
            userId: user.id,
            userRole: "recruiter",
            action: "recruiter.onboarding.company_joined",
            entityType: "Client",
            entityId: company.id,
          }).catch(console.error);

          return NextResponse.json({ success: true, step: 2, company });
        } else {
          return NextResponse.json(
            { error: "Invalid mode. Must be 'create' or 'join'" },
            { status: 400 }
          );
        }
      }

      case 3: {
        // Team Configuration (skippable)
        const parsed = teamConfigSchema.parse(data);

        if (!parsed.skip && parsed.invitations.length > 0) {
          // Need company to send invitations
          if (!recruiter.companyId) {
            return NextResponse.json(
              { error: "Complete company setup before inviting team members" },
              { status: 400 }
            );
          }

          const company = await prisma.client.findUnique({
            where: { id: recruiter.companyId },
          });

          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const invitations = await prisma.$transaction(
            parsed.invitations.map((inv) =>
              prisma.teamInvitation.create({
                data: {
                  email: inv.email,
                  name: inv.name || null,
                  role: inv.role,
                  department: inv.department || null,
                  companyId: recruiter.companyId!,
                  invitedById: recruiter.id,
                  expiresAt,
                },
              })
            )
          );

          // Send emails asynchronously
          for (const inv of parsed.invitations) {
            sendTeamInvitationEmail(
              inv.email,
              recruiter.name,
              company?.name || "your team",
              inv.role
            ).catch(console.error);

            logActivity({
              userId: user.id,
              userRole: "recruiter",
              action: "team.invitation.sent",
              entityType: "TeamInvitation",
              entityId: invitations[0]?.id || "",
              metadata: { email: inv.email, role: inv.role },
            }).catch(console.error);
          }
        }

        await prisma.recruiter.update({
          where: { id: recruiter.id },
          data: {
            onboardingStep: Math.max(recruiter.onboardingStep, 3),
          },
        });

        return NextResponse.json({ success: true, step: 3 });
      }

      case 4: {
        // Hiring Preferences
        const parsed = hiringPreferencesSchema.parse(data);

        await prisma.recruiter.update({
          where: { id: recruiter.id },
          data: {
            hiringPreferences: parsed,
            onboardingStep: Math.max(recruiter.onboardingStep, 4),
          },
        });

        logActivity({
          userId: user.id,
          userRole: "recruiter",
          action: "recruiter.onboarding.hiring_preferences",
          entityType: "Recruiter",
          entityId: recruiter.id,
        }).catch(console.error);

        return NextResponse.json({ success: true, step: 4 });
      }

      case 5: {
        // Review & Launch
        reviewSubmitSchema.parse(data);

        await prisma.recruiter.update({
          where: { id: recruiter.id },
          data: {
            onboardingCompleted: true,
            onboardingStatus: "PENDING_APPROVAL",
            onboardingStep: 5,
          },
        });

        // Sync onboarding_status to Supabase profiles for proxy-level gating
        const { createSupabaseAdminClient } = await import("@/lib/supabase-server");
        const supabaseAdmin = await createSupabaseAdminClient();
        await supabaseAdmin
          .from("profiles")
          .update({ onboarding_status: "pending_approval" })
          .eq("id", user.id);

        // Send welcome email
        const firstName = recruiter.name.split(" ")[0] || "there";
        sendRecruiterWelcomeEmail(recruiter.email, firstName).catch(
          console.error
        );

        logActivity({
          userId: user.id,
          userRole: "recruiter",
          action: "recruiter.onboarding.completed",
          entityType: "Recruiter",
          entityId: recruiter.id,
        }).catch(console.error);

        return NextResponse.json({ success: true, step: 5, completed: true });
      }

      default:
        return NextResponse.json(
          { error: "Invalid step" },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      );
    }
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
