import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getRecruiterForUser } from "@/lib/auth";
import crypto from "crypto";
import { sendEmail } from "@/lib/email/resend";

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const body = await request.json();
    const { candidateId, jobId, templateId, email, expiresInDays } = body;

    if (!candidateId && !email) {
      return NextResponse.json(
        { error: "Either candidateId or email is required" },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (expiresInDays || 7) * 24 * 60 * 60 * 1000);

    const invitation = await prisma.interviewInvitation.create({
      data: {
        recruiterId: recruiter.id,
        candidateId: candidateId || null,
        jobId: jobId || null,
        templateId: templateId || null,
        token,
        status: "SENT",
        sentAt: new Date(),
        expiresAt,
        email: email || null,
      },
      include: {
        candidate: { select: { fullName: true, email: true } },
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    });

    // Send invitation email
    const recipientEmail = email || invitation.candidate?.email;
    if (recipientEmail) {
      const interviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/interview/accept?token=${token}`;
      const jobTitle = invitation.job?.title || "Interview";
      const companyName = invitation.job?.company?.name || "our client";

      try {
        await sendEmail({
          to: recipientEmail,
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
                          <span style="font-size:28px;font-weight:bold;color:#fff;">think5</span>
                          <span style="font-size:28px;font-weight:bold;color:#3B82F6;">.</span>
                        </div>
                        <h1 style="color:#fff;font-size:24px;font-weight:600;text-align:center;margin:0 0 16px 0;">
                          You're Invited to Interview
                        </h1>
                        <p style="color:rgba(255,255,255,0.7);font-size:16px;line-height:24px;text-align:center;margin:0 0 8px 0;">
                          You've been invited to complete an AI-powered interview for:
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
    }

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error sending invitation:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
