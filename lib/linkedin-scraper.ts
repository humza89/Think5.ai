import axios from "axios";
import * as cheerio from "cheerio";

export interface LinkedInData {
  fullName: string;
  headline: string;
  profileImage?: string;
  currentTitle?: string;
  currentCompany?: string;
  companyLogo?: string;
}

export async function scrapeLinkedInProfile(
  linkedinUrl: string
): Promise<LinkedInData> {
  // Note: LinkedIn actively blocks web scraping. In production, you should use:
  // 1. LinkedIn API (requires OAuth and limited access)
  // 2. Third-party services like Proxycurl, ScrapingBee, or RapidAPI LinkedIn scrapers
  // 3. Browser automation with Puppeteer/Playwright (still may be blocked)

  // This is a simplified mock implementation
  // For real implementation, consider using a proxy API service

  try {
    // Mock data for demonstration
    // In production, replace with actual API call to a LinkedIn scraping service

    const mockData: LinkedInData = {
      fullName: "Demo User",
      headline: "Professional Title from LinkedIn",
      profileImage: "https://via.placeholder.com/150",
      currentTitle: "Senior Professional",
      currentCompany: "Tech Company",
    };

    console.warn(
      "LinkedIn scraping is using mock data. Integrate a real LinkedIn scraping API for production."
    );

    return mockData;

    // Example of how to use a third-party API (Proxycurl):
    /*
    const response = await axios.get('https://nubela.co/proxycurl/api/v2/linkedin', {
      params: { url: linkedinUrl },
      headers: { 'Authorization': `Bearer ${process.env.PROXYCURL_API_KEY}` }
    });

    return {
      fullName: response.data.full_name,
      headline: response.data.headline,
      profileImage: response.data.profile_pic_url,
      currentTitle: response.data.experiences?.[0]?.title,
      currentCompany: response.data.experiences?.[0]?.company,
      companyLogo: response.data.experiences?.[0]?.logo_url,
    };
    */
  } catch (error) {
    console.error("Error scraping LinkedIn:", error);
    throw new Error("Failed to fetch LinkedIn data");
  }
}

// Alternative: Extract LinkedIn username from URL
export function extractLinkedInUsername(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/]+)/);
  return match ? match[1] : null;
}
