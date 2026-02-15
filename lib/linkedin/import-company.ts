import { z } from "zod";
import slugify from "slugify";
import https from "https";

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "fresh-linkedin-profile-data.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Schema for LinkedIn Search Results (to find employees)
const SearchSchema = z.object({
  message: z.string(),
  data: z.object({
    results: z.array(z.object({
      linkedin_url: z.string(),
      full_name: z.string().optional(),
      headline: z.string().optional(),
    })).optional(),
  }).optional(),
});

// Schema for extracting company data from a profile
const ProfileCompanySchema = z.object({
  message: z.string(),
  data: z.object({
    company: z.string().optional().nullable(),
    company_description: z.string().optional().nullable(),
    company_domain: z.string().optional().nullable(),
    company_employee_count: z.number().optional().nullable(),
    company_employee_range: z.string().optional().nullable(),
    company_industry: z.string().optional().nullable(),
    company_linkedin_url: z.string().optional().nullable(),
    company_logo_url: z.string().optional().nullable(),
    company_website: z.string().optional().nullable(),
    company_year_founded: z.string().optional().nullable(),
  }).optional().nullable(),
});

export type LinkedInCompanyData = {
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
 * Searches for people at a company to extract company data from their profile
 */
async function searchPeopleAtCompany(companyUrl: string): Promise<any> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  // Extract company name from URL for search
  const companySlug = companyUrl.match(/linkedin\.com\/company\/([^/]+)/)?.[1];
  if (!companySlug) {
    throw new Error("Invalid LinkedIn company URL");
  }

  const path = `/search-people`;
  console.log(`📡 Searching for people at company: ${companyUrl}`);

  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      hostname: RAPIDAPI_HOST,
      port: null,
      path: path,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, function (res) {
      const chunks: Buffer[] = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        const body = Buffer.concat(chunks);
        const bodyString = body.toString();

        if (res.statusCode && res.statusCode >= 400) {
          console.error(`❌ LinkedIn People Search API HTTP Error ${res.statusCode}:`, bodyString);
          reject(new Error(`LinkedIn People Search API error ${res.statusCode}: ${bodyString}`));
          return;
        }

        try {
          const jsonData = JSON.parse(bodyString);
          console.log("📦 LinkedIn People Search Response:", JSON.stringify(jsonData, null, 2).substring(0, 500));
          resolve(jsonData);
        } catch (error) {
          console.error(`❌ Failed to parse response:`, bodyString);
          reject(error);
        }
      });
    });

    req.on('error', function (error) {
      console.error('❌ LinkedIn People Search API Request Error:', error);
      reject(error);
    });

    // Search for people at this company
    const searchPayload = {
      current_company_linkedin_url: [companyUrl],
      limit: 1
    };

    console.log("📤 Search payload:", JSON.stringify(searchPayload));
    req.write(JSON.stringify(searchPayload));
    req.end();
  });
}

/**
 * Fetches a LinkedIn profile to extract company data
 */
async function fetchProfileForCompanyData(profileUrl: string): Promise<z.infer<typeof ProfileCompanySchema>> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  const params = new URLSearchParams({
    linkedin_url: profileUrl,
    include_skills: 'false',
    include_certifications: 'false',
  });

  const path = `/enrich-lead?${params.toString()}`;
  console.log(`📡 Fetching profile for company data: ${profileUrl}`);

  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: RAPIDAPI_HOST,
      port: null,
      path: path,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': RAPIDAPI_HOST,
      }
    };

    const req = https.request(options, function (res) {
      const chunks: Buffer[] = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        const body = Buffer.concat(chunks);
        const bodyString = body.toString();

        if (res.statusCode && res.statusCode >= 400) {
          console.error(`❌ LinkedIn Profile API HTTP Error ${res.statusCode}:`, bodyString);
          reject(new Error(`LinkedIn Profile API error ${res.statusCode}: ${bodyString}`));
          return;
        }

        try {
          const jsonData = JSON.parse(bodyString);
          console.log("📦 Profile Company Data:", JSON.stringify(jsonData.data?.company_description?.substring(0, 100), null, 2));
          const parsed = ProfileCompanySchema.parse(jsonData);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', function (error) {
      console.error('❌ LinkedIn Profile API Request Error:', error);
      reject(error);
    });

    req.end();
  });
}

