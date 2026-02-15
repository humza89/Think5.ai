import { z } from "zod";
import slugify from "slugify";
import { storeRemoteImageToCdn } from "../asset-store";

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "linkedin-data-api.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Schema for LinkedIn Data API
const ProfileSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
    geo: z.object({
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      full: z.string().optional(),
    }).optional(),
    profilePicture: z.string().url().optional(),
    backgroundPicture: z.string().url().optional(),
    username: z.string().optional(),
    experiences: z.array(z.object({
      title: z.string().optional(),
      companyName: z.string().optional(),
      location: z.string().optional(),
      start: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional(),
      end: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional().nullable(),
      description: z.string().optional(),
      company: z.object({
        universalName: z.string().optional(),
      }).optional(),
    })).optional(),
    schools: z.array(z.object({
      schoolName: z.string().optional(),
      degreeName: z.string().optional(),
      fieldOfStudy: z.string().optional(),
      start: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional(),
      end: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional().nullable(),
    })).optional(),
    skills: z.array(z.object({
      name: z.string().optional(),
    })).optional(),
  }).optional(),
});

async function fetchRapidAPI(linkedinUrl: string) {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  // Extract username from LinkedIn URL
  const username = linkedinUrl.match(/linkedin\.com\/in\/([^/]+)/)?.[1];
  if (!username) {
    throw new Error("Invalid LinkedIn URL format");
  }

  const url = `https://${RAPIDAPI_HOST}/get-profile-data-by-url?url=${encodeURIComponent(linkedinUrl)}`;
  console.log(`📡 Calling RapidAPI: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ RapidAPI HTTP Error ${response.status}:`, error);
    throw new Error(`RapidAPI error ${response.status}: ${error}`);
  }

  const jsonData = await response.json();
  console.log("📦 RapidAPI Response:", JSON.stringify(jsonData, null, 2));

  // Check if the response indicates an error or requires subscription
  if (jsonData.message && jsonData.message.includes("subscribe")) {
    throw new Error(
      "RapidAPI subscription required. Please subscribe to the LinkedIn Data API at https://rapidapi.com/"
    );
  }

  if (jsonData.error) {
    throw new Error(`RapidAPI error: ${jsonData.error}`);
  }

  return ProfileSchema.parse(jsonData);
}

function formatDate(dateObj: any): string | null {
  if (!dateObj) return null;
  const { year, month } = dateObj;
  if (!year) return null;
  return month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
}

function extractDomainFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function importFromRapidAPI(linkedinUrl: string) {
  const response = await fetchRapidAPI(linkedinUrl);
  const profile = response.data;

  if (!profile) {
    throw new Error("No profile data returned from API");
  }

  const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Unknown";
  const location = profile.geo?.full || profile.geo?.city || null;

  // Process experiences
  const experiences = (profile.experiences || []).map((exp) => {
    // Extract company domain from universalName (e.g., "apple" -> "apple.com")
    const companyDomain = exp.company?.universalName
      ? `${exp.company.universalName}.com`
      : null;

    return {
      title: exp.title || null,
      company: exp.companyName || null,
      location: exp.location || null,
      startDate: formatDate(exp.start),
      endDate: exp.end ? formatDate(exp.end) : "Present",
      description: exp.description || null,
      companyDomain,
    };
  });

  // Get company logos via Clearbit
  const experiencesWithLogos = await Promise.all(
    experiences.map(async (exp) => {
      if (!exp.companyDomain) {
        return { ...exp, companyLogoCdnUrl: null };
      }

      const logoUrl = `https://logo.clearbit.com/${exp.companyDomain}`;
      const slug = slugify(exp.company || exp.companyDomain, {
        lower: true,
        strict: true,
      });

      const cdnUrl = await storeRemoteImageToCdn({
        url: logoUrl,
        keyHint: `logos/${slug}`,
      });

      return { ...exp, companyLogoCdnUrl: cdnUrl };
    })
  );

  // Upload profile photo and banner
  const profilePhotoCdnUrl = await storeRemoteImageToCdn({
    url: profile.profilePicture || "",
    keyHint: `linkedin/${profile.username || "profile"}/avatar`,
  });

  const bannerCdnUrl = await storeRemoteImageToCdn({
    url: profile.backgroundPicture || "",
    keyHint: `linkedin/${profile.username || "profile"}/banner`,
  });

  // Process education
  const education = (profile.schools || []).map((edu) => ({
    school: edu.schoolName || null,
    degree: edu.degreeName || null,
    field: edu.fieldOfStudy || null,
    startDate: formatDate(edu.start),
    endDate: formatDate(edu.end),
  }));

  // Extract skill names
  const skills = (profile.skills || []).map((skill) => skill.name || "").filter(Boolean);

  return {
    candidate: {
      fullName,
      headline: profile.headline || null,
      location,
      summary: profile.summary || null,
      source: "linkedin",
      sourceUrl: linkedinUrl,
      linkedinId: profile.username || null,
      profilePhotoCdnUrl,
      bannerCdnUrl,
    },
    experiences: experiencesWithLogos,
    education,
    skills,
  };
}
