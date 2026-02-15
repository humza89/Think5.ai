import { z } from "zod";
import slugify from "slugify";
import { storeRemoteImageToCdn } from "../asset-store";

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "linkedin-api8.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Schema for RockAPIs Real-Time LinkedIn Scraper API
const ProfileSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.object({
    urn: z.string().optional(),
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
    geo: z.object({
      country: z.string().optional(),
      city: z.string().optional(),
      full: z.string().optional(),
    }).optional(),
    profilePicture: z.string().url().optional(),
    backgroundImage: z.string().url().optional(),
    followerCount: z.number().optional(),
    connectionCount: z.number().optional(),
    openToWork: z.boolean().optional(),
    experiences: z.array(z.object({
      companyName: z.string().optional(),
      companyUsername: z.string().optional(),
      companyURL: z.string().optional(),
      companyLogo: z.string().optional(),
      title: z.string().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
      employmentType: z.string().optional(),
      start: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional(),
      end: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional().nullable(),
    })).optional(),
    educations: z.array(z.object({
      schoolName: z.string().optional(),
      schoolUsername: z.string().optional(),
      schoolURL: z.string().optional(),
      schoolLogo: z.string().optional(),
      degree: z.string().optional(),
      fieldOfStudy: z.string().optional(),
      start: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional(),
      end: z.object({
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional().nullable(),
      description: z.string().optional(),
    })).optional(),
    skills: z.array(z.object({
      name: z.string().optional(),
      endorsementCount: z.number().optional(),
    })).optional(),
    courses: z.array(z.object({
      name: z.string().optional(),
      number: z.string().optional(),
    })).optional(),
    certifications: z.array(z.object({
      name: z.string().optional(),
      authority: z.string().optional(),
      timePeriod: z.object({
        start: z.object({
          month: z.number().optional(),
          year: z.number().optional(),
        }).optional(),
        end: z.object({
          month: z.number().optional(),
          year: z.number().optional(),
        }).optional().nullable(),
      }).optional(),
    })).optional(),
  }).optional().nullable(),
});

async function fetchRockAPIsLinkedIn(linkedinUrl: string) {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  // Extract username from LinkedIn URL
  const username = linkedinUrl.match(/linkedin\.com\/in\/([^/]+)/)?.[1];
  if (!username) {
    throw new Error("Invalid LinkedIn URL format");
  }

  const url = `https://${RAPIDAPI_HOST}/get-profile-data-by-url?url=${encodeURIComponent(linkedinUrl)}`;
  console.log(`📡 Calling RockAPIs LinkedIn API: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ RockAPIs HTTP Error ${response.status}:`, error);
    throw new Error(`RockAPIs error ${response.status}: ${error}`);
  }

  const jsonData = await response.json();
  console.log("📦 RockAPIs Response:", JSON.stringify(jsonData, null, 2));

  // Check API response structure
  if (!jsonData.success) {
    const message = jsonData.message || "Unknown error";
    console.error(`❌ RockAPIs returned success=false: ${message}`);
    throw new Error(`RockAPIs error: ${message}`);
  }

  // Check if subscription is needed
  if (jsonData.message && jsonData.message.includes("subscribe")) {
    throw new Error(
      "RapidAPI subscription required. Please subscribe to Real-Time LinkedIn Scraper API"
    );
  }

  if (!jsonData.data) {
    throw new Error("No profile data returned from API");
  }

  return ProfileSchema.parse(jsonData);
}

