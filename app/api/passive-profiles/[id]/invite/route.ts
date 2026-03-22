import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError, getRecruiterForUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";
import { sendEmail } from "@/lib/email/resend";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rateLimitResult = await checkRateLimit(`invite:${ip}`, {
      maxRequests: 20,
      windowMs: 60000,
    });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many invitation requests. Please try again later." },
        { status: 429 }
      );
    }

    const { user, profile } = await requireApprovedAccess(["recruiter", "admin"]);
    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const { id } = await params;

    // Verify passive profile exists and belongs to this recruiter
    const passiveProfile = await prisma.passiveProfile.findUnique({
      where: { id },
    });

    if (!passiveProfile) {
      return NextResponse.json(
        { error: "Passive profile not found" },
        { status: 404 }
      );
    }

    if (passiveProfile.sourceRecruiterId !== recruiter.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!passiveProfile.email) {
      return NextResponse.json(
        { error: "Passive profile has no email address" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { jobId, message: customMessage, expiresInDays } = body;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + (expiresInDays || 7) * 24 * 60 * 60 * 1000
    );

    // Create interview invitation
    const invitation = await prisma.interviewInvitation.create({
      data: {
        recruiterId: recruiter.id,
        jobId: jobId || null,
        token,
        status: "SENT",
        sentAt: new Date(),
        expiresAt,
        email: passiveProfile.email,
      },
      include: {
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    });

    // Update passive profile status
    await prisma.passiveProfile.update({
      where: { id },
      data: { status: "INVITED" },
    });

    // Send invitation email
    const interviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/interview/accept?token=${token}`;
    const jobTitle = invitation.job?.title || "a position";
    const companyName = invitation.job?.company?.name || "our team";
    const candidateName =
      [passiveProfile.firstName, passiveProfile.lastName]
        .filter(Boolean)
        .join(" ") || "there";

    try {
      await sendEmail({
        to: passiveProfile.email,
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
                        Hi ${candidateName}, You're Invited!
                      </h1>
                      <p style="color:rgba(255,255,255,0.7);font-size:16px;line-height:24px;text-align:center;margin:0 0 8px 0;">
                        You've been invited to interview for:
                      </p>
                      <p style="color:#3B82F6;font-size:18px;font-weight:600;text-align:center;margin:0 0 16px 0;">
                        ${jobTitle} at ${companyName}
                      </p>
                      ${
                        customMessage
                          ? `<p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:22px;text-align:center;margin:0 0 24px 0;font-style:italic;">"${customMessage}"</p>`
                          : ""
                      }
                      <div style="text-align:center;margin-bottom:32px;">
                        <a href="${interviewUrl}" style="display:inline-block;background-color:#fff;color:#000;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:9999px;">
                          Accept Invitation
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

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error sending invitation:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
