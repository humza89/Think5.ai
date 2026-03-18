import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const decodedFilename = decodeURIComponent(filename);

    const photosDir = path.join(process.cwd(), "uploads", "photos");
    const filepath = path.join(photosDir, decodedFilename);

    // Security: ensure file is within photos directory
    if (!filepath.startsWith(photosDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 403 });
    }

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = await readFile(filepath);

    const ext = path.extname(decodedFilename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentTypeMap[ext] || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving photo:", error);
    return NextResponse.json({ error: "Failed to serve photo" }, { status: 500 });
  }
}
