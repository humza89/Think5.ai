import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";
import { openai } from "@/lib/openai"; // Suppose a library wrapper is set up

const prisma = new PrismaClient();

// In a real app, this route might be triggered by a VAPI webhook or background job
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate (could be Service Worker auth or Candidate confirming finish)
    const { user, profile } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { interviewId, transcript } = await req.json();

    if (!interviewId || !transcript) {
      return NextResponse.json({ error: "Interview ID and Transcript required" }, { status: 400 });
    }

    // 2. Mocking an OpenAI Call for MVP (in production use the actual OpenAI SDK)
    /*
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: "Grade this interview based on standard rubric..."}, {role: "user", content: JSON.stringify(transcript)}],
        response_format: { type: "json_object" }
      });
      const aiResults = JSON.parse(completion.choices[0].message.content || "{}");
    */

    // Simulate GPT-4o processing delay
    await new Promise((r) => setTimeout(r, 2000));

    // Simulated AI Data based on the PRD Enterprise rubric
    const mockAiResults = {
      overallScore: 85,
      recommendation: "STRONG_YES",
      summary: "Candidate demonstrated excellent technical depth and strong communication skills. They appropriately utilized the STAR method when answering behavioral questions and showcased deep domain knowledge in Project Management.",
      technicalSkills: [
        { skill: "Agile Methodologies", rating: 9, description: "Clear understanding of sprint planning and retrospective phases.", evidence: "Candidate cited a recent project where they reduced sprint spillover by 20%." },
        { skill: "Stakeholder Management", rating: 8, description: "Strong ability to align distinct parties.", evidence: "Mentioned managing expectations across 3 cross-functional teams." }
      ],
      softSkills: [
        { skill: "Communication", rating: 9, description: "Articulate and structured answers." },
        { skill: "Problem Solving", rating: 8, description: "Approaches conflict logically." }
      ],
      domainExpertise: 88,
      clarityStructure: 90,
      problemSolving: 85,
      communicationScore: 92,
      measurableImpact: 80,
      strengths: ["Clear communication", "Technical domain expertise", "Structured problem solving"],
      areasToImprove: ["Could provide more specific metric-driven results in behavioral answers.", "Occasionally spoke too rapidly."]
    };

    // 3. Save to InterviewReport table
    const report = await prisma.interviewReport.create({
      data: {
        interviewId,
        technicalSkills: mockAiResults.technicalSkills,
        softSkills: mockAiResults.softSkills,
        domainExpertise: mockAiResults.domainExpertise,
        clarityStructure: mockAiResults.clarityStructure,
        problemSolving: mockAiResults.problemSolving,
        communicationScore: mockAiResults.communicationScore,
        measurableImpact: mockAiResults.measurableImpact,
        summary: mockAiResults.summary,
        strengths: mockAiResults.strengths,
        areasToImprove: mockAiResults.areasToImprove,
        recommendation: mockAiResults.recommendation,
        overallScore: mockAiResults.overallScore,
      }
    });

    // 4. Update the parent Interview record
    await prisma.interview.update({
      where: { id: interviewId },
      data: { 
        status: "COMPLETED",
        overallScore: mockAiResults.overallScore,
        completedAt: new Date(),
        transcript: transcript
      }
    });

    return NextResponse.json({ success: true, report });

  } catch (error) {
    console.error("Feedback generation error:", error);
    return NextResponse.json({ error: "Failed to generate AI feedback" }, { status: 500 });
  }
}
