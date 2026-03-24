import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRecruiterForUser, handleAuthError, AuthError } from "@/lib/auth";
import { sendEmail } from "@/lib/email/resend";
import crypto from "crypto";

/**
 * POST /api/interviews/[id]/invite
 *
 * Sends an invitation for a specific interview using the canonical
 * InterviewInvitation model and /interview/accept flow.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { user, profile } = await getAuthenticatedUser();
    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      throw new AuthError("Forbidden: insufficient permissions", 403);
    }

    const body = await request.json();
    const { email } = body;

    // Get interview with candidate and job info
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: { id: true, fullName: true, email: true, recruiterId: true },
        },
        job: {
          select: { id: true, title: true, company: { select: { name: true } } },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Verify recruiter owns the candidate (unless admin)
    let recruiterId: string;
    if (profile.role === "recruiter") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
      if (interview.candidate.recruiterId !== recruiter.id) {
        throw new AuthError("Forbidden: you do not own this candidate", 403);
      }
      recruiterId = recruiter.id;
    } else {
      recruiterId = interview.scheduledBy;
    }

    const candidateEmail = email || interview.candidate.email;
    if (!candidateEmail) {
      return NextResponse.json(
        { error: "No email address available for this candidate" },
        { status: 400 }
      );
    }

    // Create InterviewInvitation using canonical model
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.interviewInvitation.create({
      data: {
        recruiterId,
        candidateId: interview.candidate.id,
        jobId: interview.jobId || undefined,
        templateId: interview.templateId || undefined,
        email: candidateEmail,
        token,
        status: "SENT",
        sentAt: new Date(),
        expiresAt,
      },
    });

    // Link invitation to interview
    await prisma.interview.update({
      where: { id },
      data: { invitationId: invitation.id },
    });

    // Build canonical accept URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const interviewUrl = `${baseUrl}/interview/accept?token=${token}`;

    const jobTitle = interview.job?.title || "Interview";
    const companyName = interview.job?.company?.name || "our client";

    // Send invitation email
    try {
      await sendEmail({
        to: candidateEmail,
        subject: `Interview Invitation: ${jobTitle} at ${companyName}`,
        html: `
          <!DOCTYPE html>
          <html>
            <body style="margin:0;padding:0;background-color:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000;padding:40px 20px;">
                <tr><td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#111;border-radius:16px;border:1px solid rgba(255,255,255,0.1);">
                    <tr><td style="padding:48px 40px;">
                      <div style="text-align:center;margin-bottom:32px;">
                        <span style="font-size:28px;font-weight:bold;color:#fff;">Think5</span>
                        <span style="font-size:28px;font-weight:bold;color:#3B82F6;">.</span>
                      </div>
                      <h1 style="color:#fff;font-size:24px;font-weight:600;text-align:center;margin:0 0 16px 0;">
                        You're Invited to Interview
                      </h1>
                      <p style="color:rgba(255,255,255,0.7);font-size:16px;line-height:24px;text-align:center;margin:0 0 8px 0;">
                        Hi ${interview.candidate.fullName}, you've been invited to complete an AI-powered interview for:
                      </p>
                      <p style="color:#3B82F6;font-size:18px;font-weight:600;text-align:center;margin:0 0 32px 0;">
                        ${jobTitle} at ${companyName}
                      </p>
                      <div style="text-align:center;margin-bottom:32px;">
                        <a href="${interviewUrl}" style="display:inline-block;background-color:#fff;color:#000;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:9999px;">
                          Start Interview
                        </a>
                      </div>
                      <p style="color:rgba(255,255,255,0.5);font-size:14px;text-align:center;margin:0;">
                        This invitation expires on ${expiresAt.toLocaleDateString()}.
                      </p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }

    return NextResponse.json({
      success: true,
      interviewUrl,
      sentTo: candidateEmail,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Interview invite error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
