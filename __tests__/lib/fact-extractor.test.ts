import { describe, it, expect } from "vitest";
import { extractFactsImmediate, extractFactsBatch } from "@/lib/fact-extractor";

describe("Fact Extractor", () => {
  const makeTurn = (content: string, role = "candidate") => ({
    turnId: "turn-1",
    role,
    content,
  });

  describe("extractFactsImmediate", () => {
    it("only extracts from candidate turns", () => {
      const facts = extractFactsImmediate(makeTurn("I worked at Google for 5 years", "interviewer"));
      expect(facts).toHaveLength(0);
    });

    it("extracts percentage metrics", () => {
      const facts = extractFactsImmediate(makeTurn("I improved latency by 40%"));
      const metrics = facts.filter((f) => f.factType === "METRIC");
      expect(metrics.length).toBeGreaterThanOrEqual(1);
      expect(metrics.some((m) => m.content.includes("40%"))).toBe(true);
    });

    it("extracts dollar amounts", () => {
      const facts = extractFactsImmediate(makeTurn("The project saved $2.5M in costs"));
      const metrics = facts.filter((f) => f.factType === "METRIC");
      expect(metrics.some((m) => m.content.includes("$2.5M"))).toBe(true);
    });

    it("extracts known companies", () => {
      const facts = extractFactsImmediate(makeTurn("I worked at Google for three years"));
      const companies = facts.filter((f) => f.factType === "COMPANY");
      expect(companies.some((c) => c.content === "Google")).toBe(true);
      expect(companies[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("extracts date references", () => {
      const facts = extractFactsImmediate(makeTurn("I joined in 2019 and left in 2022"));
      const dates = facts.filter((f) => f.factType === "DATE");
      expect(dates.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts technical skills", () => {
      const facts = extractFactsImmediate(makeTurn("I use React and TypeScript daily, with PostgreSQL for data"));
      const skills = facts.filter((f) => f.factType === "TECHNICAL_SKILL");
      const skillNames = skills.map((s) => s.content);
      expect(skillNames).toContain("React");
      expect(skillNames).toContain("TypeScript");
      expect(skillNames).toContain("PostgreSQL");
    });

    it("extracts responsibilities", () => {
      const facts = extractFactsImmediate(makeTurn("I led a team of 8 engineers to redesign the payment system"));
      const responsibilities = facts.filter((f) => f.factType === "RESPONSIBILITY");
      expect(responsibilities.length).toBeGreaterThanOrEqual(1);
    });

    it("deduplicates by content", () => {
      const facts = extractFactsImmediate(makeTurn("I use React. I really love React and React is great."));
      const reactSkills = facts.filter((f) => f.factType === "TECHNICAL_SKILL" && f.content === "React");
      expect(reactSkills).toHaveLength(1);
    });

    it("returns empty for empty content", () => {
      expect(extractFactsImmediate(makeTurn(""))).toHaveLength(0);
    });
  });

  describe("extractFactsBatch", () => {
    it("extracts across multiple turns", () => {
      const turns = [
        makeTurn("I worked at Google"),
        makeTurn("We used Kubernetes and Docker"),
        makeTurn("How about your experience?", "interviewer"),
      ];
      const facts = extractFactsBatch(turns);
      expect(facts.filter((f) => f.factType === "COMPANY").length).toBeGreaterThanOrEqual(1);
      expect(facts.filter((f) => f.factType === "TECHNICAL_SKILL").length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty for empty array", () => {
      expect(extractFactsBatch([])).toHaveLength(0);
    });
  });
});
