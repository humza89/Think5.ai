import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { getAuthenticatedUser, handleAuthError, AuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

// ============================================
// Gemini Image Generation Client
// ============================================

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const BUCKET = "photos";

// ============================================
// Headshot Style Prompts
// ============================================

const HEADSHOT_BASE =
  "Place the person against a clean, solid light blue gradient background. Dress them in a sharp, well-fitted dark professional suit with a crisp white shirt. Maintain the person's EXACT face, features, skin tone, hair, and likeness — do not alter their appearance. High resolution, sharp focus on the eyes. Frame as a tight head-and-shoulders crop. IMPORTANT POSITIONING: Center the person's face exactly in the horizontal middle of the image with equal spacing on both sides. The head should be in the upper third of the frame. Use a straight-on camera angle — no tilting, no rotation. Keep the same zoom level and framing for every image.";

const HEADSHOT_STYLES = [
  {
    key: "corporate",
    label: "Corporate Professional",
    prompt: `Transform this photo into a polished corporate professional headshot portrait. ${HEADSHOT_BASE} Apply classic professional studio lighting with a soft key light and subtle fill light. The person should have a neutral, confident expression. The result should look like a high-end LinkedIn or company website headshot.`,
  },
  {
    key: "creative",
    label: "Creative Professional",
    prompt: `Transform this photo into a creative professional headshot portrait. ${HEADSHOT_BASE} Apply slightly warmer editorial-style lighting with gentle shadows for depth. The person should have an approachable, confident smile. The result should feel stylish and contemporary, like a tech company or startup team page photo.`,
  },
  {
    key: "casual",
    label: "Casual Professional",
    prompt: `Transform this photo into a casual yet professional headshot portrait. ${HEADSHOT_BASE} Apply soft, natural daylight-style lighting that feels warm and inviting. The person should have a friendly, relaxed expression with a natural smile. The result should feel genuine and approachable, like a modern professional profile photo.`,
  },
] as const;

// ============================================
// Upload buffer to Supabase Storage
// ============================================

async function uploadToSupabase(
  filePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const supabase = await createSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

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
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: ["Text", "Image"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          mimeType: part.inlineData.mimeType || "image/png",
          data: part.inlineData.data,
        };
      }
    }

    console.warn(
      "Gemini returned no image part. Response parts:",
      JSON.stringify(
        parts.map((p) => ({
          text: p.text?.slice(0, 200),
          hasImage: !!p.inlineData,
        }))
      )
    );
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
    .resize(600, 600, { fit: "contain", background: { r: 200, g: 220, b: 240, alpha: 1 } })
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

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");

    // Save original as 600x600 JPEG to Supabase
    const originalBuffer = await sharp(buffer)
      .resize(600, 600, { fit: "contain", background: { r: 200, g: 220, b: 240, alpha: 1 } })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    const originalPath = `headshots/${timestamp}-original-${safeName.replace(/\.\w+$/, ".jpg")}`;
    const originalUrl = await uploadToSupabase(originalPath, originalBuffer, "image/jpeg");

    // If no Gemini API key, fall back to Sharp enhancement only
    if (!process.env.GEMINI_API_KEY) {
      const enhancedBuffer = await enhanceWithSharp(buffer);
      const enhancedPath = `headshots/${timestamp}-enhanced-${safeName.replace(/\.\w+$/, ".jpg")}`;
      const enhancedUrl = await uploadToSupabase(enhancedPath, enhancedBuffer, "image/jpeg");

      return NextResponse.json({
        success: true,
        original: { url: originalUrl, label: "Original" },
        variants: [{ url: enhancedUrl, label: "Enhanced", key: "enhanced" }],
        message: "AI generation unavailable. Basic enhancement applied.",
      });
    }

    // Generate 3 headshot variants in parallel
    const results = await Promise.allSettled(
      HEADSHOT_STYLES.map((style) =>
        generateHeadshot(imageBase64, file.type, style.prompt)
      )
    );

    // Process results — upload successful generations to Supabase
    const variants: Array<{ url: string; label: string; key: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const style = HEADSHOT_STYLES[i];

      if (result.status === "fulfilled" && result.value) {
        const generatedBuffer = Buffer.from(result.value.data, "base64");

        // Process through Sharp for consistent output
        const processedBuffer = await sharp(generatedBuffer)
          .resize(600, 600, { fit: "contain", background: { r: 200, g: 220, b: 240, alpha: 1 } })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();

        const filePath = `headshots/${timestamp}-${style.key}-${safeName.replace(/\.\w+$/, ".jpg")}`;
        const publicUrl = await uploadToSupabase(filePath, processedBuffer, "image/jpeg");

        variants.push({
          url: publicUrl,
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
      const enhancedPath = `headshots/${timestamp}-enhanced-${safeName.replace(/\.\w+$/, ".jpg")}`;
      const enhancedUrl = await uploadToSupabase(enhancedPath, enhancedBuffer, "image/jpeg");

      return NextResponse.json({
        success: true,
        original: { url: originalUrl, label: "Original" },
        variants: [{ url: enhancedUrl, label: "Enhanced", key: "enhanced" }],
        message: "AI headshot generation was unavailable. A basic enhancement has been applied instead.",
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
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    console.error("Photo upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload photo" },
      { status: 500 }
    );
  }
}
