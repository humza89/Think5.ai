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

  // ── ML/AI Specialized Modules ──
  // Inspired by alirezadir/Machine-Learning-Interviews (MIT, ~8k stars)
  {
    name: "ML System Design",
    category: "domain",
    duration: 8,
    difficulty: "senior",
    rubric: {
      levels: {
        notExperienced: "Cannot distinguish ML system design from general system design; no awareness of ML-specific components",
        junior: "Understands basic ML pipeline stages but cannot reason about trade-offs between offline metrics and business metrics",
        mid: "Can walk through an ML system design for a familiar domain (recommendation, search ranking) covering data, features, model, and evaluation",
        senior: "Designs end-to-end ML systems with clear metric hierarchies, data flywheel thinking, A/B testing strategy, model versioning, and monitoring for drift",
        expert: "Designs novel ML architectures at scale with multi-objective optimization, online learning, feature stores, model serving trade-offs, and organizational ML platform strategy",
      },
      keySignals: [
        "metric hierarchy (offline vs online vs business)",
        "data flywheel thinking",
        "feature store awareness",
        "model serving trade-offs (latency vs throughput)",
        "A/B testing and experimentation design",
        "monitoring for data and model drift",
      ],
      redFlags: [
        "no distinction between offline and online metrics",
        "no mention of data quality or labeling strategy",
        "ignoring model serving latency requirements",
        "no monitoring or drift detection plan",
        "treating ML system design as just model selection",
      ],
    },
    prompts: [
      "Design an ML system for {ml_application} — for example content recommendation, fraud detection, or search ranking. Walk me through your approach from problem definition to production monitoring.",
      "You're building a {ml_system_type} that needs to serve predictions at {latency_requirement}. How would you architect the feature computation and model serving layers?",
      "Tell me about an ML system you designed end-to-end. What were the key architectural decisions and what would you change today?",
      "How would you design the evaluation framework for a {ml_task} system, including offline metrics, online experiments, and business KPIs?",
      "Your model's offline metrics look great but the online A/B test shows no business impact. Walk me through your debugging approach.",
    ],
    followUpPatterns: [
      "How would you handle the cold-start problem in this system?",
      "What happens when the data distribution shifts after deployment?",
      "How would you decide between a simpler model with hand-crafted features vs. a deep learning approach?",
      "Walk me through your feature engineering strategy for this problem.",
    ],
  },
  {
    name: "ML Fundamentals",
    category: "technical",
    duration: 6,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot explain the bias-variance tradeoff or basic model selection criteria",
        junior: "Understands core algorithms (linear/logistic regression, decision trees, k-means) and basic concepts (overfitting, cross-validation)",
        mid: "Can explain gradient descent variants, regularization techniques, ensemble methods, and basic neural network architectures with mathematical intuition",
        senior: "Deep understanding of optimization landscapes, attention mechanisms, transfer learning strategies, and can reason about when to apply which technique with mathematical rigor",
        expert: "Can design novel architectures, understands training dynamics at scale, explains transformer internals, distributed training strategies, and cutting-edge techniques (RLHF, mixture of experts)",
      },
      keySignals: [
        "mathematical intuition behind algorithms",
        "algorithm selection reasoning with trade-offs",
        "understanding of failure modes and when algorithms break",
        "practical experience with training at scale",
      ],
      redFlags: [
        "memorized definitions without understanding",
        "cannot explain when or why an algorithm fails",
        "no intuition for hyperparameter effects",
        "confuses correlation with causation",
      ],
    },
    prompts: [
      "Explain the bias-variance tradeoff and how it influences your model selection for a {problem_type} problem.",
      "Walk me through how gradient descent works, what can go wrong, and techniques you use to address those issues.",
      "Compare and contrast {algorithm_a} and {algorithm_b} for {task}. When would you choose one over the other?",
      "Explain how transformers work and why they've been so successful. What are their limitations?",
      "You have a dataset with {data_challenge} — for example class imbalance, missing values, or high dimensionality. Walk me through your approach.",
    ],
    followUpPatterns: [
      "What's the mathematical intuition behind that?",
      "How would you diagnose whether the model is underfitting or overfitting?",
      "What regularization technique would you apply here and why?",
    ],
  },
  {
    name: "Feature Engineering & Data Pipeline",
    category: "domain",
    duration: 6,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No understanding of feature engineering beyond raw data input to a model",
        junior: "Can perform basic feature transformations (scaling, encoding, imputation) using standard libraries",
        mid: "Designs feature pipelines with domain-informed features, handles temporal features correctly, understands feature leakage",
        senior: "Builds feature stores, designs real-time and batch feature computation, handles train-serve skew, implements feature monitoring",
        expert: "Architects enterprise feature platforms, designs automated feature discovery, handles cross-domain feature sharing, and optimizes feature computation at petabyte scale",
      },
      keySignals: [
        "feature leakage awareness",
        "train-serve skew prevention",
        "temporal feature handling",
        "domain knowledge application to feature design",
        "feature importance analysis and selection",
      ],
      redFlags: [
        "using future information in features (leakage)",
        "no data validation in pipeline",
        "ignoring missing data patterns",
        "no feature documentation or lineage tracking",
      ],
    },
    prompts: [
      "Walk me through your feature engineering process for a {prediction_task}. How do you go from raw data to model-ready features?",
      "Tell me about a time when feature engineering significantly improved model performance. What was your approach?",
      "How do you prevent feature leakage in a time-series prediction problem?",
      "Describe how you would design a feature pipeline that serves both batch training and real-time inference.",
    ],
    followUpPatterns: [
      "How do you validate that your features are actually predictive?",
      "What happens when the feature distribution changes in production?",
      "How do you handle the train-serve skew problem?",
    ],
  },
  {
    name: "Model Evaluation & Experimentation",
    category: "domain",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Only knows accuracy as an evaluation metric",
        junior: "Understands precision/recall/F1, ROC-AUC, and basic cross-validation",
        mid: "Selects appropriate metrics for business context, designs A/B tests, understands statistical significance and power analysis",
        senior: "Designs multi-metric evaluation frameworks, runs interleaving experiments, implements guardrail metrics, handles novelty effects and Simpson's paradox",
        expert: "Designs causal inference frameworks for ML evaluation, implements bandit-based experimentation, advanced counterfactual evaluation, and organization-wide experimentation platforms",
      },
      keySignals: [
        "metric selection tied to business context",
        "statistical rigor in experimentation",
        "understanding of offline-online metric gaps",
        "guardrail metric thinking",
      ],
      redFlags: [
        "relying solely on accuracy for imbalanced problems",
        "no statistical significance testing",
        "ignoring class distribution in metric selection",
        "no awareness of p-hacking or multiple comparison issues",
      ],
    },
    prompts: [
      "How do you evaluate an ML model beyond accuracy? Walk me through your evaluation framework for a {task_type} problem.",
      "Design an A/B test to measure the impact of a new ML model in production. What metrics, sample size, and duration would you use?",
      "Your model shows a 5% improvement in offline AUC. How do you determine if this will translate to real business impact?",
      "Tell me about a time when your evaluation approach caught a problem that standard metrics would have missed.",
    ],
    followUpPatterns: [
      "How do you handle the exploration-exploitation tradeoff during experimentation?",
      "What guardrail metrics would you monitor during this experiment?",
      "How would you detect and handle novelty effects in your A/B test?",
    ],
  },
  {
    name: "MLOps & Production ML",
    category: "domain",
    duration: 6,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "No experience deploying ML models to production",
        junior: "Can serialize and deploy a model using basic tools (Flask/FastAPI), understands batch vs. real-time inference",
        mid: "Implements CI/CD for ML, model versioning, basic monitoring, containerized model serving, and automated retraining pipelines",
        senior: "Designs ML platforms with model registry, feature stores, experiment tracking, canary deployments, shadow scoring, and comprehensive observability",
        expert: "Architects enterprise MLOps platforms, implements online learning systems, multi-model orchestration, GPU cluster management, and ML governance frameworks",
      },
      keySignals: [
        "model versioning and registry strategy",
        "monitoring for data and model drift",
        "automated retraining triggers and pipelines",
        "rollback strategy for failed model deployments",
        "model serving optimization (batching, caching, quantization)",
      ],
      redFlags: [
        "no model versioning strategy",
        "no monitoring in production",
        "manual deployment processes for models",
        "no rollback plan for bad model deployments",
        "ignoring model latency requirements",
      ],
    },
    prompts: [
      "Walk me through how you take an ML model from a notebook to production. What does your MLOps pipeline look like?",
      "How do you monitor ML models in production? What signals tell you a model needs to be retrained?",
      "Tell me about a production ML incident you've dealt with. What went wrong and how did you resolve it?",
      "How do you handle model versioning, rollback, and A/B testing of models in a production environment?",
    ],
    followUpPatterns: [
      "How do you detect data drift vs. concept drift?",
      "What's your model serving architecture and how do you handle latency requirements?",
      "How do you ensure reproducibility across training runs?",
    ],
  },
  {
    name: "ML Coding",
    category: "technical",
    duration: 5,
    difficulty: "mid",
    rubric: {
      levels: {
        notExperienced: "Cannot explain how any ML algorithm works at the implementation level",
        junior: "Can explain the implementation of linear regression and k-means at a high level",
        mid: "Can walk through implementations of common algorithms (logistic regression, decision trees, basic neural networks) with correct mathematical steps",
        senior: "Can describe efficient implementations with numerical stability considerations, vectorization, and common optimization tricks",
        expert: "Can design custom loss functions, implement novel architectures from papers, and reason about computational complexity of training and inference",
      },
      keySignals: [
        "implementation-level understanding of algorithms",
        "numerical stability awareness",
        "vectorization and efficient computation thinking",
        "complexity analysis of ML training and inference",
      ],
      redFlags: [
        "only knows API calls with no understanding of internals",
        "cannot explain gradient computation for basic models",
        "no awareness of numerical issues (overflow, underflow, vanishing gradients)",
      ],
    },
    prompts: [
      "Walk me through how you would implement {algorithm} from scratch. What are the key steps?",
      "Explain the forward and backward pass of a simple neural network. What numerical issues can arise?",
      "How would you implement {ml_technique} efficiently for a large dataset that doesn't fit in memory?",
      "Describe how you would implement a custom loss function for {specific_objective}. What considerations are important?",
    ],
    followUpPatterns: [
      "What's the computational complexity of that approach?",
      "How would you handle numerical stability issues?",
      "How would you vectorize that computation for efficiency?",
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

// ── ML Interview Presets ─────────────────────────────────────────────
// Role-specific module compositions for common ML/AI positions.
// Used by template system and interview planner for auto-configuration.

export const ML_INTERVIEW_PRESETS: Record<string, {
  name: string;
  description: string;
  modules: string[];
  mode: string;
  duration: number;
}> = {
  ML_ENGINEER: {
    name: "ML Engineer Interview",
    description: "End-to-end ML engineering: system design, fundamentals, MLOps, production",
    modules: ["ML System Design", "ML Fundamentals", "MLOps & Production ML", "Problem Solving & Decision Making"],
    mode: "TECHNICAL_DEEP_DIVE",
    duration: 40,
  },
  APPLIED_SCIENTIST: {
    name: "Applied Scientist Interview",
    description: "Research-to-production: fundamentals, experimentation, feature engineering",
    modules: ["ML Fundamentals", "Model Evaluation & Experimentation", "Feature Engineering & Data Pipeline", "Communication"],
    mode: "TECHNICAL_DEEP_DIVE",
    duration: 40,
  },
  ML_PLATFORM: {
    name: "ML Platform Engineer Interview",
    description: "Infrastructure: MLOps, system design, cloud, production ML at scale",
    modules: ["MLOps & Production ML", "ML System Design", "Cloud & Infrastructure", "System Design"],
    mode: "TECHNICAL_DEEP_DIVE",
    duration: 45,
  },
  DATA_SCIENTIST: {
    name: "Data Scientist Interview",
    description: "Analytical: fundamentals, experimentation, feature engineering, problem solving",
    modules: ["ML Fundamentals", "Model Evaluation & Experimentation", "Feature Engineering & Data Pipeline", "Problem Solving & Decision Making"],
    mode: "HYBRID",
    duration: 35,
  },
};
