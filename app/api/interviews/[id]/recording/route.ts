import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { recordSLOEvent } from "@/lib/slo-monitor";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const contentType = req.headers.get("content-type") || "";

  // Handle JSON finalization requests
  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (body.action === "finalize") {
      const mockS3Url = `https://r2.storage.paraform.com/interviews/${id}/recording.webm`;
      await prisma.interview.update({
        where: { id },
        data: {
          recordingUrl: mockS3Url,
        },
      });
      return Response.json({ success: true, url: mockS3Url }, { status: 202 });
    }
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  // Handle multipart chunk upload
  const formData = await req.formData();
  const accessToken = formData.get("accessToken");

  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.accessToken !== accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chunk = formData.get("chunk") as Blob | null;
  const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
  const clientChecksum = formData.get("checksum") as string | null;

  if (!chunk) {
    return Response.json({ error: "Missing chunk data" }, { status: 400 });
  }

  // SHA-256 checksum verification if client provides one
  if (clientChecksum) {
    const buffer = Buffer.from(await chunk.arrayBuffer());
    const serverChecksum = createHash("sha256").update(buffer).digest("hex");
    if (serverChecksum !== clientChecksum) {
      console.warn(`[Recording] Checksum mismatch for interview=${id} chunk=${chunkIndex}: client=${clientChecksum} server=${serverChecksum}`);
      await recordSLOEvent("recording.upload.success_rate", false);
      return Response.json(
        { error: "Checksum mismatch — chunk corrupted in transit", expected: clientChecksum, actual: serverChecksum },
        { status: 422 }
      );
    }
  }

  // In a real implementation: upload chunk to R2 / S3
  const mockS3Url = `https://r2.storage.paraform.com/interviews/${id}/chunk-${chunkIndex}.webm`;

  await prisma.interview.update({
    where: { id },
    data: { recordingUrl: mockS3Url },
  });

  await recordSLOEvent("recording.upload.success_rate", true);

  return Response.json({
    success: true,
    url: mockS3Url,
    chunkIndex,
    verified: !!clientChecksum,
  });
}
