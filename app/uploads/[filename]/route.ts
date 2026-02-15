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

    // Decode the filename to handle special characters
    const decodedFilename = decodeURIComponent(filename);

    // Construct the file path
    const uploadsDir = path.join(process.cwd(), "uploads");
    const filepath = path.join(uploadsDir, decodedFilename);

    // Security check: ensure the file is within the uploads directory
    if (!filepath.startsWith(uploadsDir)) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = await readFile(filepath);

    // Determine content type based on file extension
    const ext = path.extname(decodedFilename).toLowerCase();
    let contentType = "application/octet-stream";

    if (ext === ".pdf") {
      contentType = "application/pdf";
    } else if (ext === ".doc") {
      contentType = "application/msword";
    } else if (ext === ".docx") {
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${decodedFilename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
