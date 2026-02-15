import https from "https";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

export type ApolloCompanyData = {
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
 * Extracts domain from LinkedIn company URL by looking up the company's website
 * This is a helper that tries common patterns
 */
function extractDomainGuess(linkedinUrl: string): string | null {
  // Extract the company slug from LinkedIn URL
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^/]+)/);
  if (!match) return null;

  const slug = match[1];

  // Common patterns for domain guessing (will be verified by Apollo)
  // Remove common suffixes like -inc, -corp, -llc
  const cleanSlug = slug
    .replace(/-inc$/, '')
    .replace(/-corp$/, '')
    .replace(/-llc$/, '')
    .replace(/-ltd$/, '');

  return `${cleanSlug}.com`;
}

/**
 * Fetches company data from Apollo.io Organization Enrichment API
 * https://docs.apollo.io/reference/organization-enrichment
 */
async function fetchApolloCompanyData(domain: string): Promise<any> {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY not configured. Please add it to your .env file.");
  }

  const path = `/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`;
  console.log(`📡 Calling Apollo.io Organization Enrichment API for domain: ${domain}`);

  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'api.apollo.io',
      port: null,
      path: path,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY!,
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
          console.error(`❌ Apollo API HTTP Error ${res.statusCode}:`, bodyString);
          reject(new Error(`Apollo API error ${res.statusCode}: ${bodyString}`));
          return;
        }

        try {
          const jsonData = JSON.parse(bodyString);
          console.log("📦 Apollo API Response:", JSON.stringify(jsonData, null, 2));
          resolve(jsonData);
        } catch (error) {
          console.error(`❌ Failed to parse Apollo response:`, bodyString);
          reject(error);
        }
      });
    });

    req.on('error', function (error) {
      console.error('❌ Apollo API Request Error:', error);
      reject(error);
    });

    req.end();
  });
}

/**
 * Imports company data from Apollo.io using the company's domain
 */
export async function importCompanyFromApollo(
  linkedinUrl: string,
  providedDomain?: string
): Promise<ApolloCompanyData> {
  let domain: string;
  let normalizedUrl: string = "";

  // If domain is provided, use it directly
  if (providedDomain) {
    domain = providedDomain;
    console.log(`🔍 Using provided domain: ${domain}`);
    if (linkedinUrl) {
      normalizedUrl = normalizeLinkedInCompanyUrl(linkedinUrl);
    }
  } else {
    // Normalize the LinkedIn URL
    normalizedUrl = normalizeLinkedInCompanyUrl(linkedinUrl);
    console.log(`🔗 Normalized LinkedIn Company URL: ${linkedinUrl} → ${normalizedUrl}`);

    // Extract company slug for domain guessing
    const guessDomain = extractDomainGuess(normalizedUrl);

    if (!guessDomain) {
      throw new Error("Could not extract company information from LinkedIn URL");
    }

    domain = guessDomain;
    console.log(`🔍 Attempting to fetch company data with guessed domain: ${domain}`);
  }

  // Fetch company data from Apollo
  const apolloData = await fetchApolloCompanyData(domain);

  if (!apolloData || !apolloData.organization) {
    throw new Error("No company data returned from Apollo API");
  }

  const org = apolloData.organization;

  // Format headquarters from primary location
  let headquarters: string | null = null;
  if (org.primary_phone && org.primary_phone.city && org.primary_phone.country) {
    headquarters = `${org.primary_phone.city}, ${org.primary_phone.state || ''}, ${org.primary_phone.country}`.replace(/,\s*,/, ',').trim();
  }

  // Parse employee count
  let employeeCount: number | null = null;
  if (org.estimated_num_employees) {
    employeeCount = org.estimated_num_employees;
  }

  // Parse founded year
  let foundedYear: number | null = null;
  if (org.founded_year) {
    foundedYear = org.founded_year;
  }

  // Format company size range
  let companySize: string | null = null;
  if (org.employee_range_min && org.employee_range_max) {
    companySize = `${org.employee_range_min}-${org.employee_range_max}`;
  } else if (org.estimated_num_employees) {
    // Create a range based on estimated count
    const count = org.estimated_num_employees;
    if (count < 50) companySize = "1-50";
    else if (count < 200) companySize = "50-200";
    else if (count < 500) companySize = "200-500";
    else if (count < 1000) companySize = "500-1000";
    else if (count < 5000) companySize = "1000-5000";
    else companySize = "5000+";
  }

  return {
    name: org.name || "Unknown Company",
    industry: org.industry || org.keywords?.[0] || null,
    companySize,
    website: org.website_url || org.domain || null,
    description: org.short_description || null,
    linkedinUrl: org.linkedin_url || normalizedUrl,
    linkedinId: org.linkedin_url?.match(/company\/([^/]+)/)?.[1] || null,
    companyLogoCdnUrl: org.logo_url || null, // Apollo provides logo URLs
    employeeCount,
    foundedYear,
    headquarters,
    specialties: org.keywords || null,
  };
}