function formatDate(dateObj: any): string | null {
  if (!dateObj) return null;
  const { year, month } = dateObj;
  if (!year) return null;
  if (!month) return `${year}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function importFromRockAPIs(linkedinUrl: string) {
  const response = await fetchRockAPIsLinkedIn(linkedinUrl);
  const profile = response.data;

  if (!profile) {
    throw new Error("No profile data returned from API");
  }

  const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Unknown";
  const location = profile.geo?.full || profile.geo?.city || null;

  // Process experiences
  const experiences = (profile.experiences || []).map((exp) => {
    // Try to get company domain from company URL or username
    let companyDomain = null;
    if (exp.companyURL) {
      const match = exp.companyURL.match(/linkedin\.com\/company\/([^/]+)/);
      if (match) {
        companyDomain = `${match[1]}.com`;
      }
    } else if (exp.companyUsername) {
      companyDomain = `${exp.companyUsername}.com`;
    }

    return {
      title: exp.title || null,
      company: exp.companyName || null,
      location: exp.location || null,
      startDate: formatDate(exp.start),
      endDate: exp.end ? formatDate(exp.end) : "Present",
      description: exp.description || null,
      companyDomain,
      companyLogoUrl: exp.companyLogo || null, // RockAPIs provides company logos!
    };
  });

  // Get company logos - RockAPIs already provides them, but we can also try Clearbit as fallback
  const experiencesWithLogos = await Promise.all(
    experiences.map(async (exp) => {
      // If RockAPIs provided a logo, use it
      if (exp.companyLogoUrl) {
        const slug = slugify(exp.company || "company", {
          lower: true,
          strict: true,
        });

        const cdnUrl = await storeRemoteImageToCdn({
          url: exp.companyLogoUrl,
          keyHint: `logos/${slug}`,
        });

        return { ...exp, companyLogoCdnUrl: cdnUrl };
      }

      // Otherwise try Clearbit
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
    url: profile.backgroundImage || "",
    keyHint: `linkedin/${profile.username || "profile"}/banner`,
  });

  // Process education - get logos similar to company logos
  const educationData = (profile.educations || []).map((edu) => {
    // Try to get school domain from school URL or username
    let schoolDomain = null;
    if (edu.schoolURL) {
      const match = edu.schoolURL.match(/linkedin\.com\/school\/([^/]+)/);
      if (match) {
        schoolDomain = `${match[1]}.edu`;
      }
    } else if (edu.schoolUsername) {
      schoolDomain = `${edu.schoolUsername}.edu`;
    }

    return {
      school: edu.schoolName || null,
      degree: edu.degree || null,
      field: edu.fieldOfStudy || null,
      startDate: formatDate(edu.start),
      endDate: formatDate(edu.end),
      schoolLogoUrl: edu.schoolLogo || null,
      schoolDomain,
    };
  });

  // Get school logos - similar to companies
  const education = await Promise.all(
    educationData.map(async (edu) => {
      // If RockAPIs provided a logo, use it
      if (edu.schoolLogoUrl) {
        const slug = slugify(edu.school || "school", {
          lower: true,
          strict: true,
        });

        const cdnUrl = await storeRemoteImageToCdn({
          url: edu.schoolLogoUrl,
          keyHint: `logos/${slug}`,
        });

        const { schoolLogoUrl, schoolDomain, ...rest } = edu;
        return { ...rest, schoolLogoCdnUrl: cdnUrl };
      }

      // Otherwise try Clearbit with .edu domain
      if (!edu.schoolDomain) {
        const { schoolLogoUrl, schoolDomain, ...rest } = edu;
        return { ...rest, schoolLogoCdnUrl: null };
      }

      const logoUrl = `https://logo.clearbit.com/${edu.schoolDomain}`;
      const slug = slugify(edu.school || edu.schoolDomain, {
        lower: true,
        strict: true,
      });

      const cdnUrl = await storeRemoteImageToCdn({
        url: logoUrl,
        keyHint: `logos/${slug}`,
      });

      const { schoolLogoUrl, schoolDomain, ...rest } = edu;
      return { ...rest, schoolLogoCdnUrl: cdnUrl };
    })
  );

  // Extract skill names
  const skills = (profile.skills || []).map((skill) => skill.name || "").filter(Boolean);

  // Additional data from RockAPIs
  const certifications = (profile.certifications || []).map((cert) => ({
    name: cert.name || null,
    authority: cert.authority || null,
    startDate: formatDate(cert.timePeriod?.start),
    endDate: formatDate(cert.timePeriod?.end),
  }));

  const courses = (profile.courses || []).map((course) => ({
    name: course.name || null,
    number: course.number || null,
  }));

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
      // Extra data from RockAPIs
      connectionCount: profile.connectionCount || null,
      followerCount: profile.followerCount || null,
      openToWork: profile.openToWork || false,
    },
    experiences: experiencesWithLogos,
    education,
    skills,
    // Additional rich data
    certifications,
    courses,
  };
}