/**
 * Fetches company data by finding an employee and extracting company info from their profile
 */
async function fetchLinkedInCompanyData(linkedinUrl: string) {
  // Extract company username from LinkedIn URL
  const username = linkedinUrl.match(/linkedin\.com\/company\/([^/]+)/)?.[1];
  if (!username) {
    throw new Error("Invalid LinkedIn company URL format. Expected format: linkedin.com/company/username");
  }

  console.log(`🔍 Fetching company data from LinkedIn: ${linkedinUrl}`);

  // Step 1: Search for people at this company
  const searchResults = await searchPeopleAtCompany(linkedinUrl);

  if (!searchResults.data || !Array.isArray(searchResults.data) || searchResults.data.length === 0) {
    throw new Error("No employees found for this company. Unable to extract company data.");
  }

  // Step 2: Get the first employee's LinkedIn URL
  const firstEmployee = searchResults.data[0];
  console.log(`✅ Found employee: ${firstEmployee.full_name || firstEmployee.name || 'Unknown'}`);

  if (!firstEmployee.linkedin_url) {
    throw new Error("Employee profile does not have a LinkedIn URL");
  }

  // Step 3: Fetch the employee's full profile to get company data
  const profileData = await fetchProfileForCompanyData(firstEmployee.linkedin_url);

  if (!profileData.data) {
    throw new Error("Failed to extract company data from employee profile");
  }

  console.log(`✅ Extracted company data: ${profileData.data.company || 'Unknown'}`);

  return profileData.data;
}

export async function importLinkedInCompany(
  url: string
): Promise<LinkedInCompanyData> {
  // Normalize the URL first
  const normalizedUrl = normalizeLinkedInCompanyUrl(url);
  console.log(`🔗 Normalized LinkedIn Company URL: ${url} → ${normalizedUrl}`);

  const companyData = await fetchLinkedInCompanyData(normalizedUrl);

  if (!companyData) {
    throw new Error("No company data returned from API");
  }

  // Parse employee count - it might be a range like "11-50"
  let employeeCount: number | null = null;
  if (companyData.employee_count) {
    // If it's a number, use it directly
    if (typeof companyData.employee_count === 'number') {
      employeeCount = companyData.employee_count;
    } else if (typeof companyData.employee_count === 'string') {
      // If it's a range like "11-50", extract the max value
      const match = companyData.employee_count.match(/(\d+)-(\d+)/);
      if (match) {
        employeeCount = parseInt(match[2]); // Use upper bound
      } else {
        const parsed = parseInt(companyData.employee_count);
        if (!isNaN(parsed)) {
          employeeCount = parsed;
        }
      }
    }
  }

  // Parse founded year
  let foundedYear: number | null = null;
  if (companyData.founded_year) {
    const parsed = parseInt(companyData.founded_year.toString());
    if (!isNaN(parsed)) {
      foundedYear = parsed;
    }
  }

  // Format headquarters from location data
  let headquarters: string | null = null;
  if (companyData.headquarters) {
    if (typeof companyData.headquarters === 'string') {
      headquarters = companyData.headquarters;
    } else if (companyData.headquarters.city || companyData.headquarters.country) {
      const parts = [
        companyData.headquarters.city,
        companyData.headquarters.state,
        companyData.headquarters.country
      ].filter(Boolean);
      headquarters = parts.join(', ');
    }
  }

  // Use LinkedIn CDN URL directly (as requested - no local storage)
  const companyLogoCdnUrl = companyData.logo_url || companyData.logo || null;

  return {
    name: companyData.name || companyData.company_name || "Unknown Company",
    industry: companyData.industry || companyData.industries?.[0] || null,
    companySize: companyData.employee_count_range || companyData.company_size || null,
    website: companyData.website || companyData.website_url || null,
    description: companyData.description || companyData.tagline || null,
    linkedinUrl: companyData.linkedin_url || normalizedUrl,
    linkedinId: (companyData.linkedin_url || normalizedUrl).match(/company\/([^/]+)/)?.[1] || null,
    companyLogoCdnUrl, // Using LinkedIn's CDN URL directly
    employeeCount,
    foundedYear,
    headquarters,
    specialties: companyData.specialties || null,
  };
}
