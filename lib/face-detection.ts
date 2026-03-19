import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";

// ============================================
// Types
// ============================================

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

// ============================================
// Face Detection using Gemini Flash
// ============================================

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Uses Gemini 2.5 Flash to rapidly detect the main face bounding box.
 * This completely bypasses native binary limitations on Vercel Serverless.
 */
export async function detectFace(imageBuffer: Buffer): Promise<FaceBox | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("No GEMINI_API_KEY. Skipping face detection.");
    return null;
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const imgW = metadata.width ?? 800;
    const imgH = metadata.height ?? 800;

    // Convert to a compressed internal JPEG to save bandwidth & latency mapping bounding boxes
    const optimizedBuffer = await sharp(imageBuffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64 = optimizedBuffer.toString("base64");
    const prompt = `Return exclusively a JSON object with a single key "face" representing the person's face bounding box (chin to forehead, ear to ear). The value MUST be an array [ymin, xmin, ymax, xmax] using normalized coordinates 0-1000. Do not include markdown formatting or extra text.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.1,
      },
    });

    const text = response.text || "";
    // Clean potential markdown blocks
    const cleanText = text.replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleanText);

    if (parsed && Array.isArray(parsed.face) && parsed.face.length === 4) {
      const [yminRaw, xminRaw, ymaxRaw, xmaxRaw] = parsed.face;

      // Convert normalized [0, 1000] coords to actual image dimensions
      const ymin = (yminRaw / 1000) * imgH;
      const xmin = (xminRaw / 1000) * imgW;
      const ymax = (ymaxRaw / 1000) * imgH;
      const xmax = (xmaxRaw / 1000) * imgW;

      return {
        x: Math.round(xmin),
        y: Math.round(ymin),
        width: Math.round(xmax - xmin),
        height: Math.round(ymax - ymin),
        confidence: 0.99,
      };
    }

    console.warn("Unexpected Gemini bounding box format:", text);
    return null;
  } catch (err) {
    console.error("Gemini face detection failed:", err);
    return null;
  }
}

// ============================================
// Portrait Crop from Face Box
// ============================================

export async function portraitCrop(
  buffer: Buffer,
  outputSize: number = 800
): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const imgW = metadata.width ?? 800;
  const imgH = metadata.height ?? 800;

  const face = await detectFace(buffer);

  if (face && face.width > 0 && face.height > 0) {
    // A good starting heuristic for deterministic LinkedIn-style chest-up framing:
    // cropSize = max(faceWidth, faceHeight) * 2.5
    const cropSize = Math.round(
      Math.min(
        Math.max(face.width, face.height) * 2.5,
        Math.min(imgW, imgH) // don't exceed image bounds
      )
    );

    // Center horizontally on the face
    const cx = face.x + face.width / 2;
    // Shift vertically a bit upward so the eyes sit slightly above center
    // Anchor center Y slightly below the actual face center
    const faceCenterY = face.y + face.height / 2;
    const cy = faceCenterY + face.height * 0.15;

    let left = Math.round(cx - cropSize / 2);
    let top = Math.round(cy - cropSize / 2);

    // Clamp to image bounds to prevent sharp extraction errors
    left = Math.max(0, Math.min(left, imgW - cropSize));
    top = Math.max(0, Math.min(top, imgH - cropSize));

    return sharp(buffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .resize(outputSize, outputSize)
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }

  // Fallback 1: sharp attention-based crop (heuristic)
  try {
    return await sharp(buffer)
      .resize({
        width: outputSize,
        height: outputSize,
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    // Fallback 2: simple center crop
    const size = Math.min(imgW, imgH);
    const left = Math.round((imgW - size) / 2);
    const top = Math.round((imgH - size) / 2);

    return sharp(buffer)
      .extract({ left, top, width: size, height: size })
      .resize(outputSize, outputSize)
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }
}
