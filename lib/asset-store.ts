import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const mode = process.env.ASSET_STORE || "local";
const bucket = process.env.S3_BUCKET || "";
const region = process.env.S3_REGION || "us-east-1";
const publicBase = process.env.S3_PUBLIC_BASE || "";

const s3Client = new S3Client({ region });

export async function storeRemoteImageToCdn(opts: {
  url: string;
  keyHint: string;
}): Promise<string | null> {
  if (!opts.url) return null;

  try {
    const res = await fetch(opts.url, { redirect: "follow" });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const ext = guessExt(res.headers.get("content-type") || "");
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 16);
    const key = `uploads/${opts.keyHint}-${hash}.${ext}`;

    if (mode === "s3" && bucket) {
      // S3 upload
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: res.headers.get("content-type") || "image/jpeg",
        ACL: "public-read" as any,
      });

      await s3Client.send(command);
      return `${publicBase}/${key}`;
    }

    // Local fallback
    const uploadDir = path.join(process.cwd(), "public/uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filename = `${opts.keyHint.replace(/\//g, "-")}-${hash}.${ext}`;
    const localPath = path.join(uploadDir, filename);
    await writeFile(localPath, buf);

    return `/uploads/${filename}`;
  } catch (error) {
    console.error("Error storing image:", error);
    return null;
  }
}

function guessExt(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}
