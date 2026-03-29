/**
 * Fact Extractor — Tier 1 structured fact extraction from interview turns
 *
 * Two modes:
 * 1. Immediate: Regex + pattern matching for numbers, companies, dates, tech terms.
 *    Zero-latency, runs during checkpoint. ~80% recall on structured data.
 * 2. LLM: Gemini call for deeper semantic extraction. Used in Inngest background job.
 */

// ── Types ────────────────────────────────────────────────────────────

export type FactType =
  | "CLAIM"
  | "METRIC"
  | "DATE"
  | "COMPANY"
  | "RESPONSIBILITY"
  | "TECHNICAL_SKILL";

export interface ExtractedFact {
  turnId: string;
  factType: FactType;
  content: string;
  confidence: number;
  extractedBy: string;
}

// ── Immediate Extraction (Regex/Pattern) ────────────────────────────

/**
 * Fast, zero-latency fact extraction using regex patterns.
 * Runs during checkpoint — must complete in <10ms.
 */
export function extractFactsImmediate(turn: {
  turnId: string;
  role: string;
  content: string;
}): ExtractedFact[] {
  // Only extract from candidate turns
  if (turn.role !== "candidate") return [];

  const facts: ExtractedFact[] = [];
  const text = turn.content;

  // Metrics: percentages, dollar amounts, time durations, counts
  const metricPatterns = [
    /(\d+(?:\.\d+)?)\s*%/g,                           // percentages
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:M|K|B)?/gi, // dollar amounts
    /(\d+(?:\.\d+)?)\s*(?:million|billion|thousand)/gi,  // written amounts
    /reduced\s+.*?by\s+(\d+(?:\.\d+)?)\s*%/gi,         // "reduced X by Y%"
    /improved\s+.*?by\s+(\d+(?:\.\d+)?)\s*%/gi,        // "improved X by Y%"
    /increased\s+.*?by\s+(\d+(?:\.\d+)?)\s*%/gi,       // "increased X by Y%"
    /(\d+)x\s+(?:faster|slower|more|better|improvement)/gi, // "3x faster"
    /latency.*?(\d+)\s*(?:ms|milliseconds|seconds)/gi,  // latency metrics
    /(\d+)\s*(?:users|customers|clients|requests|transactions)/gi, // scale metrics
  ];

  for (const pattern of metricPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        turnId: turn.turnId,
        factType: "METRIC",
        content: match[0].trim(),
        confidence: 0.9,
        extractedBy: "immediate",
      });
    }
  }

  // Companies: well-known tech companies and patterns like "at [Company]"
  const companyPatterns = [
    /(?:at|with|for|from|joined|left|worked at)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g,
  ];

  const knownCompanies = new Set([
    "Google", "Meta", "Facebook", "Amazon", "Apple", "Microsoft", "Netflix",
    "Uber", "Lyft", "Airbnb", "Stripe", "Shopify", "Twitter", "LinkedIn",
    "Salesforce", "Adobe", "Oracle", "IBM", "Intel", "NVIDIA", "Tesla",
    "SpaceX", "Palantir", "Databricks", "Snowflake", "Confluent",
  ]);

  for (const pattern of companyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const company = match[1].trim();
      if (knownCompanies.has(company) || company.length > 2) {
        facts.push({
          turnId: turn.turnId,
          factType: "COMPANY",
          content: company,
          confidence: knownCompanies.has(company) ? 0.95 : 0.7,
          extractedBy: "immediate",
        });
      }
    }
  }

  // Dates: years, "in 2023", "from 2019 to 2022"
  const datePatterns = [
    /(?:in|since|from|during|around)\s+(20\d{2})/g,
    /(20\d{2})\s*(?:to|-)\s*(20\d{2})/g,
    /(\d+)\s+years?\s+(?:ago|of experience)/gi,
  ];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        turnId: turn.turnId,
        factType: "DATE",
        content: match[0].trim(),
        confidence: 0.85,
        extractedBy: "immediate",
      });
    }
  }

  // Technical skills: programming languages, frameworks, tools
  const techTerms = new Set([
    "React", "Next.js", "TypeScript", "JavaScript", "Python", "Go", "Rust",
    "Java", "Kotlin", "Swift", "Ruby", "PHP", "C++", "C#", "Scala",
    "Node.js", "Django", "Flask", "FastAPI", "Spring", "Rails",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "Kubernetes", "Docker", "AWS", "GCP", "Azure", "Terraform",
    "GraphQL", "REST", "gRPC", "Kafka", "RabbitMQ",
    "TensorFlow", "PyTorch", "Spark", "Hadoop", "Flink",
    "CI/CD", "Jenkins", "GitHub Actions", "CircleCI",
    "machine learning", "deep learning", "NLP", "computer vision",
  ]);

  const words = text.split(/[\s,;.()]+/);
  const foundTech = new Set<string>();

  for (const word of words) {
    for (const tech of techTerms) {
      if (
        word.toLowerCase() === tech.toLowerCase() ||
        text.toLowerCase().includes(tech.toLowerCase())
      ) {
        if (!foundTech.has(tech)) {
          foundTech.add(tech);
          facts.push({
            turnId: turn.turnId,
            factType: "TECHNICAL_SKILL",
            content: tech,
            confidence: 0.9,
            extractedBy: "immediate",
          });
        }
      }
    }
  }

  // Responsibilities: "I led", "I managed", "I built", "I designed"
  const responsibilityPatterns = [
    /I\s+(?:led|managed|built|designed|architected|implemented|developed|created|owned|spearheaded)\s+(.{10,100}?)(?:\.|,|$)/gi,
  ];

  for (const pattern of responsibilityPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        turnId: turn.turnId,
        factType: "RESPONSIBILITY",
        content: match[0].trim(),
        confidence: 0.8,
        extractedBy: "immediate",
      });
    }
  }

  // Deduplicate by content
  const seen = new Set<string>();
  return facts.filter((f) => {
    const key = `${f.factType}:${f.content.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Batch extraction across multiple turns.
 */
export function extractFactsBatch(
  turns: Array<{ turnId: string; role: string; content: string }>
): ExtractedFact[] {
  return turns.flatMap((turn) => extractFactsImmediate(turn));
}
