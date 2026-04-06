import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    logger.info("[web-vitals]", {
      name: data.name,
      value: data.value,
      rating: data.rating,
      page: data.page,
    });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
