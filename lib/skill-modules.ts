/**
 * Skill Modules — Micro1-style reusable assessment modules
 *
 * Each module defines a topic area with scoring rubric, question patterns,
 * and difficulty progression. Templates compose 3-6 modules into a full interview.
 * Recruiters can customize module selection per job template.
 */

import { computeJsonHash } from "./versioning";

// ── Types ──────────────────────────────────────────────────────────────

export interface SkillModuleDefinition {
  name: string;
  category: "technical" | "behavioral" | "domain";
  duration: number; // minutes
  difficulty: "junior" | "mid" | "senior" | "staff";
  rubric: ScoringRubric;
  prompts: string[]; // base question patterns
  followUpPatterns: string[]; // patterns for adaptive follow-ups
}

export interface ScoringRubric {
  levels: {
    notExperienced: string; // 0-2: what "not experienced" looks like
    junior: string;         // 3-4: junior-level understanding
    mid: string;            // 5-6: mid-level competency
    senior: string;         // 7-8: senior-level mastery
    expert: string;         // 9-10: staff/principal depth
  };
  keySignals: string[];     // what to listen for
  redFlags: string[];       // warning signs
}

export interface ModuleScore {
  moduleName: string;
  category: string;
  score: number;            // 0-10
  level: string;            // "not_experienced" | "junior" | "mid" | "senior" | "expert"
  evidence: string;         // key observations
  questionsAsked: number;
  difficultyReached: string;
}

// ── Default Skill Modules ──────────────────────────────────────────────

