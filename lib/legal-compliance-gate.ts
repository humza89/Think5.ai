/**
 * Legal Compliance Gate — POST-generation check for AI interview responses.
 *
 * Runs after AI output is generated, before sending to the candidate.
 * Detects questions about legally prohibited topics in employment interviews.
 */

interface ComplianceResult {
  passed: boolean;
  violations: string[];
}

interface ProhibitedTopic {
  name: string;
  patterns: RegExp[];
}

const PROHIBITED_TOPICS: ProhibitedTopic[] = [
  {
    name: "Age/date of birth",
    patterns: [
      /how\s+old\s+are\s+you/i,
      /what\s+is\s+your\s+(?:age|date\s+of\s+birth|birthday|birth\s+date)/i,
      /when\s+were\s+you\s+born/i,
      /what\s+year\s+(?:did\s+you|were\s+you)\s+(?:born|graduate)/i,
      /how\s+many\s+years\s+(?:until|before)\s+(?:you\s+)?retire/i,
    ],
  },
  {
    name: "Gender/sexuality",
    patterns: [
      /what\s+(?:is\s+your|are\s+your)\s+(?:gender|sex|sexual\s+orientation|pronouns)/i,
      /are\s+you\s+(?:male|female|man|woman|gay|lesbian|bisexual|transgender|straight|queer)/i,
      /what\s+(?:gender|sex)\s+do\s+you\s+identify/i,
      /do\s+you\s+identify\s+as/i,
    ],
  },
  {
    name: "Race/ethnicity",
    patterns: [
      /what\s+(?:is\s+your|are\s+your)\s+(?:race|ethnicity|ethnic\s+background|national\s+origin)/i,
      /where\s+are\s+you\s+(?:originally|really)\s+from/i,
      /what\s+(?:is\s+your|are\s+your)\s+(?:heritage|ancestry|descent)/i,
      /what\s+(?:country|nation)\s+(?:are\s+you|do\s+you\s+come)\s+from/i,
    ],
  },
  {
    name: "Religion",
    patterns: [
      /what\s+(?:is\s+your|are\s+your)\s+(?:religion|religious\s+(?:beliefs?|practices?|affiliation)|faith)/i,
      /do\s+you\s+(?:go\s+to\s+church|pray|observe|celebrate)\s+(?:any\s+)?(?:religious|holidays)/i,
      /are\s+you\s+(?:christian|muslim|jewish|hindu|buddhist|atheist|agnostic)/i,
      /what\s+(?:church|temple|mosque|synagogue)\s+do\s+you/i,
    ],
  },
  {
    name: "Disability/health",
    patterns: [
      /do\s+you\s+have\s+(?:a\s+)?(?:disability|disabilities|health\s+(?:issues?|problems?|conditions?))/i,
      /what\s+(?:is\s+your|are\s+your)\s+(?:medical|health)\s+(?:history|conditions?|issues?)/i,
      /have\s+you\s+(?:ever\s+)?(?:been\s+(?:hospitalized|diagnosed)|had\s+surgery)/i,
      /are\s+you\s+(?:disabled|handicapped)/i,
      /do\s+you\s+(?:take\s+any\s+)?(?:medication|medications)/i,
      /how\s+(?:many|often)\s+(?:sick\s+days|days\s+(?:off|sick))/i,
    ],
  },
  {
    name: "Marital/family status",
    patterns: [
      /are\s+you\s+(?:married|single|divorced|engaged|in\s+a\s+relationship)/i,
      /do\s+you\s+have\s+(?:any\s+)?(?:kids|children|a\s+family)/i,
      /are\s+you\s+(?:pregnant|planning\s+(?:to\s+have|a\s+family|on\s+having))/i,
      /what\s+(?:is\s+your|are\s+your)\s+(?:marital\s+status|family\s+(?:situation|plans?))/i,
      /who\s+(?:takes\s+care\s+of|watches)\s+your\s+(?:kids|children)/i,
      /do\s+you\s+have\s+(?:childcare|daycare)/i,
    ],
  },
  {
    name: "Salary history",
    patterns: [
      /what\s+(?:is|was|are|were)\s+your\s+(?:current|previous|last|most\s+recent)\s+(?:salary|compensation|pay|wage|income)/i,
      /how\s+much\s+(?:do|did|are|were)\s+you\s+(?:make|making|earn|earning|paid|getting\s+paid)/i,
      /what\s+(?:did|do)\s+(?:they|your\s+(?:current|previous|last)\s+(?:employer|company))\s+pay\s+you/i,
    ],
  },
  {
    name: "Political affiliation",
    patterns: [
      /what\s+(?:is\s+your|are\s+your)\s+(?:political\s+(?:views?|beliefs?|affiliation|party|leanings?))/i,
      /(?:who|which\s+party)\s+(?:do|did)\s+you\s+(?:vote|support)\s+(?:for)?/i,
      /are\s+you\s+(?:a\s+)?(?:democrat|republican|liberal|conservative|libertarian)/i,
    ],
  },
  {
    name: "Criminal record",
    patterns: [
      /have\s+you\s+(?:ever\s+)?(?:been\s+(?:arrested|convicted|charged|in\s+(?:jail|prison))|had\s+a\s+criminal)/i,
      /do\s+you\s+have\s+(?:a\s+)?(?:criminal\s+(?:record|history|background)|felony|misdemeanor)/i,
      /have\s+you\s+(?:ever\s+)?(?:committed|been\s+involved\s+in)\s+(?:a\s+)?(?:crime|offense)/i,
    ],
  },
  {
    name: "Military/veteran status",
    patterns: [
      /(?:are|were)\s+you\s+(?:in\s+the\s+)?(?:military|armed\s+forces|army|navy|marines|air\s+force)/i,
      /what\s+(?:is\s+your|are\s+your)\s+(?:military|veteran|discharge)\s+status/i,
      /(?:have\s+you|did\s+you)\s+(?:ever\s+)?(?:serve|served)\s+in\s+the\s+military/i,
      /what\s+type\s+of\s+(?:discharge|separation)\s+(?:did\s+you|do\s+you\s+have)/i,
    ],
  },
  {
    name: "Citizenship/immigration",
    patterns: [
      /(?:are\s+you|what\s+is\s+your)\s+(?:a\s+)?(?:citizen|citizenship|immigration\s+status|visa\s+status|resident\s+status)/i,
      /(?:do\s+you\s+have|what\s+(?:is\s+your|kind\s+of))\s+(?:a\s+)?(?:work\s+(?:visa|permit|authorization)|green\s+card)/i,
      /where\s+(?:is\s+your|were\s+you)\s+(?:citizenship|born|passport\s+from)/i,
      /are\s+you\s+(?:authorized|legally\s+(?:allowed|able))\s+to\s+work/i,
    ],
  },
];

