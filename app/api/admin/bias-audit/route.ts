import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { generateBiasAuditExport, BiasAuditRecord } from "@/lib/bias-audit";

function toCsv(records: BiasAuditRecord[]): string {
  const headers = [
    "interviewDate",
    "interviewType",
    "overallScore",
    "recommendation",
    "domainExpertise",
    "problemSolving",
    "communicationScore",
    "scorerModelVersion",
  ];

  const rows = records.map(r =>
    headers.map(h => {
      const value = r[h as keyof BiasAuditRecord];
      if (value === null || value === undefined) return "";
      const str = String(value);
      // Escape CSV values containing commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const format = searchParams.get("format") || "json";

    const options: { startDate?: Date; endDate?: Date } = {};
    if (startDateParam) options.startDate = new Date(startDateParam);
    if (endDateParam) options.endDate = new Date(endDateParam);

    // Validate dates
    if (options.startDate && isNaN(options.startDate.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    if (options.endDate && isNaN(options.endDate.getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }

    const records = await generateBiasAuditExport(options);

    if (format === "csv") {
      const csv = toCsv(records);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bias-audit-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ records, total: records.length });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
