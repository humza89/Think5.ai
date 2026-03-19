import sharp from "sharp";
import path from "path";

// ============================================
// UltraFace ONNX Face Detection (optional — unavailable on Vercel serverless)
// ============================================

let ort: typeof import("onnxruntime-node") | null = null;
try {
  ort = require("onnxruntime-node");
} catch {
  // onnxruntime-node not available (e.g. Vercel serverless) — face detection disabled
}

const MODEL_PATH = path.join(process.cwd(), "lib", "models", "ultraface-320.onnx");
const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 240;
const CONFIDENCE_THRESHOLD = 0.7;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null;

async function getSession() {
  if (!ort) return null;
  if (!session) {
    session = await ort.InferenceSession.create(MODEL_PATH);
  }
  return session;
}

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
// Face Detection
// ============================================

export async function detectFace(imageBuffer: Buffer): Promise<FaceBox | null> {
  if (!ort) return null; // ONNX runtime not available

  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width ?? 800;
  const imgH = metadata.height ?? 800;

  // Preprocess: resize to 320x240, get raw RGB pixels
  const rawPixels = await sharp(imageBuffer)
    .resize(INPUT_WIDTH, INPUT_HEIGHT, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Convert to float32 NCHW format, normalize to [-1, 1]
  const float32Data = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < INPUT_HEIGHT; h++) {
      for (let w = 0; w < INPUT_WIDTH; w++) {
        const srcIdx = (h * INPUT_WIDTH + w) * 3 + c;
        const dstIdx = c * INPUT_HEIGHT * INPUT_WIDTH + h * INPUT_WIDTH + w;
        float32Data[dstIdx] = (rawPixels[srcIdx] - 127) / 128;
      }
    }
  }

  const inputTensor = new ort.Tensor("float32", float32Data, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);

  const sess = await getSession();
  if (!sess) return null;
  const results = await sess.run({ input: inputTensor });

  // UltraFace outputs: scores [1, 4420, 2], boxes [1, 4420, 4]
  const scores = results["scores"].data as Float32Array;
  const boxes = results["boxes"].data as Float32Array;
  const numBoxes = scores.length / 2;

  let bestFace: FaceBox | null = null;
  let bestScore = 0;

  for (let i = 0; i < numBoxes; i++) {
    const confidence = scores[i * 2 + 1]; // face score
    if (confidence > CONFIDENCE_THRESHOLD && confidence > bestScore) {
      bestScore = confidence;
      // Boxes are normalized [0, 1] in x1, y1, x2, y2 format
      const x1 = boxes[i * 4] * imgW;
      const y1 = boxes[i * 4 + 1] * imgH;
      const x2 = boxes[i * 4 + 2] * imgW;
      const y2 = boxes[i * 4 + 3] * imgH;
      bestFace = {
        x: Math.round(x1),
        y: Math.round(y1),
        width: Math.round(x2 - x1),
        height: Math.round(y2 - y1),
        confidence,
      };
    }
  }

  return bestFace;
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

  if (face) {
    // Compute square crop from face box
    // cropSize ~2.5x face height for a chest-up portrait
    const cropSize = Math.round(
      Math.min(
        Math.max(face.width, face.height) * 2.5,
        Math.min(imgW, imgH)
      )
    );

    // Center horizontally on face
    const cx = face.x + face.width / 2;
    // Eyes are ~35% down from top of face box
    const eyeY = face.y + face.height * 0.35;
    // Place eyes slightly above center of crop (~8% above)
    const cy = eyeY + cropSize * 0.08;

    let left = Math.round(cx - cropSize / 2);
    let top = Math.round(cy - cropSize / 2);

    // Clamp to image bounds
    left = Math.max(0, Math.min(left, imgW - cropSize));
    top = Math.max(0, Math.min(top, imgH - cropSize));

    return sharp(buffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .resize(outputSize, outputSize)
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }

  // Fallback 1: sharp attention-based crop
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
    // Fallback 2: center crop
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