/**
 * Check an AI response for legally prohibited interview topics.
 * This is a POST-generation gate -- runs after AI output, before sending to the candidate.
 */
export function checkLegalCompliance(aiResponse: string): ComplianceResult {
  const violations: string[] = [];

  for (const topic of PROHIBITED_TOPICS) {
    for (const pattern of topic.patterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        violations.push(`${topic.name}: matched "${match[0]}"`);
        break; // One match per topic is sufficient
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Semantic legal compliance check — detects paraphrased prohibited questions
 * that slip past regex patterns. Uses lightweight LLM classification.
 *
 * Only invoked when:
 * 1. The regex gate passes (no violations)
 * 2. The response contains a question directed at the candidate
 *
 * This catches creative wordings like "Tell me about your family plans"
 * that don't match explicit regex patterns.
 */
export async function semanticComplianceCheck(
  aiResponse: string
): Promise<ComplianceResult> {
  // Only run semantic check if the response contains a candidate-directed question
  const hasQuestion = /\?/.test(aiResponse) &&
    /\b(?:you|your|tell me|share|describe)\b/i.test(aiResponse);

  if (!hasQuestion) {
    return { passed: true, violations: [] };
  }

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a legal compliance classifier for employment interviews.
Analyze this AI interviewer response and determine if it asks about ANY prohibited topic.

PROHIBITED TOPICS (asking about these is illegal in employment interviews):
- Age, date of birth, graduation year
- Gender, sexual orientation, family planning, marital status, pregnancy
- Race, ethnicity, national origin
- Religion, beliefs
- Disability, health, medical conditions
- Salary history
- Political affiliation
- Criminal history
- Military/veteran status
- Citizenship, immigration status

AI RESPONSE TO CHECK:
"${aiResponse.slice(0, 500)}"

Respond with ONLY a JSON object: {"violation": false} or {"violation": true, "topic": "topic name", "reason": "brief explanation"}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 100 },
    });

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.violation) {
        return {
          passed: false,
          violations: [`${parsed.topic}: ${parsed.reason} (semantic detection)`],
        };
      }
    }

    return { passed: true, violations: [] };
  } catch {
    // On LLM failure, don't block — return passed (regex gate already cleared)
    return { passed: true, violations: [] };
  }
}
