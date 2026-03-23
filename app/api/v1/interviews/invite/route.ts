import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRecruiterForUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email/resend";
import crypto from "crypto";

/**
 * V1 Interview Invitation Endpoint
 *
 * Consolidated to use the same InterviewInvitation model and accept flow
 * as the canonical /api/interviews/invite endpoint.
 * Retains passive profile support for backward compatibility.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "recruiter") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const { candidateId, email, passiveProfileId, jobId, templateId } = await req.json();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    if (!candidateId && !passiveProfileId && !email) {
      return NextResponse.json({ error: "Candidate reference or email required" }, { status: 400 });
    }

    // Resolve target email and name
    let targetEmail = email;
    let targetName = "";

    if (passiveProfileId) {
      const pProfile = await prisma.passiveProfile.findUnique({ where: { id: passiveProfileId } });
      if (!pProfile) return NextResponse.json({ error: "Passive profile not found" }, { status: 404 });
      targetEmail = pProfile.email || targetEmail;
      targetName = pProfile.firstName || "";

      await prisma.passiveProfile.update({
        where: { id: passiveProfileId },
        data: { status: "INVITED" },
      });
    }

    if (candidateId) {
      const cProfile = await prisma.candidate.findUnique({ where: { id: candidateId } });
      if (!cProfile) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      targetEmail = cProfile.email || targetEmail;
      targetName = cProfile.fullName;
    }

    if (!targetEmail) {
      return NextResponse.json({ error: "No email available to send invitation" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create InterviewInvitation (canonical model)
    const invitation = await prisma.interviewInvitation.create({
      data: {
        recruiterId: recruiter.id,
        candidateId: candidateId || undefined,
        jobId,
        templateId: templateId || job.templateId || undefined,
        email: targetEmail,
        token,
        status: "SENT",
        sentAt: new Date(),
        expiresAt,
      },
    });

    // Send invitation email using canonical accept flow
    const interviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/interview/accept?token=${token}`;
    const companyName = job.company?.name || "our client";

    try {
      await sendEmail({
        to: targetEmail,
        subject: `Interview Invitation: ${job.title} at ${companyName}`,
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
                        ${targetName ? `Hi ${targetName}, you've` : "You've"} been invited to complete an AI-powered interview for:
                      </p>
                      <p style="color:#3B82F6;font-size:18px;font-weight:600;text-align:center;margin:0 0 32px 0;">
                        ${job.title} at ${companyName}
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
      message: "Invitation sent successfully",
      data: invitation,
    });
  } catch (error) {
    console.error("Invitation Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
