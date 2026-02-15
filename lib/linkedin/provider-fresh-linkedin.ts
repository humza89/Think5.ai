/**
 * Fresh LinkedIn Profile Data Provider
 *
 * This module integrates with the Fresh LinkedIn Profile Data API (RapidAPI)
 * to fetch comprehensive LinkedIn profile information.
 *
 * CRITICAL IMPLEMENTATION NOTES:
 * - Uses native Node.js https.request() module, NOT fetch()
 * - fetch() was tested and returns cached/incomplete data from the API
 * - https.request() returns fresh, complete data with all experiences and educations
 * - DO NOT change the HTTP client implementation
 * - Verified working on 2025-11-01
 *
 * API Endpoint: GET /enrich-lead
 * Documentation: https://rapidapi.com/rockapis-rockapis-default/api/fresh-linkedin-profile-data
 */

import { z } from "zod";
import slugify from "slugify";
import https from "https";

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "fresh-linkedin-profile-data.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Schema for Fresh LinkedIn Profile Data API (Enrich Lead endpoint)
const ProfileSchema = z.object({
  message: z.string(),
  data: z.preprocess(
    (data: any) => {
      // Clean up empty strings to null for profile_image_url
      if (data && data.profile_image_url === '') {
        data.profile_image_url = null;
      }
      return data;
    },
    z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      full_name: z.string().optional(),
      headline: z.string().optional().nullable(),
      about: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
      profile_image_url: z.string().url().optional().nullable(),
      public_id: z.string().optional(),
      linkedin_url: z.string().optional(),
      connection_count: z.number().optional(),
      follower_count: z.number().optional(),
      experiences: z.array(z.any()).optional(),
      educations: z.array(z.any()).optional(),
      company: z.string().optional().nullable(),
      company_domain: z.string().optional(),
      company_linkedin_url: z.string().optional().nullable(),
      company_logo_url: z.string().optional().nullable(),
      job_title: z.string().optional().nullable(),
    })
  ).optional(),
});

/**
 * Fetches LinkedIn profile data from Fresh LinkedIn Profile Data API
 *
 * CRITICAL: DO NOT CHANGE THIS IMPLEMENTATION
 * - MUST use native Node.js https.request() module, NOT fetch()
 * - fetch() returns cached/incomplete data from the API
 * - https.request() returns fresh, complete data with all experiences and educations
 * - Tested and verified on 2025-11-01
 *
 * @param linkedinUrl - The LinkedIn profile URL to fetch
 * @returns Parsed profile data with experiences, educations, skills, etc.
 */
async function fetchFreshLinkedInAPI(linkedinUrl: string): Promise<z.infer<typeof ProfileSchema>> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  // Build URL with query parameters (using GET method as per API documentation)
  // DO NOT CHANGE: These parameters are tested and working
  const params = new URLSearchParams({
    linkedin_url: linkedinUrl,
    include_skills: 'true',
    include_certifications: 'true',
    include_publications: 'false',
    include_honors: 'false',
    include_volunteers: 'false',
    include_projects: 'false',
    include_patents: 'false',
    include_courses: 'false',
    include_organizations: 'false',
    include_profile_status: 'false',
    include_company_public_url: 'false',
  });

  const path = `/enrich-lead?${params.toString()}`;
  console.log(`📡 Calling Fresh LinkedIn API (Enrich Lead): ${linkedinUrl}`);

  // CRITICAL: Use native https module instead of fetch()
  // fetch() returns cached/incomplete data, https.request() returns fresh data
  // DO NOT replace with fetch() or axios
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: RAPIDAPI_HOST,
      port: null,
      path: path,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
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
          console.error(`❌ Fresh LinkedIn API HTTP Error ${res.statusCode}:`, bodyString);
          reject(new Error(`Fresh LinkedIn API error ${res.statusCode}: ${bodyString}`));
          return;
        }

        try {
          const jsonData = JSON.parse(bodyString);
          console.log("📦 Fresh LinkedIn API Response:", JSON.stringify(jsonData, null, 2));

          // Check if the response indicates an error or requires subscription
          if (jsonData.message && jsonData.message.includes("subscribe")) {
            reject(new Error(
              "RapidAPI subscription required. Please subscribe to Fresh LinkedIn Profile Data at https://rapidapi.com/"
            ));
            return;
          }

          if (jsonData.error) {
            reject(new Error(`Fresh LinkedIn API error: ${jsonData.error}`));
            return;
          }

          if (jsonData.message && jsonData.message.includes("suspended")) {
            reject(new Error("API service has been suspended"));
            return;
          }

          const parsed = ProfileSchema.parse(jsonData);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', function (error) {
      console.error('❌ Fresh LinkedIn API Request Error:', error);
      reject(error);
    });

    req.end();
  });
}

function formatDate(dateObj: any): string | null {
  if (!dateObj) return null;
  const { year, month } = dateObj;
  if (!year) return null;
  if (!month) return `${year}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function extractDomainFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = url.match(/linkedin\.com\/company\/([^/]+)/);
    if (match) {
      return `${match[1]}.com`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function importFromFreshLinkedIn(linkedinUrl: string) {
  const response = await fetchFreshLinkedInAPI(linkedinUrl);
  const profile = response.data;

  if (!profile) {
    throw new Error("No profile data returned from API");
  }

  const fullName = profile.full_name ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "Unknown";

  const location = profile.location ||
    [profile.city, profile.state, profile.country].filter(Boolean).join(", ") ||
    null;

  // Process experiences - use LinkedIn CDN URLs directly (no local storage)
  const experiencesWithLogos = (profile.experiences || []).map((exp: any) => {
    return {
      title: exp.title || null,
      company: exp.company || null,
      location: exp.location || null,
      startDate: formatDate({ year: exp.start_year, month: exp.start_month }),
      endDate: exp.is_current ? "Present" : formatDate({ year: exp.end_year, month: exp.end_month }),
      description: exp.description || null,
      companyDomain: exp.company_domain || null,
      companyLogoCdnUrl: exp.company_logo_url || null, // Use LinkedIn CDN URL directly
    };
  });

  // Use LinkedIn CDN URL directly for profile photo (no local storage)
  const profilePhotoCdnUrl = profile.profile_image_url || null;

  // Process education - use LinkedIn CDN URLs directly
  const education = (profile.educations || []).map((edu: any) => ({
    school: edu.school || null,
    degree: edu.degree || null,
    field: edu.field_of_study || null,
    startDate: formatDate({ year: edu.start_year, month: edu.start_month }),
    endDate: formatDate({ year: edu.end_year, month: edu.end_month }),
    schoolLogoCdnUrl: edu.school_logo_url || null, // Use LinkedIn CDN URL directly
  }));

  // Extract skills from experiences
  const skillsSet = new Set<string>();
  (profile.experiences || []).forEach((exp: any) => {
    if (exp.skills) {
      // Skills come as a string like "Python · Django · React"
      const skillsList = exp.skills.split('·').map((s: string) => s.trim()).filter(Boolean);
      skillsList.forEach((skill: string) => skillsSet.add(skill));
    }
  });

  return {
    candidate: {
      fullName,
      headline: profile.headline || null,
      location,
      summary: profile.about || null,
      source: "linkedin",
      sourceUrl: linkedinUrl,
      linkedinId: profile.public_id || null,
      profilePhotoCdnUrl,
      bannerCdnUrl: null, // API doesn't provide banner image
    },
    experiences: experiencesWithLogos,
    education,
    skills: Array.from(skillsSet),
  };
}