export const DEFAULT_SKILL_MODULES: SkillModuleDefinition[] = [
  // ── Technical Modules ──
  {
    name: "System Design",
    category: "technical",
    duration: 7,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot articulate basic system components or trade-offs",
        junior: "Understands basic client-server architecture, can name common components",
        mid: "Can design a simple system with appropriate database, caching, and API choices",
        senior: "Handles scale, fault tolerance, consistency vs availability trade-offs fluently",
        expert: "Deep understanding of distributed systems, CAP theorem, event sourcing, CQRS with real-world examples",
      },
      keySignals: ["trade-off reasoning", "scale considerations", "real-world examples", "failure mode thinking"],
      redFlags: ["no mention of trade-offs", "single-point-of-failure designs", "ignoring data consistency"],
    },
    prompts: [
      "Walk me through how you'd design a {system_type} that handles {scale}",
      "Tell me about a system you designed. What were the key architectural decisions?",
      "How would you handle {failure_scenario} in a distributed system?",
    ],
    followUpPatterns: [
      "What happens when {component} fails?",
      "How would this scale to {10x_current_load}?",
      "What trade-offs did you consider between {option_a} and {option_b}?",
    ],
  },
  {
    name: "Data Structures & Algorithms",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot explain basic data structures or their use cases",
        junior: "Knows arrays, hash maps, basic sorting; can solve simple problems",
        mid: "Comfortable with trees, graphs, dynamic programming concepts",
        senior: "Can analyze time/space complexity, choose optimal structures for problems",
        expert: "Deep knowledge of advanced structures, can design novel solutions, understands amortized analysis",
      },
      keySignals: ["complexity analysis", "structure selection reasoning", "optimization thinking", "edge case handling"],
      redFlags: ["wrong complexity claims", "brute force only", "no consideration of edge cases"],
    },
    prompts: [
      "Describe a situation where you chose a specific data structure for performance reasons",
      "How would you approach optimizing a {operation} that's currently O(n²)?",
      "Walk me through your thought process for solving {problem_type} problems",
    ],
    followUpPatterns: [
      "What's the time complexity of that approach?",
      "Can you think of a more space-efficient solution?",
      "How would you handle {edge_case}?",
    ],
  },
  {
    name: "API Design",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot explain REST basics or API versioning",
        junior: "Understands REST conventions, can design simple CRUD endpoints",
        mid: "Considers authentication, pagination, error handling, versioning",
        senior: "Designs for backward compatibility, rate limiting, caching headers, documentation",
        expert: "Experience with GraphQL/gRPC trade-offs, API gateway patterns, contract-first design",
      },
      keySignals: ["RESTful conventions", "error handling strategy", "versioning approach", "security considerations"],
      redFlags: ["no authentication mention", "inconsistent naming", "no error handling"],
    },
    prompts: [
      "Design an API for {feature}. What endpoints would you create?",
      "How do you handle API versioning and backward compatibility?",
      "Tell me about an API you designed. What went well and what would you change?",
    ],
    followUpPatterns: [
      "How would you handle authentication for this endpoint?",
      "What happens when a client sends invalid data?",
      "How would you paginate this response?",
    ],
  },
  {
    name: "Database Design",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot explain normalization or basic query optimization",
        junior: "Understands basic SQL, simple schema design, primary/foreign keys",
        mid: "Can design normalized schemas, write complex queries, use indexes effectively",
        senior: "Handles sharding, replication, query optimization, migration strategies",
        expert: "Deep knowledge of database internals, ACID guarantees, distributed database trade-offs",
      },
      keySignals: ["normalization reasoning", "index strategy", "query optimization", "migration planning"],
      redFlags: ["no indexes mentioned", "over-normalization", "ignoring data integrity"],
    },
    prompts: [
      "Design a database schema for {use_case}",
      "How would you optimize a query that's running slowly?",
      "Tell me about a challenging database migration you've handled",
    ],
    followUpPatterns: [
      "What indexes would you add and why?",
      "How would you handle this at {scale}?",
      "What consistency guarantees does this need?",
    ],
  },
  {
    name: "Cloud & Infrastructure",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No cloud deployment experience",
        junior: "Can deploy basic apps, understands compute/storage/networking basics",
        mid: "Uses IaC, understands auto-scaling, load balancing, CI/CD pipelines",
        senior: "Designs multi-region architectures, cost optimization, security hardening",
        expert: "Deep experience with Kubernetes, service mesh, observability at scale, cloud-native patterns",
      },
      keySignals: ["IaC usage", "security posture", "cost awareness", "observability strategy"],
      redFlags: ["no monitoring mention", "manual deployments", "security afterthought"],
    },
    prompts: [
      "How do you typically set up a production deployment pipeline?",
      "Tell me about your experience with cloud infrastructure. What patterns do you use?",
      "How do you approach monitoring and observability for production systems?",
    ],
    followUpPatterns: [
      "How do you handle secrets management?",
      "What's your approach to cost optimization?",
      "How would you handle a production incident with this setup?",
    ],
  },
  {
    name: "Security",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No awareness of common security vulnerabilities",
        junior: "Knows OWASP top 10, basic input validation, HTTPS",
        mid: "Implements auth/authz properly, understands XSS/CSRF/SQLi prevention",
        senior: "Security-first design, threat modeling, secure architecture patterns",
        expert: "Penetration testing experience, cryptographic protocol knowledge, compliance frameworks",
      },
      keySignals: ["threat modeling", "defense in depth", "least privilege", "security testing"],
      redFlags: ["storing passwords in plaintext", "no input validation", "security as afterthought"],
    },
    prompts: [
      "How do you approach security in your applications?",
      "Walk me through how you'd secure {feature}",
      "Tell me about a security vulnerability you discovered and how you fixed it",
    ],
    followUpPatterns: [
      "How would you prevent {attack_type} in this case?",
      "What authentication mechanism would you recommend and why?",
      "How do you handle sensitive data at rest and in transit?",
    ],
  },

  // ── Behavioral Modules ──
  {
    name: "Leadership & Influence",
    category: "behavioral",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No examples of leading or influencing outcomes",
        junior: "Can describe following direction, contributing to team decisions",
        mid: "Has led small initiatives, mentored others, driven consensus",
        senior: "Led cross-functional projects, influenced strategy, grew team members",
        expert: "Organizational-level impact, built teams/culture, shaped technical direction",
      },
      keySignals: ["specific examples", "measurable outcomes", "influence without authority", "people development"],
      redFlags: ["vague answers", "taking credit for team work", "no measurable impact"],
    },
    prompts: [
      "Tell me about a time you led a challenging project. What was your approach?",
      "Describe a situation where you had to influence people without direct authority",
      "How have you helped develop or mentor other engineers?",
    ],
    followUpPatterns: [
      "What was the measurable outcome?",
      "What would you do differently if you could do it again?",
      "How did you handle resistance or disagreement?",
    ],
  },
  {
    name: "Conflict Resolution",
    category: "behavioral",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Avoids conflict, no examples of resolution",
        junior: "Can describe basic disagreements and simple resolutions",
        mid: "Handles technical disagreements constructively, finds compromise",
        senior: "Mediates team conflicts, navigates organizational politics, builds alignment",
        expert: "Resolves cross-team/cross-org conflicts, creates frameworks for healthy disagreement",
      },
      keySignals: ["empathy", "active listening", "solution-oriented", "preserving relationships"],
      redFlags: ["blaming others", "avoiding conflict entirely", "win-lose mentality"],
    },
    prompts: [
      "Tell me about a time you disagreed with a technical decision. How did you handle it?",
      "Describe a conflict within your team and how you helped resolve it",
      "How do you handle situations where stakeholders have competing priorities?",
    ],
    followUpPatterns: [
      "How did the other person respond?",
      "What was the final outcome?",
      "What did you learn from this experience?",
    ],
  },
  {
    name: "Communication",
    category: "behavioral",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Unclear communication, struggles to explain concepts",
        junior: "Can explain basic concepts, writes simple documentation",
        mid: "Explains complex topics to non-technical audiences, clear written communication",
        senior: "Presents to leadership, writes influential documents, adapts style to audience",
        expert: "Drives organizational communication, shapes narrative, exceptional storytelling",
      },
      keySignals: ["clarity", "audience awareness", "structured thinking", "conciseness"],
      redFlags: ["jargon overuse", "inability to simplify", "poor listening", "rambling responses"],
    },
    prompts: [
      "How do you explain complex technical concepts to non-technical stakeholders?",
      "Tell me about a time your communication skills made a significant impact",
      "Describe how you typically structure a technical proposal or design document",
    ],
    followUpPatterns: [
      "Can you give me a specific example?",
      "How did you adapt your message for different audiences?",
      "What feedback did you receive?",
    ],
  },
  {
    name: "Problem Solving & Decision Making",
    category: "behavioral",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No structured approach to problem solving",
        junior: "Can follow established debugging/troubleshooting processes",
        mid: "Breaks down complex problems, considers multiple approaches, makes data-driven decisions",
        senior: "Navigates ambiguity, makes decisions with incomplete information, considers second-order effects",
        expert: "Solves novel problems, creates frameworks for decision-making, anticipates future challenges",
      },
      keySignals: ["structured thinking", "data-driven reasoning", "trade-off analysis", "pragmatism"],
      redFlags: ["analysis paralysis", "gut-feeling-only decisions", "ignoring constraints"],
    },
    prompts: [
      "Walk me through how you approach a complex problem you've never seen before",
      "Tell me about a difficult decision you made with incomplete information",
      "Describe a time you had to make a trade-off between speed and quality",
    ],
    followUpPatterns: [
      "What data did you use to make that decision?",
      "What were the alternatives you considered?",
      "What were the second-order effects?",
    ],
  },

  // ── Domain Modules ──
  {
    name: "Frontend Engineering",
    category: "domain",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No frontend framework experience",
        junior: "Basic React/Vue/Angular, understands components, state, props",
        mid: "State management, performance optimization, responsive design, testing",
        senior: "Architecture decisions, code splitting, accessibility, design systems",
        expert: "Framework internals, custom renderers, build tooling, performance at scale",
      },
      keySignals: ["component architecture", "state management strategy", "performance awareness", "accessibility"],
      redFlags: ["no testing mention", "prop drilling", "ignoring accessibility"],
    },
    prompts: [
      "How do you structure a large frontend application?",
      "Tell me about a challenging performance optimization you've done on the frontend",
      "How do you approach state management in complex applications?",
    ],
    followUpPatterns: [
      "How do you handle accessibility in your applications?",
      "What's your testing strategy for frontend code?",
      "How do you approach code splitting and lazy loading?",
    ],
  },
  {
    name: "Backend Engineering",
    category: "domain",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No server-side development experience",
        junior: "Can build basic REST APIs, understands request/response cycle",
        mid: "Handles authentication, database optimization, error handling, logging",
        senior: "Microservice architecture, event-driven systems, caching strategies, observability",
        expert: "Distributed systems expertise, high-throughput processing, platform engineering",
      },
      keySignals: ["error handling strategy", "scalability thinking", "observability", "security"],
      redFlags: ["no error handling", "synchronous-everything", "no logging"],
    },
    prompts: [
      "How do you structure a backend service for a new feature?",
      "Tell me about your experience with distributed systems or microservices",
      "How do you handle errors, logging, and monitoring in production?",
    ],
    followUpPatterns: [
      "How do you handle database connection pooling?",
      "What's your approach to API rate limiting?",
      "How do you ensure data consistency across services?",
    ],
  },
  {
    name: "DevOps & SRE",
    category: "domain",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No deployment or operations experience",
        junior: "Basic CI/CD, can deploy to a single environment",
        mid: "Multi-environment pipelines, containerization, basic monitoring",
        senior: "Kubernetes orchestration, auto-scaling, incident response, SLO/SLI management",
        expert: "Platform engineering, chaos engineering, multi-cloud strategies, reliability engineering",
      },
      keySignals: ["automation mindset", "reliability focus", "incident response", "monitoring strategy"],
      redFlags: ["manual processes", "no monitoring", "no rollback strategy"],
    },
    prompts: [
      "Describe your ideal CI/CD pipeline and why",
      "How do you handle production incidents? Walk me through your process",
      "What's your approach to defining and monitoring SLOs?",
    ],
    followUpPatterns: [
      "How do you handle rollbacks?",
      "What's your approach to capacity planning?",
      "How do you balance reliability with feature velocity?",
    ],
  },
  {
    name: "Machine Learning & AI",
    category: "domain",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No ML/AI experience",
        junior: "Understands basic concepts, has used pre-trained models",
        mid: "Can train and evaluate models, feature engineering, basic MLOps",
        senior: "End-to-end ML pipelines, model optimization, A/B testing ML systems",
        expert: "Novel architectures, large-scale training, ML infrastructure at scale",
      },
      keySignals: ["evaluation methodology", "production deployment", "data quality awareness", "iteration approach"],
      redFlags: ["no evaluation metrics", "overfitting unawareness", "no production experience"],
    },
    prompts: [
      "Tell me about an ML project you've worked on end-to-end",
      "How do you evaluate model performance and decide when a model is ready for production?",
      "What's your approach to feature engineering and data quality?",
    ],
    followUpPatterns: [
      "How did you handle data quality issues?",
      "What was your approach to model monitoring in production?",
      "How did you iterate and improve the model over time?",
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the SHA-256 hash of the DEFAULT_SKILL_MODULES array.
 */
export function getSkillModulesHash(): string {
  return computeJsonHash(DEFAULT_SKILL_MODULES);
}

/**
 * Get modules by category for template composition.
 */
export function getModulesByCategory(
  category: "technical" | "behavioral" | "domain"
): SkillModuleDefinition[] {
  return DEFAULT_SKILL_MODULES.filter((m) => m.category === category);
}

/**
 * Get a module by name.
 */
export function getModuleByName(name: string): SkillModuleDefinition | undefined {
  return DEFAULT_SKILL_MODULES.find(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Compose a set of modules into an interview configuration.
 * Returns the total duration and ordered module list.
 */
export function composeInterviewModules(
  moduleNames: string[]
): { modules: SkillModuleDefinition[]; totalDuration: number } {
  const modules: SkillModuleDefinition[] = [];
  let totalDuration = 0;

  for (const name of moduleNames) {
    const mod = getModuleByName(name);
    if (mod) {
      modules.push(mod);
      totalDuration += mod.duration;
    }
  }

  return { modules, totalDuration };
}

/**
 * Determine the score level from a numeric score.
 */
export function scoreToLevel(score: number): string {
  if (score < 3) return "not_experienced";
  if (score < 5) return "junior";
  if (score < 7) return "mid";
  if (score < 9) return "senior";
  return "expert";
}
