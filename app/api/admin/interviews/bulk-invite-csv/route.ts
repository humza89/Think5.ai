/**
 * CSV Bulk Invite — Server-side CSV parsing for enterprise bulk operations.
 * Accepts multipart/form-data with a .csv file.
 */

import { NextRequest } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-log";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 500;

interface CSVCandidate {
  email: string;
  name: string;
  phone?: string;
  linkedinUrl?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.replace(/^["']|["']$/g, ""));
  return fields;
}

function parseCSV(text: string): CSVCandidate[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  const emailIdx = headers.findIndex(h => ["email", "email_address", "e-mail"].includes(h));
  const nameIdx = headers.findIndex(h => ["name", "full_name", "candidate_name"].includes(h));
  if (emailIdx === -1) throw new Error("CSV must have an 'email' column");
  if (nameIdx === -1) throw new Error("CSV must have a 'name' column");

  const phoneIdx = headers.findIndex(h => ["phone", "phone_number"].includes(h));
  const linkedinIdx = headers.findIndex(h => ["linkedin", "linkedin_url", "linkedin_profile"].includes(h));

  const candidates: CSVCandidate[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const email = fields[emailIdx]?.trim();
    const name = fields[nameIdx]?.trim();
    if (!email || !name) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    candidates.push({
      email, name,
      phone: phoneIdx >= 0 ? fields[phoneIdx]?.trim() : undefined,
      linkedinUrl: linkedinIdx >= 0 ? fields[linkedinIdx]?.trim() : undefined,
    });
  }
  return candidates;
}

export async function POST(request: NextRequest) {
  let authUser: { id: string; role: string };
  try {
    const { profile } = await requireRole(["admin", "recruiter"]);
    authUser = { id: profile.id, role: profile.role };
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const templateId = formData.get("templateId") as string | null;

    if (!file) return Response.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "File too large (max 5MB)" }, { status: 400 });
    if (!file.name.endsWith(".csv")) return Response.json({ error: "Only .csv files accepted" }, { status: 400 });

    const text = await file.text();
    const candidates = parseCSV(text);
    if (candidates.length === 0) return Response.json({ error: "No valid candidates in CSV" }, { status: 400 });
    if (candidates.length > MAX_ROWS) return Response.json({ error: `Too many rows (${candidates.length}). Max ${MAX_ROWS}` }, { status: 400 });

    // Forward to existing bulk-invite endpoint
    const bulkUrl = new URL("/api/admin/interviews/bulk-invite", request.url);
    const response = await fetch(bulkUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": request.headers.get("cookie") || "",
        "x-csrf-token": request.headers.get("x-csrf-token") || "",
      },
      body: JSON.stringify({ candidates, templateId }),
    });

    const result = await response.json();

    await logActivity({
      userId: authUser.id,
      userRole: authUser.role,
      action: "bulk_invite_csv",
      entityType: "interview",
      entityId: "bulk",
      metadata: { candidateCount: candidates.length, fileName: file.name },
    });

    return Response.json({ ...result, parsed: candidates.length, source: "csv" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV processing failed";
    logger.error("[bulk-invite-csv] Failed", err);
    return Response.json({ error: message }, { status: 400 });
  }
}
