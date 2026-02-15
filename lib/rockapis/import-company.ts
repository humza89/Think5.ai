import { z } from "zod";
import { storeRemoteImageToCdn } from "@/lib/asset-store";
import slugify from "slugify";

const ROCKAPIS_API_KEY = process.env.ROCKAPIS_API_KEY;

export type RockAPIsCompanyData = {
  name: string;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  description: string | null;
  linkedinUrl: string;
  linkedinId: string | null;
  companyLogoCdnUrl: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  headquarters: string | null;
  specialties: string[] | null;
};

// Define the expected schema from RockAPIs Company Profile endpoint
const RockAPIsCompanySchema = z.object({
  success: z.boolean(),
  data: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    logo: z.string().optional(),
    website: z.string().optional(),
    industry: z.string().optional(),
    companySize: z.string().optional(),
    specialties: z.array(z.string()).optional(),
    headquarters: z.object({
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    }).optional(),
    foundedYear: z.number().optional(),
    followerCount: z.number().optional(),
    employeeCountOnLinkedIn: z.number().optional(),
    url: z.string().optional(),
  }).optional(),
});

/**
 * Normalizes a LinkedIn company URL to ensure it has the proper format
 */
function normalizeLinkedInCompanyUrl(url: string): string {
  url = url.trim();

  // If it already starts with http:// or https://, validate and return
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url.replace(/^(https?:\/\/)(linkedin\.com)/, '$1www.$2');
  }

  // If it starts with www., add https://
  if (url.startsWith('www.')) {
    return `https://${url}`;
  }

  // If it starts with linkedin.com, add https://www.
  if (url.startsWith('linkedin.com')) {
    return `https://www.${url}`;
  }

  // If it's just the path (e.g., "company/username"), add full domain
  if (url.startsWith('company/')) {
    return `https://www.linkedin.com/${url}`;
  }

  // Otherwise assume it's a malformed URL and try to fix it
  return `https://www.linkedin.com/${url.replace(/^\/+/, '')}`;
}

/**
 * Fetches company data from RockAPIs Company Profile API
 * https://rockapis.com/docs/linkedin-company-profile-api
 */
async function fetchRockAPIsCompanyData(linkedinUrl: string): Promise<any> {
  if (!ROCKAPIS_API_KEY) {
    throw new Error("ROCKAPIS_API_KEY not configured. Please add it to your .env file.");
  }

  const apiUrl = `https://api.rockapis.com/v1/linkedin/company?url=${encodeURIComponent(linkedinUrl)}`;
  console.log(`📡 Calling RockAPIs Company Profile API for URL: ${linkedinUrl}`);

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'x-api-key': ROCKAPIS_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ RockAPIs API HTTP Error ${response.status}:`, errorText);
    throw new Error(`RockAPIs API error ${response.status}: ${errorText}`);
  }

  const jsonData = await response.json();
  console.log("📦 RockAPIs Company API Response:", JSON.stringify(jsonData, null, 2));

  return jsonData;
}

/**
 * Imports company data from RockAPIs using the company's LinkedIn URL
 */
export async function importCompanyFromRockAPIs(
  linkedinUrl: string
): Promise<RockAPIsCompanyData> {
  // Normalize the LinkedIn URL
  const normalizedUrl = normalizeLinkedInCompanyUrl(linkedinUrl);
  console.log(`🔗 Normalized LinkedIn Company URL: ${linkedinUrl} → ${normalizedUrl}`);

  // Fetch company data from RockAPIs
  const rockAPIsResponse = await fetchRockAPIsCompanyData(normalizedUrl);

  // Validate the response
  const parsedResponse = RockAPIsCompanySchema.safeParse(rockAPIsResponse);

  if (!parsedResponse.success) {
    console.error("❌ Invalid RockAPIs response format:", parsedResponse.error);
    throw new Error("Invalid response format from RockAPIs");
  }

  if (!parsedResponse.data.success || !parsedResponse.data.data) {
    throw new Error("No company data returned from RockAPIs");
  }

  const company = parsedResponse.data.data;

  // Extract LinkedIn ID from URL
  const linkedinIdMatch = (company.url || normalizedUrl).match(/linkedin\.com\/company\/([^/]+)/);
  const linkedinId = linkedinIdMatch ? linkedinIdMatch[1] : null;

  // Format headquarters
  let headquarters: string | null = null;
  if (company.headquarters) {
    const parts = [
      company.headquarters.city,
      company.headquarters.state,
      company.headquarters.country,
    ].filter(Boolean);
    headquarters = parts.length > 0 ? parts.join(', ') : null;
  }

  // Format company size
  let companySize: string | null = null;
  if (company.companySize) {
    companySize = company.companySize;
  } else if (company.employeeCountOnLinkedIn) {
    // Create a range based on employee count
    const count = company.employeeCountOnLinkedIn;
    if (count < 50) companySize = "1-50";
    else if (count < 200) companySize = "50-200";
    else if (count < 500) companySize = "200-500";
    else if (count < 1000) companySize = "500-1000";
    else if (count < 5000) companySize = "1000-5000";
    else companySize = "5000+";
  }

  // Store logo in CDN if available
  let companyLogoCdnUrl: string | null = null;
  if (company.logo) {
    try {
      const slug = slugify(company.name || linkedinId || "company", {
        lower: true,
        strict: true,
      });
      companyLogoCdnUrl = await storeRemoteImageToCdn({
        url: company.logo,
        keyHint: `logos/${slug}`,
      });
    } catch (error) {
      console.error("Failed to store company logo in CDN:", error);
      // Continue without logo rather than failing completely
    }
  }

  return {
    name: company.name || "Unknown Company",
    industry: company.industry || null,
    companySize,
    website: company.website || null,
    description: company.description || null,
    linkedinUrl: company.url || normalizedUrl,
    linkedinId,
    companyLogoCdnUrl,
    employeeCount: company.employeeCountOnLinkedIn || null,
    foundedYear: company.foundedYear || null,
    headquarters,
    specialties: company.specialties || null,
  };
}
