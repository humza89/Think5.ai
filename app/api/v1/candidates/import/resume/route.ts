import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const pdfParse = require("pdf-parse");
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "recruiter") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const email = formData.get("email") as string;
    const linkedinUrl = formData.get("linkedinUrl") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 1. Convert to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Extract Text via pdf-parse
    let extractedText = "";
    try {
      if (file.type === "application/pdf") {
        const data = await pdfParse(buffer);
        extractedText = data.text;
      } else {
        return NextResponse.json(
          { error: "Only PDF files are supported currently" },
          { status: 400 }
        );
      }
    } catch (parseError) {
      console.error("PDF Parsing error", parseError);
      return NextResponse.json(
        { error: "Failed to parse resume document." },
        { status: 422 }
      );
    }

    // 3. Upload File to Supabase Storage
    const supabase = await createSupabaseServerClient();
    const fileName = `${user.id}/${Date.now()}_${file.name.replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    )}`;
    
    // We'll upload it to a generic 'resumes' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(fileName, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Supabase Storage Error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file to storage." },
        { status: 500 }
      );
    }
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("resumes")
      .getPublicUrl(fileName);

    const resumeUrl = publicUrlData.publicUrl;

    // 4. Simple heuristic text extraction for name/skills (ideally use GPT-4 here)
    // For this boilerplate MVP script, we mock some extractions
    // We assume the first few lines might be names
    const lines = extractedText.split("\n").filter((l) => l.trim().length > 0);
    const possibleName = lines.length > 0 ? lines[0].trim() : "Unknown Name";

    // 5. Create Passive Profile
    const passiveProfile = await prisma.passiveProfile.create({
      data: {
        email: email || undefined,
        linkedinUrl: linkedinUrl || undefined,
        firstName: possibleName.split(" ")[0] || undefined,
        lastName: possibleName.split(" ").slice(1).join(" ") || undefined,
        resumeUrl,
        source: "resume",
        status: "CREATED",
        extractedData: {
          rawText: extractedText.substring(0, 10000), // Cap size
          fileName: file.name,
        },
        sourceRecruiterId: profile.id, // Ensure profile.id links correctly to Recruiter table ID
      },
    });

    return NextResponse.json({
      success: true,
      message: "Resume imported and passive profile created.",
      data: passiveProfile,
    });
  } catch (error) {
    console.error("Resume Import Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
