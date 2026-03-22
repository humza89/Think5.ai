import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError, getRecruiterForUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rateLimitResult = await checkRateLimit(`upload:${ip}`, {
      maxRequests: 10,
      windowMs: 60000,
    });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many upload requests. Please try again later." },
        { status: 429 }
      );
    }

    const { user, profile } = await requireApprovedAccess(["recruiter", "admin"]);
    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const contentType = request.headers.get("content-type") || "";

    // Handle JSON body (resume URL reference after upload to /api/upload)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { type, resumeUrl, filename, rows } = body;

      if (type === "resume" && resumeUrl) {
        // Single resume upload — create one passive profile
        const passiveProfile = await prisma.passiveProfile.create({
          data: {
            resumeUrl,
            source: "resume",
            sourceRecruiterId: recruiter.id,
            status: "CREATED",
            // Extract name from filename if possible
            firstName: filename
              ? filename.replace(/\.[^.]+$/, "").split(/[_\-\s]+/)[0] || null
              : null,
          },
        });

        return NextResponse.json(
          { profiles: [passiveProfile], created: 1, errors: 0 },
          { status: 201 }
        );
      }

      if (type === "csv" && Array.isArray(rows)) {
        // CSV bulk import — rows is an array of objects with candidate data
        const results: { created: number; errors: number; profiles: any[] } = {
          created: 0,
          errors: 0,
          profiles: [],
        };

        for (const row of rows) {
          try {
            // Support common CSV column names
            const email = row.email || row.Email || row.EMAIL;
            const firstName =
              row.firstName || row.first_name || row.FirstName || row["First Name"];
            const lastName =
              row.lastName || row.last_name || row.LastName || row["Last Name"];
            const fullName = row.fullName || row.full_name || row.Name || row.name;
            const linkedinUrl =
              row.linkedinUrl || row.linkedin || row.LinkedIn || row["LinkedIn URL"];
            const phone = row.phone || row.Phone || row["Phone Number"];
            const currentTitle =
              row.currentTitle || row.title || row.Title || row["Job Title"];
            const currentCompany =
              row.currentCompany || row.company || row.Company;

            if (!email && !linkedinUrl && !fullName && !firstName) {
              results.errors++;
              continue;
            }

            let resolvedFirst = firstName;
            let resolvedLast = lastName;
            if (!resolvedFirst && !resolvedLast && fullName) {
              const parts = fullName.trim().split(/\s+/);
              resolvedFirst = parts[0] || null;
              resolvedLast = parts.slice(1).join(" ") || null;
            }

            const passiveProfile = await prisma.passiveProfile.create({
              data: {
                email: email || null,
                linkedinUrl: linkedinUrl || null,
                firstName: resolvedFirst || null,
                lastName: resolvedLast || null,
                phone: phone || null,
                currentTitle: currentTitle || null,
                currentCompany: currentCompany || null,
                source: "csv",
                sourceRecruiterId: recruiter.id,
                status: "CREATED",
              },
            });

            results.profiles.push(passiveProfile);
            results.created++;
          } catch {
            results.errors++;
          }
        }

        return NextResponse.json(results, { status: 201 });
      }

      return NextResponse.json(
        { error: "Invalid upload type. Use 'resume' or 'csv'." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 400 }
    );
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error in passive-profiles upload:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
