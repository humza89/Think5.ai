/**
 * Mock AI Provider — Deterministic responses for eval/testing
 *
 * Returns pre-seeded realistic interview plans based on input hash.
 * Same input always produces the same output for reproducible evals.
 */

import { createHash } from "crypto";
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from "./interface";

/**
 * Hash input to produce deterministic selection index.
 */
function hashInput(input: string): number {
  const hash = createHash("sha256").update(input).digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

/**
 * Pre-seeded interview plan templates that vary by candidate profile.
 */
const PLAN_TEMPLATES = [
  {
    sections: [
      { name: "Opening & Introduction", duration: 3, questions: ["Tell me about yourself and your journey to your current role.", "What motivated you to pursue this career path?"], suggestedQuestions: ["Walk me through your background."] },
      { name: "Resume Deep Dive", duration: 10, questions: ["Walk me through your most impactful project.", "What was your specific role and contribution?", "What challenges did you face and how did you overcome them?"], suggestedQuestions: ["Can you quantify the impact?", "What would you do differently?"] },
      { name: "Technical Deep Dive", duration: 10, questions: ["Describe the architecture of a system you designed.", "What tradeoffs did you consider?", "How would you scale it 10x?"], suggestedQuestions: ["What monitoring did you put in place?", "How did you handle failure modes?"] },
      { name: "Behavioral Assessment", duration: 5, questions: ["Tell me about a time you disagreed with your manager.", "How did you handle a high-pressure deadline?"], suggestedQuestions: ["What did you learn from that experience?"] },
      { name: "Closing", duration: 2, questions: ["Do you have any questions for me?"], suggestedQuestions: [] },
    ],
    hypotheses: [
      { area: "technical_depth", hypothesis: "Candidate has hands-on architecture experience", followUp: "Probe for specific design decisions and tradeoffs" },
      { area: "ownership", hypothesis: "Candidate drives projects independently", followUp: "Ask about solo vs team contributions" },
      { area: "growth", hypothesis: "Candidate shows continuous learning", followUp: "Ask about recent skills acquired" },
      { area: "leadership", hypothesis: "Candidate can influence without authority", followUp: "Ask about cross-team collaboration" },
    ],
    adaptationRules: "Adapt difficulty based on response depth. If candidate gives strong system design answers, increase complexity. If struggling, pivot to more concrete examples.",
    transitionStrategy: "Use natural conversational transitions between sections. Reference candidate's previous answers when shifting topics.",
  },
  {
    sections: [
      { name: "Warm Opening", duration: 3, questions: ["Thanks for joining. Can you give me a quick overview of your background?"], suggestedQuestions: ["What are you most excited about in your current work?"] },
      { name: "Experience Deep Dive", duration: 8, questions: ["Tell me about the project you're most proud of.", "What was the hardest technical decision you made?", "How did you measure success?"], suggestedQuestions: ["Walk me through the implementation.", "What would you change in hindsight?", "How did your team collaborate?"] },
      { name: "Problem Solving", duration: 8, questions: ["Describe a time you had to debug a critical production issue.", "How do you approach ambiguous requirements?", "What's your process for breaking down complex problems?"], suggestedQuestions: ["What tools and techniques did you use?", "How did you prioritize?"] },
      { name: "Leadership & Communication", duration: 6, questions: ["How do you handle disagreements in code review?", "Tell me about mentoring a junior engineer.", "Describe a time you had to communicate a technical concept to non-technical stakeholders."], suggestedQuestions: ["What was the outcome?", "What did you learn?"] },
      { name: "Cultural Fit & Closing", duration: 5, questions: ["What kind of engineering culture do you thrive in?", "Any questions about the role or team?"], suggestedQuestions: [] },
    ],
    hypotheses: [
      { area: "problem_solving", hypothesis: "Candidate uses structured debugging approaches", followUp: "Ask for specific debugging methodology" },
      { area: "communication", hypothesis: "Candidate can translate technical concepts", followUp: "Ask about cross-functional collaboration" },
      { area: "mentorship", hypothesis: "Candidate invests in team growth", followUp: "Ask about onboarding or knowledge sharing" },
    ],
    adaptationRules: "Calibrate difficulty to candidate's experience level. For senior candidates, focus on system design and leadership. For mid-level, emphasize hands-on problem solving.",
    transitionStrategy: "Let's shift gears and talk about [next topic]. Earlier you mentioned [reference], which connects nicely to what I want to ask next.",
  },
  {
    sections: [
      { name: "Introduction", duration: 3, questions: ["Welcome! I'd love to hear your story — how did you get into engineering?"], suggestedQuestions: ["What drew you to this specific domain?"] },
      { name: "Technical Foundation", duration: 10, questions: ["Walk me through the technical stack of your most recent project.", "Why did your team choose that architecture?", "What were the main constraints you were working with?"], suggestedQuestions: ["How did you handle data consistency?", "What monitoring strategy did you use?", "How did you approach testing?"] },
      { name: "Impact & Ownership", duration: 8, questions: ["What's the biggest impact you've had on a product or team?", "Tell me about a time you identified and drove an improvement nobody asked for.", "How do you prioritize what to work on?"], suggestedQuestions: ["Can you share specific metrics?", "What resistance did you face?"] },
      { name: "Behavioral Scenarios", duration: 5, questions: ["Describe a situation where you had to make a decision with incomplete information.", "How do you handle conflicting priorities from different stakeholders?"], suggestedQuestions: ["What framework do you use for decision-making?"] },
      { name: "Wrap Up", duration: 4, questions: ["What are you looking for in your next role?", "Do you have any questions for me?"], suggestedQuestions: [] },
    ],
    hypotheses: [
      { area: "impact", hypothesis: "Candidate quantifies their contributions", followUp: "Ask for specific metrics and business outcomes" },
      { area: "initiative", hypothesis: "Candidate is proactive beyond assigned work", followUp: "Ask about self-driven improvements" },
      { area: "decision_quality", hypothesis: "Candidate makes sound decisions under uncertainty", followUp: "Ask about decision frameworks and tradeoffs" },
      { area: "stakeholder_management", hypothesis: "Candidate navigates competing priorities", followUp: "Ask about cross-team negotiation" },
    ],
    adaptationRules: "Adapt based on the specificity of answers. Vague answers → ask for concrete examples. Strong answers → increase complexity and ask about scale.",
    transitionStrategy: "Use bridging phrases: 'That's helpful context. Building on that...', 'Interesting — that connects to something I wanted to explore...'",
  },
];

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-deterministic-v1";

  isAvailable(): boolean {
    return true;
  }

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResponse> {
    // Hash the input to select a deterministic plan
    const inputKey = messages.map((m) => m.content).join("|");
    const index = hashInput(inputKey) % PLAN_TEMPLATES.length;
    const plan = PLAN_TEMPLATES[index];

    const content = JSON.stringify(plan, null, 2);

    return {
      content,
      usage: { inputTokens: inputKey.length, outputTokens: content.length },
      model: this.model,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const response = await this.chat(messages, options);
    yield { content: response.content, done: true };
  }
}
