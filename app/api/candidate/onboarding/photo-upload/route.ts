import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { getAuthenticatedUser, handleAuthError, AuthError } from "@/lib/auth";

// ============================================
// Gemini Image Generation Client
// ============================================

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// ============================================
// Headshot Style Prompts
// ============================================

const HEADSHOT_STYLES = [
  {
    key: "corporate",
    label: "Corporate Professional",
    prompt:
      "Transform this photo into a polished corporate professional headshot portrait. Use a clean, solid neutral gray or soft blue gradient background. Apply professional studio lighting with soft key light and subtle fill. Frame as a tight head-and-shoulders crop. Maintain the person's EXACT face, features, skin tone, hair, and likeness — do not alter their appearance. The result should look like a high-end LinkedIn or company website headshot. High resolution, sharp focus on the eyes.",
  },
  {
    key: "creative",
    label: "Creative Professional",
    prompt:
      "Transform this photo into a creative professional headshot portrait. Use a warm-toned, soft gradient background (subtle amber to cream). Apply modern editorial-style lighting — slightly dramatic with gentle shadows. Frame as a head-and-shoulders crop with a confident, approachable look. Maintain the person's EXACT face, features, skin tone, hair, and likeness — do not alter their appearance. The result should feel stylish and contemporary, like a tech company or startup team page photo. High resolution, sharp focus.",
  },
  {
    key: "casual",
    label: "Casual Professional",
    prompt:
      "Transform this photo into a casual yet professional headshot portrait. Use a clean, simple white or light background. Apply natural, soft daylight-style lighting that feels warm and approachable. Frame as a head-and-shoulders crop with a friendly, relaxed expression. Maintain the person's EXACT face, features, skin tone, hair, and likeness — do not alter their appearance. The result should feel natural and genuine, like a professional yet approachable profile photo. High resolution, sharp focus.",
  },
] as const;

// ============================================
// Generate a single headshot variant via Gemini
// ============================================

async function generateHeadshot(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: ["Text", "Image"],
      },
    });

    // Find the image part in the response
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          mimeType: part.inlineData.mimeType || "image/png",
          data: part.inlineData.data,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Headshot generation failed:", error);
    return null;
  }
}

// ============================================
// Fallback: Sharp-based basic enhancement
// ============================================

async function enhanceWithSharp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(600, 600, { fit: "cover", position: "attention" })
    .modulate({ brightness: 1.05, saturation: 1.05 })
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// ============================================
// POST Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    const { profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate image type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload JPG, PNG, or WebP." },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const imageBase64 = buffer.toString("base64");

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "uploads", "photos");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");

    // Save original as 600x600 JPEG
    const originalBuffer = await sharp(buffer)
      .resize(600, 600, { fit: "cover", position: "attention" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    const originalFilename = `${timestamp}-original-${safeName.replace(/\.\w+$/, ".jpg")}`;
    await writeFile(path.join(uploadDir, originalFilename), originalBuffer);
    const originalUrl = `/uploads/photos/${originalFilename}`;

    // If no Gemini API key, fall back to Sharp enhancement only
    if (!process.env.GEMINI_API_KEY) {
      const enhancedBuffer = await enhanceWithSharp(buffer);
      const enhancedFilename = `${timestamp}-enhanced-${safeName.replace(/\.\w+$/, ".jpg")}`;
      await writeFile(path.join(uploadDir, enhancedFilename), enhancedBuffer);

      return NextResponse.json({
        success: true,
        original: { url: originalUrl, label: "Original" },
        variants: [
          {
            url: `/uploads/photos/${enhancedFilename}`,
            label: "Enhanced",
            key: "enhanced",
          },
        ],
        message: "AI generation unavailable. Basic enhancement applied.",
      });
    }

    // Generate 3 headshot variants in parallel
    const results = await Promise.allSettled(
      HEADSHOT_STYLES.map((style) =>
        generateHeadshot(imageBase64, file.type, style.prompt)
      )
    );

    // Process results — save successful generations
    const variants: Array<{ url: string; label: string; key: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const style = HEADSHOT_STYLES[i];

      if (result.status === "fulfilled" && result.value) {
        // Decode and save the generated image
        const generatedBuffer = Buffer.from(result.value.data, "base64");

        // Process through Sharp for consistent output (resize + JPEG)
        const processedBuffer = await sharp(generatedBuffer)
          .resize(600, 600, { fit: "cover", position: "attention" })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();

        const filename = `${timestamp}-${style.key}-${safeName.replace(/\.\w+$/, ".jpg")}`;
        await writeFile(path.join(uploadDir, filename), processedBuffer);

        variants.push({
          url: `/uploads/photos/${filename}`,
          label: style.label,
          key: style.key,
        });
      } else {
        console.error(
          `Headshot generation failed for style "${style.key}":`,
          result.status === "rejected" ? result.reason : "No image returned"
        );
      }
    }

    // If all generations failed, fall back to Sharp enhancement
    if (variants.length === 0) {
      const enhancedBuffer = await enhanceWithSharp(buffer);
      const enhancedFilename = `${timestamp}-enhanced-${safeName.replace(/\.\w+$/, ".jpg")}`;
      await writeFile(path.join(uploadDir, enhancedFilename), enhancedBuffer);

      return NextResponse.json({
        success: true,
        original: { url: originalUrl, label: "Original" },
        variants: [
          {
            url: `/uploads/photos/${enhancedFilename}`,
            label: "Enhanced",
            key: "enhanced",
          },
        ],
        message:
          "AI headshot generation was unavailable. A basic enhancement has been applied instead.",
      });
    }

    return NextResponse.json({
      success: true,
      original: { url: originalUrl, label: "Original" },
      variants,
    });
  } catch (error: unknown) {
    const authResult = handleAuthError(error);
    if (authResult.status !== 500) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    console.error("Photo upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload photo",
      },
      { status: 500 }
    );
  }
}
