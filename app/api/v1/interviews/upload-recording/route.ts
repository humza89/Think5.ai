import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "candidate") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("video") as File;
    const interviewId = formData.get("interviewId") as string;

    if (!file || !interviewId) {
      return NextResponse.json({ error: "Missing file or interviewId" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload File to Supabase Storage
    const supabase = await createSupabaseServerClient();
    const fileName = `${interviewId}/${Date.now()}_recording.webm`;
    
    // Upload to a secure 'interview-recordings' bucket 
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("secure-recordings")
      .upload(fileName, buffer, {
        contentType: file.type || 'video/webm',
      });

    if (uploadError) {
      console.error("Supabase Storage Error:", uploadError);
      return NextResponse.json({ error: "Failed to upload recording to storage." }, { status: 500 });
    }
    
    // In enterprise, we might keep this private and use signed URLs for recruiters,
    // but for this MVP, we fetch the public/signed URL to save to DB.
    const urlResponse = await supabase.storage
      .from("secure-recordings")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year expiry

    const recordingUrl = urlResponse.data?.signedUrl || "";

    // Save to Interview record
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        videoUrl: recordingUrl
      }
    });

    return NextResponse.json({
      success: true,
      message: "Recording securely uploaded and saved.",
      url: recordingUrl
    });
  } catch (error) {
    console.error("Upload Recording Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
