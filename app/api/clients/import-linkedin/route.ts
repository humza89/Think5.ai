import { NextRequest, NextResponse } from "next/server";
import { importCompanyFromApollo } from "@/lib/apollo/import-company";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireRole(["recruiter", "admin"]);

    const body = await request.json();
    const { linkedinUrl, domain } = body;

    if (!linkedinUrl && !domain) {
      return NextResponse.json(
        { error: "Either LinkedIn URL or company domain is required" },
        { status: 400 }
      );
    }

    // If domain is provided, use it directly with Apollo
    if (domain) {
      console.log(`🔄 Importing company data using provided domain: ${domain}`);
      try {
        const companyData = await importCompanyFromApollo(linkedinUrl ||  "", domain);
        console.log("✅ Successfully imported company data using domain");
        return NextResponse.json(companyData);
      } catch (error: any) {
        console.error("❌ Domain-based import failed:", error.message);
        return NextResponse.json(
          { error: error.message || "Failed to import company data using domain" },
          { status: 500 }
        );
      }
    }

    // Otherwise, try to import using LinkedIn URL
    try {
      console.log("🔄 Attempting to import company data from LinkedIn URL...");
      const companyData = await importCompanyFromApollo(linkedinUrl);
      console.log("✅ Successfully imported company data from LinkedIn URL");
      return NextResponse.json(companyData);
    } catch (error: any) {
      console.error("❌ LinkedIn URL import failed:", error.message);
      // Return the error with a flag indicating the user should provide a domain
      return NextResponse.json(
        {
          error: error.message || "Failed to import company data from LinkedIn URL",
          suggestion: "Please provide the company's website domain manually"
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    const authResult = handleAuthError(error);
    if (authResult.status !== 500) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    console.error("Company import error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to import company data" },
      { status: 500 }
    );
  }
}
