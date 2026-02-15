import { z } from "zod";
import slugify from "slugify";
import { storeRemoteImageToCdn } from "../asset-store";

const PROXYCURL_API = "https://nubela.co/proxycurl/api/v2/linkedin";
const API_KEY = process.env.PROXYCURL_API_KEY;

const ProfileSchema = z.object({
  public_identifier: z.string().nullish(),
  profile_pic_url: z.string().url().nullish(),
  background_cover_image_url: z.string().url().nullish(),
  full_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  headline: z.string().nullish(),
  summary: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  experiences: z
    .array(
      z.object({
        title: z.string().nullish(),
        company: z.string().nullish(),
        company_linkedin_profile_url: z.string().nullish(),
        company: z.string().nullish(),
        location: z.string().nullish(),
        starts_at: z
          .object({
            day: z.number().nullish(),
            month: z.number().nullish(),
            year: z.number().nullish(),
          })
          .nullish(),
        ends_at: z
          .object({
            day: z.number().nullish(),
            month: z.number().nullish(),
            year: z.number().nullish(),
          })
          .nullish(),
        description: z.string().nullish(),
      })
    )
    .nullish(),
  education: z
    .array(
      z.object({
        school: z.string().nullish(),
        degree_name: z.string().nullish(),
        field_of_study: z.string().nullish(),
        starts_at: z
          .object({
            day: z.number().nullish(),
            month: z.number().nullish(),
            year: z.number().nullish(),
          })
          .nullish(),
        ends_at: z
          .object({
            day: z.number().nullish(),
            month: z.number().nullish(),
            year: z.number().nullish(),
          })
          .nullish(),
      })
    )
    .nullish(),
  skills: z.array(z.string()).nullish(),
});

async function fetchProxycurl(url: string) {
  if (!API_KEY) {
    throw new Error("PROXYCURL_API_KEY not configured");
  }

  const apiUrl = `${PROXYCURL_API}?url=${encodeURIComponent(url)}&fallback_to_cache=on-error`;

  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Proxycurl error ${res.status}: ${await res.text()}`);
  }

  return ProfileSchema.parse(await res.json());
}

function formatDate(dateObj: any): string | null {
  if (!dateObj) return null;
  const { year, month } = dateObj;
  if (!year) return null;
  return month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
}

function extractDomainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function importFromProxycurl(linkedinUrl: string) {
  const profile = await fetchProxycurl(linkedinUrl);

  const fullName = profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown";
  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(", ") || null;

  // Process experiences
  const experiences = (profile.experiences || []).map((exp) => {
    const companyDomain = extractDomainFromUrl(exp.company_linkedin_profile_url);

    return {
      title: exp.title || null,
      company: exp.company || null,
      location: exp.location || null,
      startDate: formatDate(exp.starts_at),
      endDate: exp.ends_at ? formatDate(exp.ends_at) : "Present",
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
    url: profile.profile_pic_url || "",
    keyHint: `linkedin/${profile.public_identifier || "profile"}/avatar`,
  });

  const bannerCdnUrl = await storeRemoteImageToCdn({
    url: profile.background_cover_image_url || "",
    keyHint: `linkedin/${profile.public_identifier || "profile"}/banner`,
  });

  // Process education
  const education = (profile.education || []).map((edu) => ({
    school: edu.school || null,
    degree: edu.degree_name || null,
    field: edu.field_of_study || null,
    startDate: formatDate(edu.starts_at),
    endDate: formatDate(edu.ends_at),
  }));

  return {
    candidate: {
      fullName,
      headline: profile.headline || null,
      location,
      summary: profile.summary || null,
      source: "linkedin",
      sourceUrl: linkedinUrl,
      linkedinId: profile.public_identifier || null,
      profilePhotoCdnUrl,
      bannerCdnUrl,
    },
    experiences: experiencesWithLogos,
    education,
    skills: profile.skills || [],
  };
}
