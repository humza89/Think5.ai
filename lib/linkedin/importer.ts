import { importFromProxycurl } from "./provider-proxycurl";
import { importFromRapidAPI } from "./provider-rapidapi";
import { importFromFreshLinkedIn } from "./provider-fresh-linkedin";
import { importFromRockAPIs } from "./provider-rockapis";
import { scrapeLinkedInProfile } from "../linkedin-scraper";

export type LinkedInProfileData = {
  candidate: {
    fullName: string;
    headline: string | null;
    location: string | null;
    summary: string | null;
    source: string;
    sourceUrl: string;
    linkedinId: string | null;
    profilePhotoCdnUrl: string | null;
    bannerCdnUrl: string | null;
  };
  experiences: Array<{
    title: string | null;
    company: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    companyDomain: string | null;
    companyLogoCdnUrl: string | null;
  }>;
  education: Array<{
    school: string | null;
    degree: string | null;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  skills: string[];
};

/**
 * Normalizes a LinkedIn URL to ensure it has the proper format
 * Handles various input formats:
 * - linkedin.com/in/username
 * - www.linkedin.com/in/username
 * - https://linkedin.com/in/username
 * - https://www.linkedin.com/in/username
 */
function normalizeLinkedInUrl(url: string): string {
  // Remove any whitespace
  url = url.trim();

  // If it already starts with http:// or https://, validate and return
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Ensure it has www.
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

  // If it's just the path (e.g., "in/username"), add full domain
  if (url.startsWith('in/')) {
    return `https://www.linkedin.com/${url}`;
  }

  // Otherwise assume it's a malformed URL and try to fix it
  return `https://www.linkedin.com/${url.replace(/^\/+/, '')}`;
}

export async function importLinkedInProfile(
  url: string
): Promise<LinkedInProfileData> {
  // Normalize the URL first
  const normalizedUrl = normalizeLinkedInUrl(url);
  console.log(`🔗 Normalized LinkedIn URL: ${url} → ${normalizedUrl}`);

  const provider = (
    process.env.LINKEDIN_IMPORT_PROVIDER || "mock"
  ).toLowerCase();

  console.log(`🔍 LinkedIn import using provider: ${provider}`);

  // RockAPIs Real-Time LinkedIn Scraper (recommended - you're subscribed!)
  if (provider === "rockapis" || provider === "rock-apis") {
    console.log("✅ Using RockAPIs Real-Time LinkedIn Scraper for real LinkedIn data");
    try {
      return await importFromRockAPIs(normalizedUrl);
    } catch (error: any) {
      console.error("❌ RockAPIs import failed:", error.message);

      // Fall back to mock data so the user can still add candidates
      console.log("⚠️  Falling back to mock data");
      const mockData = await scrapeLinkedInProfile(normalizedUrl);
      return {
        candidate: {
          fullName: mockData.fullName,
          headline: mockData.headline,
          location: null,
          summary: null,
          source: "linkedin",
          sourceUrl: normalizedUrl,
          linkedinId: null,
          profilePhotoCdnUrl: mockData.profileImage || null,
          bannerCdnUrl: null,
        },
        experiences: [
          {
            title: mockData.currentTitle || null,
            company: mockData.currentCompany || null,
            location: null,
            startDate: null,
            endDate: "Present",
            description: null,
            companyDomain: null,
            companyLogoCdnUrl: mockData.companyLogo || null,
          },
        ],
        education: [],
        skills: [],
      };
    }
  }

  // Fresh LinkedIn Profile Data (recommended)
  if (provider === "fresh-linkedin" || provider === "freshlinkedin") {
    console.log("✅ Using Fresh LinkedIn Profile Data API for real LinkedIn data");
    try {
      return await importFromFreshLinkedIn(normalizedUrl);
    } catch (error: any) {
      console.error("❌ Fresh LinkedIn import failed:", error.message);

      // Check if it's a subscription error
      if (error.message.includes("subscribe")) {
        console.error("💡 Please subscribe to Fresh LinkedIn Profile Data at https://rapidapi.com/");
      }

      // Fall back to mock data so the user can still add candidates
      console.log("⚠️  Falling back to mock data");
      const mockData = await scrapeLinkedInProfile(normalizedUrl);
      return {
        candidate: {
          fullName: mockData.fullName,
          headline: mockData.headline,
          location: null,
          summary: null,
          source: "linkedin",
          sourceUrl: normalizedUrl,
          linkedinId: null,
          profilePhotoCdnUrl: mockData.profileImage || null,
          bannerCdnUrl: null,
        },
        experiences: [
          {
            title: mockData.currentTitle || null,
            company: mockData.currentCompany || null,
            location: null,
            startDate: null,
            endDate: "Present",
            description: null,
            companyDomain: null,
            companyLogoCdnUrl: mockData.companyLogo || null,
          },
        ],
        education: [],
        skills: [],
      };
    }
  }

  // RapidAPI (deprecated - suspended)
  if (provider === "rapidapi") {
    console.log("✅ Using RapidAPI for real LinkedIn data");
    try {
      return await importFromRapidAPI(normalizedUrl);
    } catch (error: any) {
      console.error("❌ RapidAPI import failed:", error.message);

      // Check if it's a subscription error
      if (error.message.includes("subscribe")) {
        console.error("💡 Please subscribe to the LinkedIn Data API at https://rapidapi.com/");
      }

      // Fall back to mock data so the user can still add candidates
      console.log("⚠️  Falling back to mock data");
      const mockData = await scrapeLinkedInProfile(normalizedUrl);
      return {
        candidate: {
          fullName: mockData.fullName,
          headline: mockData.headline,
          location: null,
          summary: null,
          source: "linkedin",
          sourceUrl: normalizedUrl,
          linkedinId: null,
          profilePhotoCdnUrl: mockData.profileImage || null,
          bannerCdnUrl: null,
        },
        experiences: [
          {
            title: mockData.currentTitle || null,
            company: mockData.currentCompany || null,
            location: null,
            startDate: null,
            endDate: "Present",
            description: null,
            companyDomain: null,
            companyLogoCdnUrl: mockData.companyLogo || null,
          },
        ],
        education: [],
        skills: [],
      };
    }
  }

  // Proxycurl (deprecated - service shut down)
  if (provider === "proxycurl") {
    console.warn("⚠️  Proxycurl has shut down. Please use 'rapidapi' instead.");
    return await importFromProxycurl(normalizedUrl);
  }

  // Official LinkedIn API (not implemented)
  if (provider === "official") {
    throw new Error(
      "Official LinkedIn API provider not implemented yet. Use 'rapidapi' or 'mock'."
    );
  }

  // Mock fallback
  console.log("Using mock LinkedIn data");
  const mockData = await scrapeLinkedInProfile(url);

  return {
    candidate: {
      fullName: mockData.fullName,
      headline: mockData.headline,
      location: null,
      summary: null,
      source: "linkedin",
      sourceUrl: url,
      linkedinId: null,
      profilePhotoCdnUrl: mockData.profileImage || null,
      bannerCdnUrl: null,
    },
    experiences: [
      {
        title: mockData.currentTitle || null,
        company: mockData.currentCompany || null,
        location: null,
        startDate: null,
        endDate: "Present",
        description: null,
        companyDomain: null,
        companyLogoCdnUrl: mockData.companyLogo || null,
      },
    ],
    education: [],
    skills: [],
  };
}
