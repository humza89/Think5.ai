import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";
import { sendInterviewInvitationEmail } from "@/lib/email/invitation";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "recruiter") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { candidateId, email, passiveProfileId, jobId, templateId } = await req.json();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    if (!candidateId && !passiveProfileId && !email) {
      return NextResponse.json({ error: "Candidate reference or email required" }, { status: 400 });
    }

    // Identify target email
    let targetEmail = email;
    let targetName = "";
    
    if (passiveProfileId) {
      const pProfile = await prisma.passiveProfile.findUnique({ where: { id: passiveProfileId } });
      if (!pProfile) return NextResponse.json({ error: "Passive profile not found" }, { status: 404 });
      targetEmail = pProfile.email || targetEmail;
      targetName = pProfile.firstName || "";
      
      // Update passive profile status
      await prisma.passiveProfile.update({
        where: { id: passiveProfileId },
        data: { status: "INVITED" }
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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create Invitation record
    const invitation = await prisma.interviewInvitation.create({
      data: {
        recruiterId: profile.id,
        candidateId: candidateId || undefined,
        jobId: jobId,
        templateId: templateId || job.templateId || undefined,
        email: targetEmail,
        token: token,
        status: "SENT",
        sentAt: new Date(),
        expiresAt: expiresAt
      }
    });

    // Send the email
    await sendInterviewInvitationEmail(
      targetEmail,
      targetName,
      job.company.name,
      job.title,
      token
    );

    return NextResponse.json({
      success: true,
      message: "Invitation sent successfully",
      data: invitation
    });

  } catch (error) {
    console.error("Invitation Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
