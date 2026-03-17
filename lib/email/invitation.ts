import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInterviewInvitationEmail(
  toEmail: string,
  candidateName: string,
  companyName: string,
  jobTitle: string,
  invitationToken: string
) {
  const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}`;

  const { data, error } = await resend.emails.send({
    from: "JPJ Staffing <noreply@jpjstaffing.com>", // Replace with verified domain
    to: [toEmail],
    subject: `${companyName} has invited you to interview for ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Interview Invitation</h2>
        <p>Hi ${candidateName || "there"},</p>
        <p>A recruiter at <strong>${companyName}</strong> is interested in your profile for the <strong>${jobTitle}</strong> position and has invited you to complete an AI-powered interview.</p>
        <p>This interview will help you showcase your skills and experience on your own time.</p>
        <div style="margin: 30px 0;">
          <a href="${invitationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Start Interview Process
          </a>
        </div>
        <p>If you have any questions, please reply to this email.</p>
        <p>Best regards,<br>The JPJ Staffing Team</p>
      </div>
    `,
  });

  if (error) {
    console.error("Error sending invitation email:", error);
    throw new Error(error.message);
  }

  return data;
}
